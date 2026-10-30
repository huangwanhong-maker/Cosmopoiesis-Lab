"""The engine of Cosmopoiesis: the spacetime of a world and its frames, as one program.

The engine is ``engine/cosmopoiesis.cpp``, header-only C++20 on the domains metrology (time
scales, leap seconds, Earth orientation, the IAU 2006/2000A frames), geodesy (the figure of the
Earth), astronomy (JPL ephemerides, the Moon's frames) and the navigation bridge (the catalogue of
frames), on physis (rotations, kinematics, the frame graph and its holonomy) and calx, with the
API's JSON (``api/cpp/science/json.hpp``). It is compiled here by g++ 11 or later: natively where
there is one, and otherwise in WSL (Windows without a compiler), into
``data/cache/engines/cosmopoiesis/``. Beside the program it keeps ``build.json``, with the hash of
every source it was built from (the headers it includes, followed transitively), so that work
elsewhere in the foundations does not make it stale.

The engine answers one request (JSON) on its standard input with one answer (JSON) on its standard
output; with ``--serve`` it answers a request per line and keeps its kernels between them, which is
how the server runs it (``Engine``). The protocol is in this application's README, §5, and in
docs/architecture.md §4.5. Files are named by their paths; the engine reads nothing else.

Usage::

    python applications/cosmopoiesis-lab/engine.py build [--force]
    python applications/cosmopoiesis-lab/engine.py status
    python applications/cosmopoiesis-lab/engine.py run <request.json | ->
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parents[1]
OUT = ROOT / "data" / "cache" / "engines" / "cosmopoiesis"
PROGRAM = OUT / "cosmopoiesis"
SOURCE = APP / "engine" / "cosmopoiesis.cpp"
CACHE = ROOT / "data" / "cache"

# The world's sources in the data library's cache: the planets and the Moon (DE440s), the Moon's
# principal axes (DE440's binary PCK), the Earth's orientation (IERS finals2000A), the leap
# seconds (IANA) and the geoid (EGM96's 15' grid, the product geoid/egm96-15.pgm); the World Magnetic
# Model, the Moon's crustal field, and the Earth's crust (CRUST1.0, the product crust-crust1).
SOURCES = {
    "ephemeris": CACHE / "jpl-de440s" / "de440s.bsp",
    "moon_pck": CACHE / "naif-lunar-frames" / "moon_pa_de440_200625.bpc",
    "eop": CACHE / "iers-eop" / "latest" / "finals2000A.all",
    "leap_seconds": CACHE / "iana-leap-seconds" / "latest" / "leap-seconds.list",
    "geoid": CACHE / "products" / "geoid" / "egm96-15.pgm",
    "wmm": CACHE / "noaa-wmm" / "WMM.COF",
    "moon_magnetic": CACHE / "moon-magnetic-t2015" / "T2015_449.sh",
    "crust1": CACHE / "products" / "crust-crust1.bin",
}


def include_dirs() -> list[Path]:
    """The include directories of the engine: the domains it stands on, physis, tyche, morphe and calx, the API's C++ and
    the engine's own."""
    dirs: list[Path] = []
    for domain in ("metrology", "geodesy", "astronomy", "geophysics", "meteorology", "oceanography", "navigation", "planetary-science", "robotics"):
        dirs += sorted(p for p in ROOT.glob(f"domains/{domain}/*/include") if p.is_dir())
    for pattern in ("foundations/physis/*/include", "foundations/tyche/*/include", "foundations/morphe/*/include",
                    "foundations/calx/numerics/*/include", "foundations/calx/compute/*/include"):
        dirs += sorted(p for p in ROOT.glob(pattern) if p.is_dir())
    dirs += [ROOT / "foundations" / "morphe" / "include", ROOT / "api" / "cpp", APP / "engine"]
    return [d for d in dirs if d.is_dir()]


