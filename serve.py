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
                                             | "satellites" | "instruments" | "fields" | "field.sample" | "field.curves"
                                             | "field_lines" | "field_map" | "probe_volume" | "mission.start" | "mission.step"
                                             | "mission.state" | "mission.map" | "mission.stop" | "mission.calibrate", ...};
                                             the server adds the world's sources (and for "satellites" turns "groups"
                                             into the files of their element sets); a field read without a time (one
                                             that does not depend on it) is kept, the last few, as the Moon's maps are
    POST /api/engine {"op": "probe_volume", "at": address | "observer", "time"?: text, "family" | "field", "edge_m", "n",
                      "quantities"?, "settings"?, "encoding"?: "json" | "f32"}
                                             a family, or a field of the world, read in the n³ cells of a cube about an
                                             event (the engine's neighbourhood.hpp and fields.hpp); the server puts the
                                             observer's address for "observer"
                                             and the mission clock's instant where no time is given, and adds what the
                                             acquisition session's world was last told (the satellites' element sets,
                                             the solar wind, the present, the seed), so that the cube reads the world the
                                             session's sensors read, in the page's engine, without pausing the session's
    POST /api/engine {"op": "beneath.section", "at"?: "observer" | {"latitude_deg", "longitude_deg", "body"}, "azimuth_deg",
                      "half_m", "step_m"?, "swath_m"?}
                                             the Earth (or the Moon) cut along a geodesic through the observer or a place:
                                             the engine's samples, CRUST1.0's columns and PREM's shells (beneath.hpp), with
                                             the server's terrain along it (the data library's tiles: ETOPO 2022 or
                                             Terrarium on the Earth, its sea floor and its sea apart; LOLA on the Moon) and
                                             Global CMT's earthquakes within the swath (the product events-gcmt); the last
                                             few kept
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
import math
import os
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
LIMITS = {"bytes": 256 * 1024, "samples": 4000, "positions": 10000, "seconds": 60.0, "max_level": {"earth": 18, "moon": 14},
          "probe": {"n": [2, 24], "edge_m": [1.0, 2e7], "threads": min(8, os.cpu_count() or 4)}}
OPS = {"status", "time", "frames", "ephemeris", "bodies", "transform", "holonomy", "convert", "address", "geodesic", "satellites", "instruments",
       "fields", "field.sample", "field.curves", "field_lines", "field_map", "probe_volume", "beneath.section",
       "mission.start", "mission.step", "mission.state", "mission.map", "mission.stop", "mission.calibrate"}
# The missions' requests that change what every viewer sees: allowed as the clock's and the acquisition's are.
MISSION_WRITES = {"mission.start", "mission.step", "mission.stop"}
# A mission's bounds in one request: its clock's step, a map's points a side, a calibration's truths.
MISSION_LIMITS = {"seconds": 3600.0, "n": 61, "seeds": 24, "calibration_n": 7}
# The most points a field may be read at in one request, and the most seeds of its curves.
FIELD_LIMITS = {"points": 1 << 20, "seeds": 512}
# The engine's instrument families, read from it once, for the declared costs that bound a cube.
FAMILIES: dict[str, dict] = {}
SATELLITES = CACHE / "celestrak-gp"
# The Moon's field maps, and fields read without a time, which take the engine seconds and do not change:
# the last few kept.
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


def families() -> dict[str, dict]:
    if not FAMILIES:
        answer = ENGINE.ask({"op": "instruments"}, timeout=LIMITS["seconds"])
        FAMILIES.update({f["family"]: f for f in answer.get("families", [])})
    return FAMILIES


