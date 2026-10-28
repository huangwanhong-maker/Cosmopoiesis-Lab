"""Checks of the server's runtime (runtime.py) and of an acquisition session in the engine.

Run by tests/run-tests.mjs, which reads one JSON object a line from the standard output:
{"check": title, "ok": bool, "detail": text} or {"skip": why}. The runtime's own pieces need no
engine: the time scales of the mission clock (TT from Unix time through the leap seconds), the clock's
commands, the bus. The session needs the engine built and its sources in the cache; it is held in one
process of the engine (engine.Engine, as the server holds it), configured, stepped at fixed instants
and asked to describe itself and to simulate its policies. The physics of each instrument is the
domains' to check (geodesy's normal gravity, geophysics' WMM, meteorology's standard atmosphere);
these checks hold the plumbing: the instants, the counts of releases and skips, the units, the
determinism of a session's noise, coverage refused with a reason.
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
sys.path.insert(0, str(APP))

import runtime  # noqa: E402


def out(**line) -> None:
    print(json.dumps(line), flush=True)


def check(title: str, ok: bool, detail: object = "") -> None:
    out(check=title, ok=bool(ok), detail=str(detail))


# ---- the time scales of the mission clock ------------------------------------------------------------
# J2000.0 is 2000-01-01T12:00:00 TT; Unix 946728000 is 2000-01-01T12:00:00 UTC, so that
# TT − J2000.0 = (unix − 946728000) + (TAI − UTC) + 32.184 s (IERS Conventions 2010, ch. 10).
if runtime.leap_seconds():
    u = 1483228800.0  # 2017-01-01T00:00:00Z, the last leap second's end
    check("time: TAI − UTC is 36 s before 2017-01-01 and 37 s from it (IERS Bulletin C 52)",
          runtime.tai_minus_utc(u - 0.5) == 36 and runtime.tai_minus_utc(u) == 37,
          f"{runtime.tai_minus_utc(u - 0.5)}, {runtime.tai_minus_utc(u)}")
    check("time: TT of 2017-01-01T00:00:00Z is 536 500 869.184 s from J2000.0 (536 500 800 + 37 + 32.184)",
          abs(runtime.tt_of_unix(u) - 536500869.184) < 1e-6, runtime.tt_of_unix(u))
    w = 1793176451.25
    check("time: Unix time comes back from TT", abs(runtime.unix_of_tt(runtime.tt_of_unix(w)) - w) < 1e-6)
else:
    out(skip="time: the leap seconds are not in the cache (the recipe fetches them)")

# ---- the clock's commands ----------------------------------------------------------------------------
c = runtime.MissionClock()
check("clock: it starts at the present, at real time",
      abs(c.now() - runtime.tt_of_unix(time.time())) < 0.05 and c.rate == 1.0 and c.running)
c.command("set", tt=100.0)
c.command("rate", rate=3600.0)
w = time.time()
check("clock: at 1 h/s, two seconds of the wall are two hours of TT", abs(c.now(w + 2) - c.now(w) - 7200) < 1e-6)
c.command("pause")
t = c.now()
check("clock: paused, it stands", c.now(time.time() + 60) == t)
c.command("set", tt=-1e9)
check("clock: set while paused, it reads what it was set to", c.now() == -1e9)
for bad in (float("inf"), 2e9):
    try:
        c.command("rate", rate=bad)
        check(f"clock: a rate of {bad:g} is refused", False)
    except ValueError:
        check(f"clock: a rate of {bad:g} is refused", True)
try:
    c.command("rewind")
    check("clock: an unknown command is refused", False)
except ValueError:
    check("clock: an unknown command is refused", True)
c.command("present")
s = c.state()
check("clock: 'present' returns it to the present at real time, running",
      abs(s["from_present_s"]) < 0.05 and s["rate"] == 1.0 and s["running"], s["from_present_s"])

# ---- the bus -----------------------------------------------------------------------------------------
b = runtime.Bus(size=4)
b.append([{"sensor": "a", "v": 1}, {"sensor": "b", "v": 2}, {"sensor": "a", "v": 3}])
b.append([{"event": "flare", "v": 4}])
got = b.since(0)
check("bus: readings carry their order", [r["seq"] for r in got["readings"]] == [1, 2, 3, 4] and got["seq"] == 4)
check("bus: a reader asks for what came after what it has", [r["v"] for r in b.since(2)["readings"]] == [3, 4])
snap = b.snapshot()
check("bus: the latest of each sensor, events apart",
      snap["latest"]["a"]["v"] == 3 and "event" not in snap["latest"] and len(snap["events"]) == 1)
b.append([{"sensor": "c", "v": 5}])
check("bus: it keeps the newest readings when it is full", [r["v"] for r in b.since(0)["readings"]] == [2, 3, 4, 5])
start = time.time()
b.since(5, wait=0.2)
check("bus: a long poll waits for a reading, and no longer than asked", 0.15 < time.time() - start < 1.0)

# ---- a session in the engine -------------------------------------------------------------------------
import engine as E  # noqa: E402

state = E.status()
if not state["built"] or not state["data"].get("ephemeris"):
    out(skip="acquisition: the engine is not built, or the ephemeris is not in the cache")
    sys.exit(0)

cache = ROOT / "data" / "cache" / "celestrak-gp"
elements = [{"path": str(cache / g / "gp.tle"), "group": g, "stamp": "1"}
            for g in ("stations", "gps-ops", "galileo") if (cache / g / "gp.tle").exists()]
gnss = any(e["group"] == "gps-ops" for e in elements)
OBSERVER = "earth(51.4769 N, 0.0005 W, 91 m)"
sensors = [
    {"id": "clock", "family": "clock.scales", "period_s": 1, "criticality": 2},
    {"id": "pos", "family": "position.truth", "mount": "observer", "period_s": 1},
    {"id": "sun", "family": "sun.sensor", "mount": "observer", "period_s": 1},
    {"id": "grav", "family": "gravimeter.body", "mount": "observer", "period_s": 1},
    {"id": "air", "family": "atmosphere.ussa1976", "mount": "observer", "period_s": 1},
    {"id": "mag", "family": "magnetometer.wmm2025", "mount": "observer", "period_s": 1},
    {"id": "moon.grav", "family": "gravimeter.body", "mount": "moon(0.674 N, 23.473 E)", "period_s": 5},
    {"id": "moon.mag", "family": "magnetometer.wmm2025", "mount": "moon(0.674 N, 23.473 E)", "period_s": 5},
] + ([{"id": "gnss", "family": "gnss.receiver", "mount": "observer", "period_s": 1}] if gnss else [])

eng = E.Engine()
try:
    def configure(session: str, seed: int) -> dict:
        return eng.ask({"op": "acquire.configure", "session": session, "elements": elements, "sensors": sensors,
                        "observer": OBSERVER, "seed": seed, "servers": [{"name": "io", "budget_s": 2, "period_s": 10}]}, timeout=60)

    def step(session: str, tt: float) -> dict:
        now = time.time()
        return eng.ask({"op": "acquire.step", "session": session, "clock": {"tt_s": tt, "wall": now, "rate": 1, "running": False},
                        "wall": now, "interval_s": 0.25}, timeout=60)

    cfg = configure("check", 7)
    check("acquisition: a session is configured with its sensors", "error" not in cfg and len(cfg.get("sensors", [])) == len(sensors),
          cfg.get("error", ""))
    TT = 846460800.0  # 2026-10-28T12:00:00 TT
    a = step("check", TT)
    readings = {r["sensor"]: r for r in a.get("readings", [])}
    check("acquisition: the first step releases every sensor once", set(readings) == {s["id"] for s in sensors}, sorted(readings))

    r = readings.get("clock", {})
    v = r.get("values", {})
    check("clock: TAI − UTC is 37 s in 2026 and the reading's UTC is TT − 69.184 s",
          v.get("tai_minus_utc_s") == 37 and r.get("time_utc") == "2026-10-28T11:58:50.816Z", r.get("time_utc"))
    check("clock: TDB − TT is under 2 ms (Fairhead and Bretagnon)", abs(v.get("tdb_minus_tt_s", 1)) < 0.002, v.get("tdb_minus_tt_s"))
    check("clock: the reading is the instant of its tick, the world's", r.get("tt_s") == TT and r.get("tick") == TT)

    v = readings.get("pos", {}).get("values", {})
    d = math.dist(v.get("gcrs_m", [0, 0, 0]), [0, 0, 0])
    # The point 91 m above WGS 84 at 51.4769° N (a = 6 378 137 m, 1/f = 298.257223563): its distance
    # from the centre is the same in every frame centred there, the GCRS as the ITRS.
    a84, f84 = 6378137.0, 1 / 298.257223563
    e2, phi = f84 * (2 - f84), math.radians(51.4769)
    n = a84 / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    radius = math.hypot((n + 91) * math.cos(phi), (n * (1 - e2) + 91) * math.sin(phi))
    check("position: the observer is as far from the Earth's centre in the GCRS as on WGS 84", abs(d - radius) < 1e-4, f"{d - radius:.2e} m")
    e = math.dist(v.get("icrs_m", [0, 0, 0]), [0, 0, 0])
    check("position: and some 1 au from the barycentre, in the ICRS", 1.47e11 < e < 1.52e11, f"{e:.4e} m")

    v = readings.get("sun", {}).get("values", {})
    au = 149597870700.0
    expected = 1361.0 * (au / v.get("distance_m", 1)) ** 2
    check("sun: the irradiance is the solar constant (IAU 2015 B3) at its distance",
          abs(v.get("irradiance_w_m2", 0) - expected) / expected < 1e-12, v.get("irradiance_w_m2"))
    check("sun: on the level it is the irradiance times the sine of the elevation",
          abs(v.get("horizontal_irradiance_w_m2", 0) - expected * math.sin(math.radians(v.get("elevation_deg", 0)))) < 1e-9 * expected)

    v = readings.get("grav", {}).get("values", {})
    check("gravimeter: normal gravity at Greenwich, 9.8117 m/s² (WGS 84 and the free-air gradient)",
          abs(v.get("gravity_m_s2", 0) - 9.8117) < 5e-4, v.get("gravity_m_s2"))
    v = readings.get("moon.grav", {}).get("values", {})
    gm_moon, r_moon = 4.9028001218467e12, 1737400.0  # DE440's GM of the Moon; the IAU's mean radius
    check("gravimeter: on the Moon, GM/R² less the centrifugal term of its turning",
          abs(v.get("attraction_m_s2", 0) - gm_moon / r_moon ** 2) < 1e-4 and 0 < v.get("centrifugal_m_s2", -1) < 2e-5, v.get("attraction_m_s2"))

    v = readings.get("air", {}).get("values", {})
    h = v.get("height_msl_m", 0)
    p = 101325.0 * (1 - 2.25577e-5 * h) ** 5.25588  # the troposphere of the 1976 standard, to 11 km
    check("atmosphere: the pressure at 45 m above the geoid is the 1976 standard's", abs(v.get("pressure_Pa", 0) - p) / p < 1e-5, f"{v.get('pressure_Pa')} Pa")
    check("atmosphere: its height is taken above EGM96, the ground 91 m above the ellipsoid less 45.8 m",
          v.get("height_datum") == "EGM96" and abs(h - 45.2) < 0.2, h)

    v = readings.get("mag", {}).get("values", {})
    check("magnetometer: a field between 25 and 66 µT, inclined some 66° at Greenwich",
          25e-6 < v.get("total_T", 0) < 66e-6 and 60 < v.get("inclination_deg", 0) < 70, v.get("total_T"))
    r = readings.get("moon.mag", {})
    check("magnetometer: on the Moon WMM has no field: no reading, with the reason",
          r.get("available") is False and bool(r.get("reason")), r.get("reason"))

    if gnss:
        v = readings["gnss"].get("values", {})
        check("gnss: some GPS and Galileo satellites above 10°", v.get("in_view", {}).get("gps-ops", 0) >= 4)
        # The same seed and tick give the same noise; another seed another.
        configure("again", 7)
        configure("other", 8)
        same = {x["sensor"]: x for x in step("again", TT)["readings"]}["gnss"]["values"]
        other = {x["sensor"]: x for x in step("other", TT)["readings"]}["gnss"]["values"]
        check("gnss: a session's noise is a function of its seed and the tick", same == v and other != v)
    else:
        out(skip="gnss: no GPS elements in the cache (python data/acquisition/fetch.py celestrak-gp --profile gps-ops)")

    late = [x["sensor"] for x in a["readings"] if x.get("late")]
    check("acquisition: none of the first releases is late", not late, late)
    a2 = step("check", TT)
    check("acquisition: a paused clock at the same tick releases nothing again", not a2.get("readings"), len(a2.get("readings", [])))
    step("check", TT + 5)
    desc = {s["id"]: s for s in eng.ask({"op": "acquire.describe", "session": "check"})["sensors"]}
    check("acquisition: five seconds later a 1 s sensor is released once, the four ticks between skipped",
          desc["clock"]["released"] == 2 and desc["clock"]["skipped"] == 4, f"{desc['clock']['released']}, {desc['clock']['skipped']}")
    check("acquisition: and a 5 s sensor once, none skipped", desc["moon.grav"]["released"] == 2 and desc["moon.grav"]["skipped"] == 0)

    an = eng.ask({"op": "acquire.analyse", "session": "check", "rate": 1, "horizon_s": 2}, timeout=60)
    pol = {p["policy"]: p for p in an.get("policies", [])}
    check("analyse: the declared set is feasible by EDF on one worker", an.get("edf_one_worker", {}).get("feasible") is True)
    check("analyse: every policy is simulated, none misses or starves on this light set",
          len(pol) >= 3 and all(p["misses"] == 0 and p["starved"] == 0 for p in pol.values()), list(pol))
    burst = eng.ask({"op": "acquire.analyse", "session": "check", "rate": 1, "horizon_s": 2,
                     "burst": {"at_s": 0.5, "count": 2000, "cost_s": 0.002, "criticality": 2}}, timeout=60)
    worst = max((p["misses"] for p in burst.get("policies", [])), default=0)
    check("analyse: a burst of 2000 events of 2 ms makes some policy miss deadlines", worst > 0, worst)
finally:
    eng.close()
