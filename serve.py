"""Serve the page of Cosmopoiesis on this computer.

The page is served from this directory, and the code it shares from the repository's
``domains/``, ``foundations/`` and ``visualization/`` under the same paths, with the data cache
at ``/data/``. The spacetime it draws (time scales, the Earth's and the Moon's orientation, the
bodies' positions, frames and their holonomy) is computed by the engine (``engine.py``), kept alive
between requests; the terrain of the Earth and the Moon is built by the data library's tile service
(``data/tiles``) from the sources in the cache, a tile at a time, and kept. The protocol is in the
README, §5:

    GET  /api/engine                         whether the engine is built and current, and which sources are in the cache
    POST /api/engine                         a request to the engine: {"op": "status" | "time" | "frames" | "ephemeris"
                                             | "bodies" | "transform" | "holonomy" | "convert" | "address" | "geodesic"
                                             | "satellites" | "instruments", ...}; the server adds the world's sources
                                             (and for "satellites" turns "groups" into the files of their element sets)
    GET  /api/clock                          the mission clock: TT at a wall instant, its rate, running or not
    POST /api/clock                          {"action": "set" | "rate" | "play" | "pause" | "present", "time"?: text, "tt_s"?, "rate"?}
    GET  /api/bus?since=n&wait=s             the readings delivered since sequence n (waiting up to s seconds for one)
    GET  /api/bus/latest                     the latest reading of every sensor, and the recent events
    GET  /api/acquisition                    the acquisition session: its sensors, servers, policy, statistics, sources
    POST /api/acquisition                    {"observer"?: address, "policy"?: {...}, "sensors_add"?, "sensors_remove"?, "now"?: [sensor ids]}
    GET  /api/acquisition/trace?since=t      the jobs since a wall time: release, start, end, deadline, worker
    POST /api/acquisition/analyse            {"rate", "horizon_s", "burst"?}: the declared set simulated under each policy
    GET  /api/satellites                     the groups of satellites' element sets on this computer (CelesTrak's)
    GET  /api/terrain                        what each body's terrain needs, and whether it is in the cache
    GET  /tiles/terrain/<body>/<z>/<x>/<y>   a terrain tile (data/tiles/terrain.py's encoding), built on first request;
                                             ?synthetic=1 adds the labelled synthetic detail below the data's resolution

The engine and the data are made by the application's recipe (``recipe.json``), which the page may run:

    GET  /setup                              its steps, and whether each is done
    POST /setup/run[?steps=a,b&again=1]      run the missing steps, or the chosen ones again

Only 127.0.0.1 is bound unless ``--host`` says otherwise; on a public address the recipe needs the
server's token (``--token``), and requests are held within smaller limits.

Usage::

    python applications/cosmopoiesis-lab/serve.py [--host 127.0.0.1] [--port 8930] [--open]

then open http://127.0.0.1:8930/ in a browser.
"""

from __future__ import annotations

import argparse
import http.server
import json
import re
import sys
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parents[1]
CACHE = ROOT / "data" / "cache"
MOUNTS = {
    "/domains/": ROOT / "domains",
    "/foundations/": ROOT / "foundations",
    "/visualization/": ROOT / "visualization",
    "/data/": CACHE,
}
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}
# Paths of the repository that are never served: the work's own history and the preliminary design.
HIDDEN = re.compile(r"(^|/)(\.git|preliminary_design[^/]*)(/|$)")

sys.path.insert(0, str(APP))
sys.path.insert(0, str(ROOT / "data"))
import engine  # noqa: E402
import runtime  # noqa: E402
from tiles.pyramid import TileKey  # noqa: E402
from tiles.terrain import TerrainService  # noqa: E402

ENGINE = engine.Engine()
TERRAIN = TerrainService(CACHE)
CLOCK = runtime.MissionClock()
RECIPE = None
WRITES = {"allowed": True, "token": None}
LIMITS = {"bytes": 256 * 1024, "samples": 4000, "positions": 10000, "seconds": 60.0, "max_level": {"earth": 18, "moon": 14}}
OPS = {"status", "time", "frames", "ephemeris", "bodies", "transform", "holonomy", "convert", "address", "geodesic", "satellites", "instruments",
       "field_lines", "field_map"}