def probe_refusal(body: dict) -> str | None:
    """Why a cube is refused, or None: its centre, family, cells, edge and encoding, and its cost here, the cells
    times the family's declared cost over this server's threads, against the seconds a request may take."""
    limits = LIMITS["probe"]
    if not isinstance(body.get("at"), str) or not body["at"].strip() or len(body["at"]) > 2000:
        return 'probe_volume: "at" is the centre\'s address, or "observer"; at most 2000 characters'
    named = [k for k in ("family", "field") if isinstance(body.get(k), str) and body[k]]
    if len(named) != 1:
        return 'probe_volume: name an instrument family, as "magnetometer.wmm2025", or a field of the world, as "earth.magnetic"'
    n, edge = body.get("n"), body.get("edge_m")
    if isinstance(n, float) and n.is_integer():
        n = body["n"] = int(n)
    if not isinstance(n, int) or isinstance(n, bool) or not limits["n"][0] <= n <= limits["n"][1]:
        return f"probe_volume: n, the cells along an edge, is a whole number from {limits['n'][0]} to {limits['n'][1]}"
    if not isinstance(edge, (int, float)) or isinstance(edge, bool) or not limits["edge_m"][0] <= edge <= limits["edge_m"][1]:
        return "probe_volume: edge_m, the cube's edge, is from 1 m to 20 000 km"
    q = body.get("quantities")
    if q is not None and (not isinstance(q, list) or len(q) > 64 or not all(isinstance(x, str) for x in q)):
        return "probe_volume: quantities are a list of names, at most 64"
    if body.get("settings") is not None and not isinstance(body["settings"], dict):
        return "probe_volume: settings are the family's, an object"
    if body.get("encoding", "json") not in ("json", "f32"):
        return "probe_volume: the encoding is json or f32"
    if body.get("time") is not None and not isinstance(body["time"], str):
        return "probe_volume: a time is text, as 2026-10-28T12:00:00Z; without one, the mission clock's instant"
    family = families().get(body.get("family") or "")
    if family:  # an unknown or declared family is refused by the engine, which says why
        seconds = n ** 3 * float(family.get("cost_s", 0.0)) / limits["threads"]
        if seconds > LIMITS["seconds"]:
            return (f"probe_volume: {n}³ cells of {body['family']} at its declared {float(family['cost_s']):g} s a reading, over "
                    f"{limits['threads']} threads, take some {seconds:.0f} s, beyond this server's {LIMITS['seconds']:g} s: ask for fewer cells")
    return None


# ---- the world beneath: a section through the Earth or the Moon (decision 0010) ---------------------

SECTIONS: dict[str, dict] = {}
GCMT: dict = {}
SECTION_LIMITS = {"half_m": [1e3, 5000e3], "samples": 2001, "swath_m": 500e3}


def section_refusal(body: dict) -> str | None:
    at = body.get("at", "observer")
    if at != "observer" and not (isinstance(at, dict) and all(isinstance(at.get(k), (int, float)) for k in ("latitude_deg", "longitude_deg"))
                                 and at.get("body", "earth") in ("earth", "moon")):
        return 'beneath.section: "at" is "observer" or {"latitude_deg", "longitude_deg", "body": "earth" | "moon"}'
    try:
        az, half = float(body["azimuth_deg"]), float(body["half_m"])
        step = float(body.get("step_m", half / 200))
        swath = float(body.get("swath_m", 100e3))
    except (KeyError, TypeError, ValueError):
        return "beneath.section: azimuth_deg and half_m are numbers (step_m and swath_m too, if given)"
    lo, hi = SECTION_LIMITS["half_m"]
    if (not (lo <= half <= hi) or not step > 0 or 2 * half / step + 1 > SECTION_LIMITS["samples"]
            or not 0 <= swath <= SECTION_LIMITS["swath_m"] or not math.isfinite(az)):
        return (f"beneath.section: a half-length from {lo / 1e3:.0f} to {hi / 1e3:.0f} km, at most {SECTION_LIMITS['samples']} samples, "
                f"a swath of at most {SECTION_LIMITS['swath_m'] / 1e3:.0f} km")
    return None