INCLUDE = re.compile(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', re.M)


def sources() -> list[Path]:
    """The files the engine is built from: its source and the project headers it includes, transitively."""
    dirs = include_dirs()
    seen: set[Path] = set()
    todo = [SOURCE] if SOURCE.exists() else []
    while todo:
        f = todo.pop()
        if f in seen:
            continue
        seen.add(f)
        for name in INCLUDE.findall(f.read_text(encoding="utf-8", errors="replace")):
            for d in [f.parent, *dirs]:
                candidate = d / name
                if candidate.is_file():
                    todo.append(candidate.resolve())
                    break
    return sorted(seen)


def digest() -> str:
    h = hashlib.sha256()
    for f in sources():
        h.update(f.relative_to(ROOT).as_posix().encode())
        h.update(b"\0")
        h.update(f.read_bytes())
    return h.hexdigest()


def wsl_path(p: Path) -> str:
    """C:\\Users\\x -> /mnt/c/Users/x."""
    s = str(Path(p).resolve())
    if len(s) > 1 and s[1] == ":":
        return f"/mnt/{s[0].lower()}{s[2:]}".replace("\\", "/")
    return s.replace("\\", "/")


def toolchain() -> str | None:
    """'native' where g++ is on the PATH, 'wsl' where it is in WSL, else None."""
    if shutil.which("g++") and os.name != "nt":
        return "native"
    if os.name == "nt" and shutil.which("wsl"):
        try:
            r = subprocess.run(["wsl", "--exec", "sh", "-c", "command -v g++"], capture_output=True, timeout=60)
            if r.returncode == 0 and r.stdout.strip():
                return "wsl"
        except (OSError, subprocess.TimeoutExpired):
            pass
    if shutil.which("g++"):
        return "native"
    return None


def command(kind: str, args: list[str]) -> list[str]:
    """A command for the toolchain: paths in args are already in its form."""
    return ["wsl", "--exec", *args] if kind == "wsl" else args


def path_for(kind: str, p: Path) -> str:
    return wsl_path(p) if kind == "wsl" else str(p)


def world_sources(kind: str) -> dict:
    """The sources of the world in the toolchain's form; the optional ones only where they are in the cache."""
    out = {}
    for name, p in SOURCES.items():
        if p.exists():
            out[name] = path_for(kind, p)
    return out


def read_build() -> dict | None:
    try:
        return json.loads((OUT / "build.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def status() -> dict:
    """Whether the engine is built, and from the present sources; which of the world's sources are in the cache."""
    b = read_build()
    built = b is not None and PROGRAM.exists()
    out = {"built": built, "toolchain": b.get("toolchain") if b else None, "built_at": b.get("built_at") if b else None,
           "source": SOURCE.exists(), "data": {name: p.exists() for name, p in SOURCES.items()}}
    out["current"] = built and SOURCE.exists() and b.get("sources") == digest()
    return out


def ask(kind: str, request: dict, timeout: float = 120) -> dict:
    """One request to the built program; its answer."""
    r = subprocess.run(command(kind, [path_for(kind, PROGRAM)]), input=json.dumps(request).encode("utf-8"),
                       capture_output=True, timeout=timeout)
    out = r.stdout.decode("utf-8", errors="replace")
    if not out.strip():
        raise RuntimeError(r.stderr.decode("utf-8", errors="replace").strip() or f"the engine ended with status {r.returncode}")
    return json.loads(out)


# The proof of a build: SOFA's example of the time scales (UTC 2006-01-15 21:24:37.5, at which
# TT − UTC = 65.184 s exactly: 33 leap seconds and TT − TAI = 32.184 s; SOFA, "Time Scale and
# Calendar Tools", 2021, §4.3).
PROOF = {"op": "time", "time": "2006-01-15T21:24:37.5 UTC"}


def proof(answer: dict) -> str | None:
    """None when the proof's answer is right, else what is wrong."""
    try:
        utc, tt = answer["scales"]["UTC"]["jd"], answer["scales"]["TT"]["jd"]
    except (KeyError, TypeError):
        return f"no scales in the answer: {answer}"
    seconds = ((tt[0] - utc[0]) + (tt[1] - utc[1])) * 86400.0
    if abs(seconds - 65.184) > 1e-6:
        return f"TT - UTC = {seconds!r} s, not 65.184 s"
    return None


def build(force: bool = False, log=print) -> bool:
    """Compiles the engine unless it is current; then asks it SOFA's example of the time scales, as a proof."""
    if not SOURCE.exists():
        log(f"The engine's source, {SOURCE.relative_to(ROOT).as_posix()}, is not there yet.")
        return False
    if not SOURCES["ephemeris"].exists():
        log("The ephemeris (jpl-de440s) is not in the cache: run  python data/acquisition/fetch.py jpl-de440s  first.")
        return False
    if not force and status()["current"]:
        log("The engine is current.")
        return True
    kind = toolchain()
    if kind is None:
        log("No C++ compiler: install g++ 11 or later (on Windows, in WSL).")
        return False
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = digest()
    args = ["g++", "-std=c++20", "-O2", "-march=native", "-pthread", "-DNDEBUG"]
    args += [f"-I{path_for(kind, d)}" for d in include_dirs()]
    args += [path_for(kind, SOURCE), "-o", path_for(kind, PROGRAM)]
    log(f"Compiling the engine with g++ ({kind}); this takes a minute or two.")
    t0 = time.time()
    r = subprocess.run(command(kind, args), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log(r.stderr[-6000:])
        log("The engine did not compile.")
        return False
    try:
        answer = ask(kind, {**PROOF, "sources": world_sources(kind)})
    except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        log(f"The engine compiled but did not answer: {error}")
        return False
    wrong = proof(answer)
    if wrong:
        log(f"The engine compiled but answered SOFA's example wrongly: {wrong}")
        return False
    record = {"sources": stamp, "toolchain": kind, "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "seconds": round(time.time() - t0, 1), "flags": args[1:6]}
    (OUT / "build.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    log(f"Built in {record['seconds']} s, and SOFA's example answered (TT - UTC = 65.184 s): {PROGRAM}")
    return True


class Engine:
    """The engine kept alive (``--serve``): one request at a time, a line each way, restarted when it ends.

    The world's sources are added to every request, so that the page names none of the server's paths."""

    def __init__(self):
        self.lock = threading.Lock()
        self.process: subprocess.Popen | None = None
        self.kind: str | None = None
        self.stamp: str | None = None
        self.generation = 0  # the processes started: what a session keeps in the engine is lost with one

    def _start(self) -> None:
        b = read_build() or {}
        self.kind = b.get("toolchain") or toolchain() or "native"
        self.stamp = b.get("built_at")
        self.generation += 1
        self.process = subprocess.Popen(command(self.kind, [path_for(self.kind, PROGRAM), "--serve"]), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)

    def _alive(self) -> bool:
        if self.process is None or self.process.poll() is not None:
            return False
        # A rebuilt program is started again.
        b = read_build() or {}
        return b.get("built_at") == self.stamp

    def ask(self, request: dict, timeout: float = 60.0) -> dict:
        """The answer to a request; {"error": ...} when the engine is not built or fails."""
        if not PROGRAM.exists():
            return {"error": "the engine is not built: run the recipe (/setup) or  python applications/cosmopoiesis-lab/engine.py build"}
        with self.lock:
            for attempt in range(2):
                if not self._alive():
                    self.close()
                    self._start()
                # Files named by the server travel in the toolchain's form of their paths.
                files = [{**f, "path": path_for(self.kind, Path(f["path"]))} for f in request.get("files", [])]
                elements = [{**f, "path": path_for(self.kind, Path(f["path"]))} for f in request.get("elements", [])]
                line = json.dumps({**request, **({"files": files} if files else {}), **({"elements": elements} if elements else {}),
                                   "sources": world_sources(self.kind)}) + "\n"
                try:
                    self.process.stdin.write(line.encode("utf-8"))
                    self.process.stdin.flush()
                    out = self._read_line(timeout)
                except (OSError, TimeoutError) as error:
                    self.close()
                    if attempt == 1:
                        return {"error": f"the engine did not answer: {error}"}
                    continue
                if out:
                    return json.loads(out)
                self.close()
            return {"error": "the engine ended without answering"}

    def _read_line(self, timeout: float) -> str:
        result: list = []
        reader = threading.Thread(target=lambda: result.append(self.process.stdout.readline()), daemon=True)
        reader.start()
        reader.join(timeout)
        if reader.is_alive():
            raise TimeoutError(f"no answer within {timeout:g} s")
        return result[0].decode("utf-8", errors="replace") if result else ""

    def close(self) -> None:
        p = self.process
        self.process = None
        if p and p.poll() is None:
            try:
                p.stdin.close()
                p.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                p.kill()


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Build or run the engine of Cosmopoiesis.")
    sub = parser.add_subparsers(dest="what", required=True)
    b = sub.add_parser("build", help="compile the engine unless it is current")
    b.add_argument("--force", action="store_true", help="compile it again")
    sub.add_parser("status", help="whether the engine is built and current")
    r = sub.add_parser("run", help="answer one request (a JSON file, or - for standard input); the world's sources are added")
    r.add_argument("request")
    args = parser.parse_args(argv)
    if args.what == "build":
        return 0 if build(args.force) else 1
    if args.what == "status":
        print(json.dumps(status(), indent=2))
        return 0
    if not status()["current"] and not build():
        return 1
    text = sys.stdin.buffer.read().decode("utf-8") if args.request == "-" else Path(args.request).read_text(encoding="utf-8")
    kind = (read_build() or {}).get("toolchain") or toolchain() or "native"
    request = json.loads(text)
    if request.get("files"):
        request["files"] = [{**f, "path": path_for(kind, Path(f["path"]))} for f in request["files"]]
    answer = ask(kind, {**request, "sources": world_sources(kind)}, timeout=3600)
    sys.stdout.buffer.write((json.dumps(answer, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    return 1 if "error" in answer else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