SATELLITES = CACHE / "celestrak-gp"
# The Moon's field maps, which take the engine seconds and do not change: the last few kept.
FIELD_MAPS: dict[str, dict] = {}
ACQUISITION = runtime.Acquisition(engine, CLOCK, TERRAIN, SATELLITES, address_engine=ENGINE)
TILE = re.compile(r"^/tiles/terrain/(earth|moon)/(\d+)/(\d+)/(\d+)$")
# Terrain tiles are built a few at a time, so that a page asking for many does not starve the rest.
BUILDS = threading.BoundedSemaphore(8)


def recipe_job():
    global RECIPE
    if RECIPE is None:
        sys.path.insert(0, str(ROOT / "data" / "acquisition"))
        import recipe
        RECIPE = recipe.Job(APP / "recipe.json", ROOT)
    return RECIPE


def write_refusal(handler) -> str | None:
    if not WRITES["allowed"]:
        return "this server does not run its recipe: start it with --token to allow it with a token"
    token = WRITES["token"]
    if token and handler.headers.get("Authorization", "") != f"Bearer {token}":
        return "running the recipe on this server needs its token"
    return None


def engine_refusal(body: dict) -> str | None:
    """Why a request to the engine is refused, or None."""
    op = body.get("op")
    if op not in OPS:
        return f"unknown op {op!r}: one of {', '.join(sorted(OPS))}"
    if op == "address" and (not isinstance(body.get("text"), str) or len(body["text"]) > 2000):
        return "address: the text of an address, at most 2000 characters"
    if op in ("ephemeris", "bodies"):
        try:
            span, step = float(body.get("span", 86400)), float(body.get("step", 600))
        except (TypeError, ValueError):
            return "ephemeris: span and step are numbers of seconds"
        if not step >= 1 or span / step + 1 > LIMITS["samples"]:
            return f"{op}: at most {LIMITS['samples']} samples, a step of at least 1 s"
    if op == "field_map":
        try:
            step, degree = float(body.get("step_deg", 1.0)), int(body.get("synthetic_degree", 720))
        except (TypeError, ValueError):
            return "field_map: step_deg and synthetic_degree are numbers"
        if not 0.5 <= step <= 5 or not 450 <= degree <= 720:
            return "field_map: a step of 0.5° to 5°, finer scales to degree 720 at most"
    if op == "transform" and len(body.get("positions") or []) > LIMITS["positions"]:
        return f"transform: at most {LIMITS['positions']} positions"
    if op == "satellites":
        groups = body.get("groups")
        if not isinstance(groups, list) or not groups or not all(isinstance(g, str) and re.fullmatch(r"[a-z0-9-]+", g) for g in groups):
            return 'satellites: name the groups of element sets, e.g. ["stations"]'
        missing = [g for g in groups if not (SATELLITES / g / "gp.tle").exists()]
        if missing:
            return f"satellites: no element sets of {', '.join(missing)} on this computer (the recipe's celestrak steps fetch them)"
    return None


