"""Checks of the server's runtime (runtime.py) and of an acquisition session in the engine.

Run by tests/run-tests.mjs, which reads one JSON object a line from the standard output:
{"check": title, "ok": bool, "detail": text} or {"skip": why}. The runtime's own pieces need no
engine: the time scales of the mission clock (TT from Unix time through the leap seconds), the clock's
commands, the bus. The session needs the engine built and its sources in the cache; it is held in one
process of the engine (engine.Engine, as the server holds it), configured, stepped at fixed instants
and asked to describe itself and to simulate its policies. The physics of each instrument is the
domains' to check (geodesy's normal gravity, geophysics' WMM, meteorology's standard atmosphere);
these checks hold the plumbing: the instants, the counts of releases and skips, the units, the
determinism of a session's noise, coverage refused with a reason, the envelope of every reading, the
families declared but not written, and the kernel's report. The Moon's magnetometer is held, through
the engine, to pyshtools on T2015_449 (the planetary-science domain's tests/fixtures/lunar-field.txt),
and its solar-wind part to a field given as the server gives it.
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

    # ---- the envelope and the kernel --------------------------------------------------------------------
    r = readings.get("grav", {})
    check("envelope: a reading names its measurement, interval, frame, support, snapshot and interaction, and is valid",
          r.get("measurement") == f"grav@{TT:.0f}" or str(r.get("measurement", "")).startswith("grav@")
          and all(k in r for k in ("interval", "frame", "support", "snapshot", "interaction")) and r.get("quality") == "valid",
          {k: r.get(k) for k in ("measurement", "frame", "support", "quality")})
    check("envelope: a reading refused by coverage is of quality 'outside'", readings.get("moon.mag", {}).get("quality") == "outside",
          readings.get("moon.mag", {}).get("quality"))
    k = cfg.get("kernel", {})
    check("kernel: the session reports the kernel's real-time classes, and why one is refused",
          k.get("system") and isinstance(k.get("fifo_permitted"), bool) and isinstance(k.get("deadline_permitted"), bool)
          and k.get("workers_class") and (k["fifo_permitted"] or bool(k.get("refusal"))), {x: k.get(x) for x in ("system", "fifo_permitted", "workers_class")})
    bad = eng.ask({"op": "acquire.configure", "session": "declared", "sensors": [{"id": "radar", "family": "declared.C06", "mount": "observer"}],
                   "observer": OBSERVER}, timeout=60)
    check("declared: a family of the encyclopedia without a model is refused, and says so",
          "declared, not implemented" in bad.get("error", ""), bad.get("error"))
    ins = eng.ask({"op": "instruments"}, timeout=60)
    declared = ins.get("declared", [])
    classes = {x.get("class") for x in ins.get("kernels", [])}
    check("declared: the encyclopedia's 101 families, each bound to one of the twelve kernel classes",
          len(declared) == 101 and len(classes) == 12 and all(d.get("class") in classes for d in declared),
          [d["code"] for d in declared if d.get("class") not in classes])

    # ---- the compass and the Moon's magnetometer ---------------------------------------------------------
    fixtures = {}
    for line in (ROOT / "domains" / "planetary-science" / "tests" / "fixtures" / "lunar-field.txt").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            name, lat, lon, h, n, e, d = line.split()
            fixtures[name] = (float(lat), float(lon), float(h), float(n), float(e), float(d))
    lunar_sensors = [{"id": f"moon.{name}", "family": "magnetometer.moon", "period_s": 1,
                      "mount": f"moon({abs(lat)} {'N' if lat >= 0 else 'S'}, {abs(lon)} {'E' if lon >= 0 else 'W'}, {h:.0f} m)"}
                     for name, (lat, lon, h, *_) in fixtures.items()]
    field_sensors = lunar_sensors + [
        {"id": "compass", "family": "compass.magnetic", "mount": OBSERVER, "period_s": 1},
        {"id": "mag", "family": "magnetometer.wmm2025", "mount": OBSERVER, "period_s": 1},
        {"id": "compass.pole", "family": "compass.magnetic", "mount": "earth(85.9 N, 139.0 E, 10 m)", "period_s": 1},
        {"id": "compass.high", "family": "compass.magnetic", "mount": "earth(51.4769 N, 0.0005 W, 40 km)", "period_s": 1},
        {"id": "compass.moon", "family": "compass.magnetic", "mount": "moon(0.674 N, 23.473 E)", "period_s": 1},
        {"id": "moon.on_earth", "family": "magnetometer.moon", "mount": OBSERVER, "period_s": 1},
        {"id": "moon.fine", "family": "magnetometer.moon", "mount": "moon(7.5 N, 59 W)", "period_s": 1, "settings": {"synthetic": True}},
        {"id": "moon.low", "family": "magnetometer.moon", "mount": "moon(7.5 N, 59 W, -2 km)", "period_s": 1},
    ]

    def fields(session: str, seed: int, inputs: dict | None = None) -> dict:
        c = eng.ask({"op": "acquire.configure", "session": session, "sensors": field_sensors, "observer": OBSERVER, "seed": seed}, timeout=120)
        if "error" in c:
            return {"error": c["error"]}
        now = time.time()
        a = eng.ask({"op": "acquire.step", "session": session, "clock": {"tt_s": TT, "wall": now, "rate": 1, "running": False},
                     "wall": now, "interval_s": 0.25, **({"inputs": inputs} if inputs else {})}, timeout=120)
        return {x["sensor"]: x for x in a.get("readings", [])} if "error" not in a else {"error": a["error"]}

    got = fields("fields", 7)
    check("fields: a session of compasses and lunar magnetometers steps", "error" not in got, got.get("error"))
    c, m = got.get("compass", {}), got.get("mag", {})
    check("compass: at Greenwich it reads WMM's declination and inclination, reliable",
          c.get("available") and abs(c["values"]["magnetic_north_deg"] - m["values"]["declination_deg"]) < 1e-9
          and abs(c["values"]["dip_deg"] - m["values"]["inclination_deg"]) < 1e-9 and c["values"]["zone"] == "reliable",
          c.get("values"))
    c = got.get("compass.pole", {})
    check("compass: in the blackout about the magnetic pole (H < 2000 nT) it does not settle: invalid, with the reason",
          c.get("available") is False and c.get("quality") == "invalid" and "2000 nT" in c.get("reason", ""), c.get("reason"))
    check("compass: above 30 km, and on the Moon, it is outside its coverage",
          all(got.get(x, {}).get("available") is False and got.get(x, {}).get("quality") == "outside" for x in ("compass.high", "compass.moon")),
          [got.get(x, {}).get("reason") for x in ("compass.high", "compass.moon")])
    check("lunar magnetometer: on the Earth it is outside its coverage", got.get("moon.on_earth", {}).get("quality") == "outside")
    worst = 0.0
    for name, (lat, lon, h, n, e, d) in fixtures.items():
        v = got.get(f"moon.{name}", {}).get("values", {})
        b = math.sqrt(n * n + e * e + d * d)
        worst = max(worst, max(abs(v.get("north_T", 1) - n), abs(v.get("east_T", 1) - e), abs(v.get("down_T", 1) - d)) / b)
    check("lunar magnetometer: T2015_449's crustal field as pyshtools gives it, at five mounts on and above the Moon (to 1e-7 of |B|)",
          worst < 1e-7, f"{worst:.2e}")
    low, rg = got.get("moon.low", {}).get("values", {}), fixtures["reiner_gamma"]
    check("lunar magnetometer: 2 km below the sphere (low ground) it reads the model at the sphere, and says so",
          abs(low.get("crustal_T", 0) - math.sqrt(sum(x * x for x in rg[3:]))) < 1e-15 and abs(low.get("below_sphere_m", 0) - 2000) < 1e-3 and bool(low.get("note")),
          {k: low.get(k) for k in ("crustal_T", "below_sphere_m")})
    fine = got.get("moon.fine", {}).get("values", {})
    check("lunar magnetometer: with finer scales, the power below the spectral law to degree 720, said to be synthetic",
          fine.get("small_scales_degree") == 720 and fine.get("small_scales_T", 0) > 0 and fine.get("provenance_of_parts", {}).get("small_scales") == "synthetic",
          fine.get("small_scales_T"))
    again = fields("fields.again", 7).get("moon.fine", {}).get("values", {})
    other = fields("fields.other", 8).get("moon.fine", {}).get("values", {})
    check("lunar magnetometer: the finer scales are a function of the session's seed",
          again.get("small_scales_T") == fine.get("small_scales_T") and other.get("small_scales_T") != fine.get("small_scales_T"))

    # The solar wind's field, as the server passes it: 5 nT along the Sun's direction (GSE x), at
    # 400 km/s, minute by minute over the six hours before the instant.
    tt0 = TT - 6 * 3600
    wind = {"solar_wind": {"imf_gse": [[tt0 + 60 * i, 5e-9, 0.0, 0.0] for i in range(361)], "speed_m_s": 4e5, "speed_tt_s": TT, "spacecraft": "test"}}
    v = fields("fields.wind", 7, wind).get("moon.tranquility", {}).get("values", {})
    if v.get("in_magnetotail"):
        check("lunar magnetometer: in the Earth's magnetotail the solar wind's field is not added, and it says so",
              "external_T" not in v and bool(v.get("external_note")), v.get("external_note"))
    else:
        # The travel time is from L1 to the Moon's place along the Sun–Earth line: within the Moon's
        # distance of the 1.5e9 m to L1, at 400 km/s.
        check("lunar magnetometer: the solar wind's field measured at L1 one travel time before is added",
              abs(v.get("external_T", 0) - 5e-9) < 1e-15 and abs(v.get("delay_s", 0) * 4e5 - 1.5e9) < 4.1e8
              and v.get("provenance_of_parts", {}).get("external") == "physical",
              {k: v.get(k) for k in ("external_T", "delay_s")})
    crust = fixtures["tranquility"]
    check("lunar magnetometer: the total is the crust and the solar wind's field together",
          abs(math.sqrt(v.get("north_T", 0) ** 2 + v.get("east_T", 0) ** 2 + v.get("down_T", 0) ** 2) - v.get("total_T", -1)) < 1e-18
          and (v.get("in_magnetotail") or abs(v.get("crustal_T", 0) - math.sqrt(sum(x * x for x in crust[3:]))) < 1e-15),
          v.get("total_T"))
finally:
    eng.close()