def gcmt_events() -> dict:
    """Global CMT's centroids, from the data library's product events-gcmt, read once: arrays of latitude,
    longitude, depth, magnitude and time, with their names; a reason when the product is not in the cache."""
    if not GCMT:
        import numpy as np
        try:
            data = json.loads((CACHE / "products" / "events-gcmt.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            GCMT["missing"] = "Global CMT is not in the cache (python data/acquisition/fetch.py gcmt; python data/products/mechanism_catalog.py)"
            return GCMT
        f = {k: i for i, k in enumerate(data["fields"])}
        ev = data["events"]

        def col(k):
            return np.array([e[f[k]] for e in ev], dtype=float)

        GCMT.update(lat=col("lat"), lon=col("lon"), depth_km=col("depth_km"), mw=col("mw"), time_ms=col("time_ms"),
                    name=[e[f["name"]] for e in ev], region=[e[f["region"]] for e in ev], window=data.get("window", {}),
                    title=data.get("title", "Global CMT"), count=len(ev))
    return GCMT


def terrain_along(body: str, lons, lats, step_m: float) -> dict:
    """The heights of the ground or the sea floor at points (orthometric on the Earth, above the Moon's
    sphere), whether each is under the sea, and what they come from: ETOPO 2022 at 5' for steps of 4 km
    and more, else Terrarium at the zoom of half the step (ETOPO beyond Mercator's latitudes); LOLA on the
    Moon at the grid nearest half the step."""
    import numpy as np
    out: dict = {}
    if body == "earth":
        heights = np.full(lons.shape, np.nan)
        sources: list[str] = []
        resolution = TERRAIN.etopo().resolution_m
        polar = np.abs(lats) > 85.05
        if step_m < 4000 and not polar.all():
            mid = float(np.cos(np.radians(np.median(lats))))
            zoom = int(min(12, max(5, math.ceil(math.log2(40075016.686 * max(mid, 0.05) / (256 * step_m / 2))))))
            try:
                values, (res_land, _res_sea), src = TERRAIN.terrarium().sample(lons[~polar], lats[~polar], zoom)
                heights[~polar] = values
                resolution = float(np.median(res_land))
                # The tiles name their files; the datasets are what a reader needs (SRTM, GMTED, ETOPO1, ...).
                datasets = sorted({x.split("/")[0].upper() for x in src})
                sources.append(f"Terrarium z{zoom}" + (f" ({', '.join(datasets)})" if datasets else ""))
            except Exception as error:  # the network: fall back to the grid in the cache, and say so
                sources.append(f"Terrarium unreachable ({type(error).__name__}); ETOPO 2022 instead")
        inland = TERRAIN.land().inland(lons, lats)
        # SRTM writes water as 0 m: where Terrarium has 0 at sea, the sea floor is ETOPO's.
        rest = ~np.isfinite(heights) | ((heights == 0) & ~inland)
        if rest.any():
            heights[rest] = TERRAIN.etopo().sample(lons[rest], lats[rest])
            sources.append("ETOPO 2022, 5′ (NOAA NCEI)" + (", where Terrarium has 0 m at sea" if step_m < 4000 else ""))
        sea = (heights < 0) & ~inland
        out.update(height_m=heights, sea=sea, sources=sources, resolution_m=resolution,
                   datum="orthometric: above mean sea level (the sources' geoids); the sea's surface at 0")
    else:
        ppd = 4 if step_m >= 7000 else 16 if step_m >= 1800 else 64 if step_m >= 470 else 128
        h, measured = TERRAIN.lola().sample(lons, lats, ppd)
        out.update(height_m=np.asarray(h, dtype=float), sea=np.zeros(lons.shape, dtype=bool), sources=[f"LOLA LDEM_{ppd} (NASA GSFC)"],
                   resolution_m=1737.4e3 * math.radians(1 / ppd), measured=np.asarray(measured, dtype=bool),
                   datum="above the Moon's sphere of 1737.4 km")
    out["height_m"] = [None if not math.isfinite(float(x)) else round(float(x), 2) for x in out["height_m"]]
    out["sea"] = [bool(x) for x in out["sea"]]
    if "measured" in out:
        out["measured"] = [bool(x) for x in out["measured"]]
    return out


def beneath_section(body: dict) -> tuple[dict, int]:
    """A section through the observer or a place: the engine's, with the terrain along it and the
    earthquakes near it."""
    import numpy as np
    at = body.get("at", "observer")
    place = ACQUISITION.observer_place if at == "observer" else at
    if not place:
        return {"error": "beneath.section: there is no observer yet"}, 422
    which = place.get("body", "earth")
    if which not in ("earth", "moon"):
        return {"error": f"beneath.section: the Earth or the Moon, not {which}"}, 422
    lat, lon = float(place["latitude_deg"]), float(place["longitude_deg"])
    half, az = float(body["half_m"]), float(body["azimuth_deg"]) % 360
    step = float(body.get("step_m", half / 200))
    swath = float(body.get("swath_m", 100e3))
    key = json.dumps([which, round(lat, 5), round(lon, 5), round(az, 3), half, step, swath])
    if key in SECTIONS:
        return SECTIONS[key], 200
    request = {"op": "beneath.section", "body": which, "latitude_deg": lat, "longitude_deg": lon, "azimuth_deg": az,
               "half_m": half, "step_m": step, "swath_m": swath, "events": []}
    chosen = np.zeros(0, dtype=int)
    catalogue: dict = {}
    if which == "earth":
        g = gcmt_events()
        if "missing" in g:
            catalogue = {"missing": g["missing"]}
        else:
            # Those within reach of the section by the haversine on the mean sphere, for the engine to place exactly.
            p1, p2 = math.radians(lat), np.radians(g["lat"])
            h = np.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(np.radians(g["lon"] - lon) / 2) ** 2
            reach = 2 * np.arcsin(np.minimum(1, np.sqrt(h))) * 6371.0088e3
            chosen = np.nonzero(reach <= 1.02 * (half + swath) + 20e3)[0]
            request["events"] = [[float(g["lat"][i]), float(g["lon"][i]), float(g["depth_km"][i]) * 1e3, float(g["mw"][i])] for i in chosen]
            catalogue = {"title": g["title"], "window": g["window"], "count": g["count"],
                         "about": "centroids of earthquakes since 1976, mostly of magnitude 5 and more; depth below the surface, as the catalogue gives it"}
    answer = ENGINE.ask(request, timeout=LIMITS["seconds"])
    if "error" in answer:
        return answer, 422
    events = []
    if which == "earth" and "missing" not in catalogue:
        for i, along, across in answer.get("events", []):
            k = int(chosen[int(i)])
            events.append({"along_m": along, "across_m": across, "depth_m": float(GCMT["depth_km"][k]) * 1e3, "magnitude": float(GCMT["mw"][k]),
                           "time_utc": time.strftime("%Y-%m-%d", time.gmtime(GCMT["time_ms"][k] / 1000)), "name": GCMT["name"][k],
                           "region": GCMT["region"][k]})
    answer["events"] = events
    answer["catalogue"] = catalogue
    points = answer["points"]
    try:
        answer["terrain"] = terrain_along(which, np.array(points["longitude_deg"]), np.array(points["latitude_deg"]), step)
    except (OSError, ValueError, KeyError) as error:
        answer["terrain"] = {"missing": f"the terrain's sources are not in the cache ({error})"}
    while len(SECTIONS) >= 8:
        SECTIONS.pop(next(iter(SECTIONS)))
    SECTIONS[key] = answer
    return answer, 200


def mission_refusal(op: str, body: dict) -> str | None:
    """Why a mission's request is refused, or None."""
    session = body.get("session", "default")
    if not isinstance(session, str) or not 0 < len(session) <= 40:
        return "mission: a session's name, at most 40 characters"
    try:
        if op == "mission.step" and not 0 <= float(body.get("seconds", 0)) <= MISSION_LIMITS["seconds"]:
            return f"mission.step: at most {MISSION_LIMITS['seconds']:.0f} s of the mission's clock a request"
        if op == "mission.map" and not 3 <= int(body.get("n", 41)) <= MISSION_LIMITS["n"]:
            return f"mission.map: 3 to {MISSION_LIMITS['n']} points a side"
        if op == "mission.calibrate":
            seeds = body.get("seeds", 20)
            count = len(seeds) if isinstance(seeds, list) else int(seeds)
            if not 1 <= count <= MISSION_LIMITS["seeds"] or not 3 <= int(body.get("n", 5)) <= MISSION_LIMITS["calibration_n"]:
                return f"mission.calibrate: 1 to {MISSION_LIMITS['seeds']} truths, 3 to {MISSION_LIMITS['calibration_n']} points a side"
    except (TypeError, ValueError):
        return f"{op}: its numbers are numbers"
    if op in ("mission.start", "mission.calibrate") and not isinstance(body.get("config", {}), dict):
        return f"{op}: a config, as an object"
    return None


def engine_refusal(body: dict) -> str | None:
    """Why a request to the engine is refused, or None."""
    op = body.get("op")
    if op not in OPS:
        return f"unknown op {op!r}: one of {', '.join(sorted(OPS))}"
    if op == "probe_volume":
        return probe_refusal(body)
    if op == "beneath.section":
        return section_refusal(body)
    if op.startswith("mission."):
        return mission_refusal(op, body)
    if op == "address" and (not isinstance(body.get("text"), str) or len(body["text"]) > 2000):
        return "address: the text of an address, at most 2000 characters"
    if op in ("ephemeris", "bodies"):
        try:
            span, step = float(body.get("span", 86400)), float(body.get("step", 600))
        except (TypeError, ValueError):
            return "ephemeris: span and step are numbers of seconds"
        if not step >= 1 or span / step + 1 > LIMITS["samples"]:
            return f"{op}: at most {LIMITS['samples']} samples, a step of at least 1 s"
    if op in ("field.sample", "field.curves") and (not isinstance(body.get("field"), str) or not body["field"]):
        return f'{op}: name the field, as "earth.magnetic" (the op "fields" lists them)'
    if op == "field.sample":
        g = body.get("sampling")
        if not isinstance(g, dict):
            return 'field.sample: the sampling is an object, as {"kind": "sphere", "radius_m", "nlat", "nlon"}'
        try:
            kind = g.get("kind")
            points = (int(g["nlat"]) * int(g["nlon"]) if kind == "sphere" else int(g["nu"]) * int(g["nv"]) if kind == "plane"
                      else int(g["n"][0]) * int(g["n"][1]) * int(g["n"][2]) if kind == "volume" else len(g["points"]) if kind == "points" else 0)
        except (KeyError, TypeError, ValueError, IndexError):
            return "field.sample: the sampling's counts of cells are whole numbers (sphere: nlat, nlon; plane: nu, nv; volume: n; points: points)"
        if not 0 < points <= FIELD_LIMITS["points"]:
            return f"field.sample: from 1 to {FIELD_LIMITS['points']} points on this server, not {points}"
    if op == "field.curves":
        seeds = body.get("seeds")
        if not isinstance(seeds, list) or not 0 < len(seeds) <= FIELD_LIMITS["seeds"]:
            return f"field.curves: seeds are a list of 1 to {FIELD_LIMITS['seeds']} points"
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
            if body["op"] in MISSION_WRITES:
                refusal = write_refusal(self)
                if refusal:
                    return self.reply_json({"error": refusal}, 403)
            if body["op"] == "beneath.section":
                return self.reply_json(*beneath_section(body))
            body.pop("sources", None)  # the world's sources are the server's to name
            body.pop("files", None)    # and so are the files it reads
            if body["op"] == "satellites":
                body["files"] = [{"path": str(SATELLITES / g / "gp.tle"), "group": g} for g in body.pop("groups")]
            if body["op"] == "address":
                body["now_unix"] = time.time()
            if body["op"] == "probe_volume":
                for key in ("session", "elements", "inputs", "now_tt_s", "now_unix", "seed", "threads"):
                    body.pop(key, None)  # the server's to give
                world = ACQUISITION.world_inputs()
                if body["at"].strip() == "observer":
                    body["at"] = world["observer"]
                if not body.get("time") and "@" not in body["at"]:
                    body["time"] = f"JD {2451545.0 + CLOCK.now() / 86400.0:.10f} TT"
                body.update(elements=world["elements"], inputs=world["inputs"], now_tt_s=world["now_tt_s"], now_unix=time.time(),
                            threads=LIMITS["probe"]["threads"])
                if world["seed"] is not None:
                    body["seed"] = world["seed"]
            if body["op"] in ("field.sample", "field.curves", "field_map") and "seed" not in body:
                seed = ACQUISITION.seed()
                if seed is not None:
                    body["seed"] = seed  # the unresolved scales the session's instruments read
            if body["op"] == "field_map" or (body["op"] == "field.sample" and not body.get("time")):
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
        LIMITS["probe"]["threads"] = min(2, LIMITS["probe"]["threads"])
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