def satellite_groups() -> list[dict]:
    """The groups of element sets on this computer, with their retrieval and count."""
    out = []
    for folder in sorted(SATELLITES.glob("*")) if SATELLITES.exists() else []:
        tle = folder / "gp.tle"
        if not tle.exists():
            continue
        retrieved = None
        try:
            retrieved = json.loads((folder / "retrieval.json").read_text(encoding="utf-8")).get("retrieved_at")
        except (OSError, ValueError):
            pass
        lines = [line for line in tle.read_text(encoding="utf-8", errors="replace").splitlines() if line.startswith("1 ")]
        out.append({"group": folder.name, "count": len(lines), "retrieved_at": retrieved})
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def translate_path(self, path: str) -> str:
        path = urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0])
        prefix = next((p for p in MOUNTS if path.startswith(p)), None)
        base, rel = (MOUNTS[prefix], path[len(prefix):]) if prefix else (APP, path.lstrip("/"))
        target = (base / rel).resolve()
        if (target != base and base not in target.parents) or HIDDEN.search(rel):
            return str(base / "__outside__")
        return str(target)

    def do_GET(self) -> None:
        url = urllib.parse.urlparse(self.path)
        if url.path == "/api/engine":
            return self.reply_json({**engine.status(), "limits": LIMITS}, 200)
        if url.path == "/api/satellites":
            return self.reply_json({"groups": satellite_groups()}, 200)
        if url.path == "/api/terrain":
            return self.reply_json({"bodies": TERRAIN.available(), "max_level": LIMITS["max_level"]}, 200)
        if url.path == "/setup":
            return self.reply_json(*self.recipe_request(url))
        if url.path == "/api/clock":
            return self.reply_json(CLOCK.state(), 200)
        if url.path == "/api/bus":
            q = dict(urllib.parse.parse_qsl(url.query))
            try:
                since, wait = int(q.get("since", "0")), float(q.get("wait", "0"))
            except ValueError:
                return self.reply_json({"error": "since is a sequence number, wait a number of seconds"}, 400)
            return self.reply_json(ACQUISITION.bus.since(since, wait=min(wait, 20.0)), 200)
        if url.path == "/api/bus/latest":
            return self.reply_json(ACQUISITION.bus.snapshot(), 200)
        if url.path == "/api/acquisition":
            return self.reply_json(ACQUISITION.describe(), 200)
        if url.path == "/api/acquisition/trace":
            q = dict(urllib.parse.parse_qsl(url.query))
            since = float(q.get("since", "0") or 0)
            records = [r for r in list(ACQUISITION.trace) if (r.get("end") or 0) > since][-3000:]
            return self.reply_json({"records": records, "now": time.time()}, 200)
        if url.path == "/api/instruments":
            answer = ENGINE.ask({"op": "instruments"}, timeout=LIMITS["seconds"])
            if "error" not in answer:
                answer["external"] = [{**a.spec(), "about": a.about} for a in ACQUISITION.adapters.values()]
            return self.reply_json(answer, 200 if "error" not in answer else 422)
        m = TILE.match(url.path)
        if m:
            return self.tile_request(m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), dict(urllib.parse.parse_qsl(url.query)))
        return super().do_GET()

    def do_POST(self) -> None:
        url = urllib.parse.urlparse(self.path)
        if url.path == "/setup/run":
            return self.reply_json(*self.recipe_request(url))
        if url.path in ("/api/clock", "/api/acquisition", "/api/acquisition/analyse"):
            body = self.read_body()
            if body is None:
                return
            refusal = write_refusal(self) if url.path != "/api/acquisition/analyse" else None
            if refusal:
                return self.reply_json({"error": refusal}, 403)
            return self.reply_json(*self.runtime_request(url.path, body))
        if url.path == "/api/engine":
            body = self.read_body()
            if body is None:
                return
            refusal = engine_refusal(body)
            if refusal:
                return self.reply_json({"error": refusal}, 400)
            body.pop("sources", None)  # the world's sources are the server's to name
            body.pop("files", None)    # and so are the files it reads
            if body["op"] == "satellites":
                body["files"] = [{"path": str(SATELLITES / g / "gp.tle"), "group": g} for g in body.pop("groups")]
            if body["op"] == "address":
                body["now_unix"] = time.time()
            if body["op"] == "field_map":
                key = json.dumps(body, sort_keys=True)
                if key not in FIELD_MAPS:
                    answer = ENGINE.ask(body, timeout=LIMITS["seconds"])
                    if "error" in answer:
                        return self.reply_json(answer, 422)
                    while len(FIELD_MAPS) >= 6:
                        FIELD_MAPS.pop(next(iter(FIELD_MAPS)))
                    FIELD_MAPS[key] = answer
                return self.reply_json(FIELD_MAPS[key], 200)
            answer = ENGINE.ask(body, timeout=LIMITS["seconds"])
            return self.reply_json(answer, 200 if "error" not in answer else 422)
        self.send_error(404)

    def runtime_request(self, path: str, body: dict) -> tuple[dict, int]:
        try:
            if path == "/api/clock":
                tt = body.get("tt_s")
                if body.get("time"):
                    a = ENGINE.ask({"op": "time", "time": str(body["time"])}, timeout=20)
                    if "error" in a:
                        return {"error": a["error"]}, 422
                    jd = a["scales"]["TT"]["jd"]
                    tt = ((jd[0] - 2451545.0) + jd[1]) * 86400.0
                state = CLOCK.command(str(body.get("action", "read")), tt=tt, rate=body.get("rate"))
                ACQUISITION.wake.set()
                return state, 200
            if path == "/api/acquisition":
                answer = {}
                if body.get("observer") or body.get("policy") or body.get("sensors_add") or body.get("sensors_remove"):
                    answer = ACQUISITION.configure(observer=body.get("observer"), policy=body.get("policy"),
                                                   sensors_add=body.get("sensors_add"), sensors_remove=body.get("sensors_remove"))
                    if "error" in answer:
                        return answer, 422
                if isinstance(body.get("now"), list):
                    ACQUISITION.request_now([str(x) for x in body["now"]])
                return ACQUISITION.describe(), 200
            if path == "/api/acquisition/analyse":
                answer = ACQUISITION.analyse(body)
                return answer, 200 if "error" not in answer else 422
        except (TypeError, ValueError) as error:
            return {"error": str(error)}, 400
        return {"error": "unknown"}, 404

    def tile_request(self, body: str, z: int, x: int, y: int, query: dict) -> None:
        if z > LIMITS["max_level"][body]:
            return self.reply_json({"error": f"no terrain of {body} below level {LIMITS['max_level'][body]}"}, 404)
        key = TileKey(z, x, y)
        try:
            key.check()
        except ValueError as error:
            return self.reply_json({"error": str(error)}, 404)
        started = time.time()
        try:
            with BUILDS:
                waited = time.time() - started
                data = TERRAIN.tile(body, key)
            if query.get("synthetic") == "1":
                from tiles.synthetic import with_detail
                data = with_detail(TERRAIN, body, data)
        except FileNotFoundError as error:
            return self.reply_json({"error": f"the terrain's sources are not in the cache ({error}); run the recipe"}, 503)
        except Exception as error:  # a source that fails is reported for this tile; the page draws its parent
            return self.reply_json({"error": f"terrain {body} {z}/{x}/{y}: {error}"}, 502)
        took = time.time() - started
        if took > 3:
            print(f"slow tile {body} {z}/{x}/{y}: {took:.1f} s ({waited:.1f} s waiting for a builder)", file=sys.stderr, flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > LIMITS["bytes"]:
            self.reply_json({"error": "the request is too large"}, 413)
            return None
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError("a request is a JSON object")
            return body
        except ValueError as error:
            self.reply_json({"error": f"not a request: {error}"}, 400)
            return None

    def recipe_request(self, url) -> tuple[dict, int]:
        refusal = write_refusal(self)
        policy = {"writable": refusal is None, "refusal": refusal}
        try:
            if url.path == "/setup":
                return {**recipe_job().view(), **policy}, 200
            if refusal:
                return {"message": refusal, **policy}, 403
            query = dict(urllib.parse.parse_qsl(url.query))
            steps = [s for s in query.get("steps", "").split(",") if s] or None
            return {**recipe_job().start(steps, again=query.get("again") == "1"), **policy}, 200
        except RuntimeError as error:
            return {"message": str(error)}, 409

    def reply_json(self, body: dict, code: int) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self) -> None:
        if not any(h.lower().startswith(b"cache-control") for h in getattr(self, "_headers_buffer", [])):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Serve the page of Cosmopoiesis locally.")
    parser.add_argument("--host", default="127.0.0.1", help="the address to bind; 0.0.0.0 for every interface")
    parser.add_argument("--port", type=int, default=8930)
    parser.add_argument("--open", action="store_true", help="open the page in the default browser")
    parser.add_argument("--token", help="on a public address, the token that allows running the recipe")
    args = parser.parse_args(argv)
    public = args.host not in ("127.0.0.1", "localhost", "::1")
    if public:
        WRITES.update(allowed=bool(args.token), token=args.token)
        LIMITS.update(bytes=64 * 1024, samples=1500, positions=1000, seconds=20.0)
    if not engine.status()["current"]:
        print("The engine is not built from the present sources. Build it from the page, or run:\n"
              "  python data/acquisition/recipe.py applications/cosmopoiesis-lab/recipe.json", file=sys.stderr)
    # The terrain's global grids are opened before the first tile asks for them.
    def warm() -> None:
        for open_source in (TERRAIN.etopo, TERRAIN.geoid, TERRAIN.land):
            try:
                open_source()
            except (OSError, ValueError, KeyError):
                pass  # a missing source is reported by /api/terrain and by the tile that needs it
    threading.Thread(target=warm, daemon=True).start()
    # The acquisition runs from the start: the clock ticks, the sensors read, the bus fills.
    if engine.status()["built"]:
        ACQUISITION.start()
    server = Server((args.host, args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    where = url if not public else f"{url} and on {args.host}"
    print(f"Cosmopoiesis at {where}  (Ctrl+C to stop)", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        ENGINE.close()
        ACQUISITION.engine.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
