"""The server's side of Cosmopoiesis's acquisition (decision 0004): the mission clock, the bus of
readings, the physical sources, and the loop that steps the engine's acquisition session.

The engine (engine/acquisition.hpp) decides what is read when: it releases every sensor at the ticks
of its clock (the world's, which may run at any rate or be scrubbed to any instant, or the wall's),
orders the jobs by the policy (EDF with constant bandwidth servers by default), runs the virtual
instruments on its workers against one snapshot of the world, and plans the external jobs. This
module is the edge that touches the world: it holds the clock, steps the session a few times a
second and at once when an event arrives, runs the planned external jobs on a pool of I/O workers
in the order the engine gave, and keeps the readings on a bus that the page reads.

The physical sources (adapters), each with its provenance, cadence and coverage:

    ntp            the host's clock against UTC from the NTP pool (SNTP, RFC 4330): its offset and the
                   round trip (physical, a clock)
    swpc.wind      the solar wind upstream of the Earth, NOAA SWPC's real-time solar wind
                   (DSCOVR, ACE or IMAP at L1): proton speed, density, temperature (physical, a feed)
    swpc.imf       the interplanetary magnetic field there, in GSM axes (physical, a feed)
    swpc.kp        the planetary K index, three-hourly (physical, an index of magnetometers)
    goes.xray      GOES's X-ray flux, 0.1–0.8 nm, and the flare class it gives (physical)
    goes.protons   GOES's integral proton flux above 10 MeV (physical)
    usgs.quakes    earthquakes of magnitude 2.5 and more of the last day (physical, events: a new one
                   is an event that does not wait for the tick)
    home.station   the user's own stations (observation/sensors), the latest reading of each
    terrain.probe  the height of the ground at the observer, from the data library's tiles (archive)

None of them makes up a value: a source that cannot be reached answers why, and the page shows it.
"""

from __future__ import annotations

import collections
import json
import math
import queue
import socket
import struct
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

APP = Path(__file__).resolve().parent
ROOT = APP.parents[1]
CACHE = ROOT / "data" / "cache"
REGISTRY = ROOT / "data" / "registry"
UNIX_J2000_UTC = 946728000.0  # 2000-01-01T12:00:00 UTC, in Unix seconds
AGENT = "Cosmopoiesis (The Science Infrastructures; https://github.com/huangwanhong-maker/Cosmopoiesis-Lab)"


# ---- time ------------------------------------------------------------------------------------------

def leap_seconds() -> list[tuple[float, int]]:
    """IANA's leap-seconds.list as (Unix time of the change, TAI − UTC from then); the built-in tail of
    the table when the file is not in the cache."""
    path = CACHE / "iana-leap-seconds" / "latest" / "leap-seconds.list"
    table = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            table.append((int(parts[0]) - 2208988800, int(parts[1])))  # NTP seconds from 1900 to Unix
    except (OSError, ValueError, IndexError):
        table = [(1483228800, 37)]  # 2017-01-01: TAI − UTC = 37 s (IERS Bulletin C 52)
    return table


LEAPS = leap_seconds()


def tai_minus_utc(unix: float) -> int:
    value = 10
    for when, delta in LEAPS:
        if unix >= when:
            value = delta
    return value


def tt_of_unix(unix: float) -> float:
    """Seconds of TT from J2000.0 at a Unix instant: the SI seconds elapsed since 2000-01-01T12:00 UTC
    (the Unix count plus the leap seconds inserted since, TAI − UTC − 32) and the 64.184 s by which
    J2000.0 (12:00 TT) precedes that instant."""
    return (unix - UNIX_J2000_UTC) + tai_minus_utc(unix) + 32.184


def unix_of_tt(tt: float) -> float:
    u = tt + UNIX_J2000_UTC - 69.184
    for _ in range(3):
        u = tt - tai_minus_utc(u) - 32.184 + UNIX_J2000_UTC
    return u


class MissionClock:
    """The world's clock: TT at a wall instant, a rate (TT seconds per wall second; negative runs back),
    running or paused. Every page and every sensor reads this one clock."""

    def __init__(self):
        self.lock = threading.Lock()
        now = time.time()
        self.tt0, self.wall0, self.rate, self.running = tt_of_unix(now), now, 1.0, True

    def now(self, wall: float | None = None) -> float:
        wall = time.time() if wall is None else wall
        with self.lock:
            return self.tt0 + (self.rate * (wall - self.wall0) if self.running else 0.0)

    def _anchor(self) -> None:
        now = time.time()
        self.tt0 = self.tt0 + (self.rate * (now - self.wall0) if self.running else 0.0)
        self.wall0 = now

    def command(self, action: str, tt: float | None = None, rate: float | None = None) -> dict:
        with self.lock:
            self._anchor()
            if action == "set" and tt is not None:
                self.tt0 = float(tt)
            elif action == "rate" and rate is not None:
                if not math.isfinite(rate) or abs(rate) > 1e9:
                    raise ValueError("a rate is a finite number of TT seconds per second, at most 10⁹")
                self.rate = float(rate)
            elif action == "play":
                self.running = True
            elif action == "pause":
                self.running = False
            elif action == "present":
                self.tt0, self.rate, self.running = tt_of_unix(self.wall0), 1.0, True
            elif action != "read":
                raise ValueError(f"unknown clock action {action!r}: set, rate, play, pause, present, read")
        return self.state()

    def state(self) -> dict:
        wall = time.time()
        with self.lock:
            tt = self.tt0 + (self.rate * (wall - self.wall0) if self.running else 0.0)
            return {"tt_s": tt, "wall": wall, "rate": self.rate, "running": self.running,
                    "present_tt_s": tt_of_unix(wall), "from_present_s": tt - tt_of_unix(wall),
                    "about": "TT seconds from J2000.0 at the wall's Unix time; the page extrapolates tt_s + rate (now − wall)"}

    def for_engine(self) -> dict:
        s = self.state()
        return {"tt_s": s["tt_s"], "wall": s["wall"], "rate": s["rate"], "running": s["running"]}


# ---- the bus ---------------------------------------------------------------------------------------

class Bus:
    """The readings delivered, in order, each with a sequence number; the latest of each sensor."""

    def __init__(self, size: int = 6000):
        self.items: collections.deque = collections.deque(maxlen=size)
        self.latest: dict[str, dict] = {}
        self.seq = 0
        self.changed = threading.Condition()

    def append(self, readings: list[dict]) -> None:
        if not readings:
            return
        with self.changed:
            for r in readings:
                self.seq += 1
                r["seq"] = self.seq
                self.items.append(r)
                key = r.get("sensor") or r.get("id") or "event"
                if not r.get("event"):
                    self.latest[key] = r
            self.changed.notify_all()

    def since(self, seq: int, wait: float = 0.0, limit: int = 500) -> dict:
        deadline = time.time() + max(0.0, min(wait, 25.0))
        with self.changed:
            while self.seq <= seq and time.time() < deadline:
                self.changed.wait(max(0.0, deadline - time.time()))
            out = [r for r in self.items if r["seq"] > seq][-limit:]
            return {"seq": self.seq, "readings": out}

    def snapshot(self) -> dict:
        with self.changed:
            return {"seq": self.seq, "latest": dict(self.latest), "events": [r for r in self.items if r.get("event")][-60:]}


# ---- the physical sources --------------------------------------------------------------------------

def fetch_json(url: str, timeout: float = 12.0):
    request = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def unix_of_iso(text: str) -> float:
    """A UTC time tag (2026-10-28T05:55:02, with or without Z or fractions) as Unix seconds."""
    import datetime as dt
    text = text.strip().replace(" ", "T").rstrip("Z")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return dt.datetime.strptime(text, fmt).replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError:
            continue
    raise ValueError(f"not a time tag: {text!r}")


def registry_feeds(dataset: str) -> dict[str, dict]:
    try:
        d = json.loads((REGISTRY / f"{dataset}.json").read_text(encoding="utf-8"))
        return {f["id"]: f for f in d.get("feeds", [])}
    except (OSError, ValueError, KeyError):
        return {}


SWPC = registry_feeds("noaa-swpc")


class Adapter:
    """A physical source: what it reads, how often, how critical, and how (run)."""
    id = family = title = kernel = provenance = ""
    clock, period_s, criticality, server, mount = "wall", 60.0, 1, "io", ""
    deadline_s = 15.0       # a network fetch, its timeout included
    window_s = 3 * 3600.0   # a reading is of the present if measured within this of now
    about = ""

    def spec(self) -> dict:
        return {"id": self.id, "family": self.family, "title": self.title, "external": True, "kernel": self.kernel,
                "provenance": self.provenance, "clock": self.clock, "period_s": self.period_s, "criticality": self.criticality,
                "server": self.server, "mount": self.mount, "cost_s": 0.5, "deadline_s": self.deadline_s,
                "coverage": {"present_only": True, "window_s": self.window_s, "about": self.about}}

    def run(self, job: dict, ctx: "Acquisition") -> dict:
        raise NotImplementedError

    def reading(self, job: dict, values: dict, units: dict, measured_unix: float | None = None, **extra) -> dict:
        measured = measured_unix if measured_unix is not None else time.time()
        return {"sensor": self.id, "family": self.family, "title": self.title, "kernel": self.kernel, "provenance": self.provenance,
                "criticality": self.criticality, "available": True, "values": values, "units": units,
                "tt_s": tt_of_unix(measured), "measured_unix": measured,
                "time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(measured)), **extra}


class NtpAdapter(Adapter):
    id, family, title, kernel, provenance = "ntp", "clock.ntp", "Host clock against NTP", "clock", "physical"
    period_s, criticality, deadline_s = 128.0, 1, 6.0
    about = "the NTP pool's servers (pool.ntp.org), queried at most every two minutes"

    def run(self, job, ctx):
        # SNTP (RFC 4330): a mode-3 request; t1 sent, t2 received by the server, t3 sent by it, t4 received.
        ntp_epoch = 2208988800
        packet = bytearray(48)
        packet[0] = (0 << 6) | (4 << 3) | 3
        t1 = time.time()
        struct.pack_into("!II", packet, 40, int(t1) + ntp_epoch, int((t1 % 1) * 2**32))
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(4.0)
            address = socket.getaddrinfo("pool.ntp.org", 123, socket.AF_INET)[0][4]
            s.sendto(bytes(packet), address)
            data, _ = s.recvfrom(512)
        t4 = time.time()
        if len(data) < 48:
            raise ValueError("a short NTP reply")
        stratum = data[1]
        def stamp(offset):
            sec, frac = struct.unpack_from("!II", data, offset)
            return sec - ntp_epoch + frac / 2**32
        t2, t3 = stamp(32), stamp(40)
        if stratum == 0:
            raise ValueError("the server answered with a kiss-of-death (stratum 0)")
        offset = ((t2 - t1) + (t3 - t4)) / 2
        delay = (t4 - t1) - (t3 - t2)
        return self.reading(job, {"offset_s": offset, "delay_s": delay, "stratum": stratum, "server": address[0]},
                            {"offset_s": "s", "delay_s": "s"}, t4,
                            about="the host's clock minus UTC as the server keeps it: θ = ((t₂ − t₁) + (t₃ − t₄))/2, δ = (t₄ − t₁) − (t₃ − t₂) (RFC 4330 §5)")


class SwpcWind(Adapter):
    id, family, title, kernel, provenance = "swpc.wind", "feed.swpc.wind", "Solar wind at L1", "feed", "physical"
    period_s, criticality = 60.0, 1
    about = "NOAA SWPC real-time solar wind, the spacecraft in use at the Sun–Earth L1 point, one-minute values of the last day"

    def run(self, job, ctx):
        rows = fetch_json(SWPC["rtsw-wind"]["url"])
        row = next((r for r in rows if r.get("active") and r.get("proton_speed") is not None), None)
        if row is None:
            raise ValueError("no active spacecraft's plasma in the feed")
        ctx.set_input("speed", {"speed_m_s": row["proton_speed"] * 1e3, "speed_tt_s": tt_of_unix(unix_of_iso(row["time_tag"]))})
        return self.reading(job, {"speed_m_s": row["proton_speed"] * 1e3, "density_m3": (row.get("proton_density") or float("nan")) * 1e6,
                                  "temperature_K": row.get("proton_temperature"), "spacecraft": row.get("source")},
                            {"speed_m_s": "m/s", "density_m3": "m⁻³", "temperature_K": "K"}, unix_of_iso(row["time_tag"]))


class SwpcImf(Adapter):
    id, family, title, kernel, provenance = "swpc.imf", "feed.swpc.imf", "Interplanetary magnetic field", "feed", "physical"
    period_s, criticality = 60.0, 1
    about = "NOAA SWPC real-time magnetometer at L1, GSM and GSE axes, one-minute values; its GSE series drives the Moon's virtual magnetometers"

    def run(self, job, ctx):
        rows = fetch_json(SWPC["rtsw-mag"]["url"])
        row = next((r for r in rows if r.get("active") and r.get("bt") is not None), None)
        if row is None:
            raise ValueError("no active spacecraft's field in the feed")
        nt = 1e-9
        # The active spacecraft's last six hours, for the virtual magnetometers on the Moon, which take the
        # value measured at L1 one solar-wind travel time before (about an hour).
        series = sorted([tt_of_unix(unix_of_iso(r["time_tag"])), r["bx_gse"] * nt, r["by_gse"] * nt, r["bz_gse"] * nt]
                        for r in rows if r.get("active") and r.get("bx_gse") is not None and r.get("source") == row.get("source"))
        ctx.set_input("imf", {"imf_gse": series[-360:], "spacecraft": row.get("source")})
        return self.reading(job, {"total_T": row["bt"] * nt, "bx_gsm_T": row["bx_gsm"] * nt, "by_gsm_T": row["by_gsm"] * nt,
                                  "bz_gsm_T": row["bz_gsm"] * nt, "bx_gse_T": row["bx_gse"] * nt, "by_gse_T": row["by_gse"] * nt,
                                  "bz_gse_T": row["bz_gse"] * nt, "frame": "GSM", "spacecraft": row.get("source")},
                            {"total_T": "T", "bx_gsm_T": "T", "by_gsm_T": "T", "bz_gsm_T": "T", "bx_gse_T": "T", "by_gse_T": "T", "bz_gse_T": "T"},
                            unix_of_iso(row["time_tag"]),
                            about="GSM: x toward the Sun, z the projection of the geomagnetic dipole's axis; GSE: x toward the Sun, "
                                  "z the ecliptic's pole (frames of the magnetosphere, not yet in the catalogue)")


class SwpcKp(Adapter):
    id, family, title, kernel, provenance = "swpc.kp", "feed.swpc.kp", "Planetary K index", "feed", "physical"
    period_s, criticality = 600.0, 0
    window_s = 6 * 3600.0
    about = "NOAA SWPC's estimated planetary K index from ground magnetometers, three-hourly"

    def run(self, job, ctx):
        rows = fetch_json(SWPC["kp"]["url"])
        row = rows[-1]
        kp = float(row["Kp"])
        storm = "G5" if kp >= 9 else "G4" if kp >= 8 else "G3" if kp >= 7 else "G2" if kp >= 6 else "G1" if kp >= 5 else "none"
        return self.reading(job, {"kp": kp, "a_running": row.get("a_running"), "storm": storm}, {}, unix_of_iso(row["time_tag"]),
                            about="NOAA's geomagnetic storm scale: G1 at Kp = 5 … G5 at Kp = 9")


class GoesXray(Adapter):
    id, family, title, kernel, provenance = "goes.xray", "feed.goes.xray", "Solar X-rays (GOES)", "feed", "physical"
    period_s, criticality = 60.0, 1
    about = "the primary GOES satellite's X-ray sensor, 0.1–0.8 nm, one-minute values"

    def run(self, job, ctx):
        rows = [r for r in fetch_json(SWPC["goes-xrays"]["url"]) if r.get("energy") == "0.1-0.8nm" and r.get("flux") is not None]
        if not rows:
            raise ValueError("no 0.1–0.8 nm flux in the feed")
        row = rows[-1]
        flux = float(row["flux"])
        letter, base = next(((l, b) for l, b in (("X", 1e-4), ("M", 1e-5), ("C", 1e-6), ("B", 1e-7), ("A", 1e-8)) if flux >= b), ("A", 1e-8))
        cls = f"{letter}{flux / base:.1f}"
        out = self.reading(job, {"flux_w_m2": flux, "class": cls, "satellite": row.get("satellite")}, {"flux_w_m2": "W/m²"},
                           unix_of_iso(row["time_tag"]), about="the flare class: A, B, C, M, X from 10⁻⁸, 10⁻⁷, 10⁻⁶, 10⁻⁵, 10⁻⁴ W/m²")
        if letter in ("M", "X") and ctx.note_once(f"flare:{row['time_tag']}" if letter == "X" else f"flare:{row['time_tag'][:13]}"):
            ctx.event({"id": f"flare-{row['time_tag']}", "sensor": self.id, "kind": "solar flare", "title": f"Solar X-ray flux at class {cls}",
                       "criticality": 2 if letter == "M" else 3, "provenance": "physical", "values": {"class": cls, "flux_w_m2": flux},
                       "tt_s": tt_of_unix(unix_of_iso(row["time_tag"])), "time_utc": row["time_tag"]})
        return out


class GoesProtons(Adapter):
    id, family, title, kernel, provenance = "goes.protons", "feed.goes.protons", "Energetic protons (GOES)", "counter", "physical"
    period_s, criticality = 300.0, 1
    about = "the primary GOES satellite's integral proton flux, five-minute values"

    def run(self, job, ctx):
        rows = [r for r in fetch_json(SWPC["goes-protons"]["url"]) if r.get("energy") == ">=10 MeV" and r.get("flux") is not None]
        if not rows:
            raise ValueError("no ≥10 MeV flux in the feed")
        row = rows[-1]
        pfu = float(row["flux"])
        scale = "S5" if pfu >= 1e5 else "S4" if pfu >= 1e4 else "S3" if pfu >= 1e3 else "S2" if pfu >= 1e2 else "S1" if pfu >= 10 else "none"
        out = self.reading(job, {"flux_pfu": pfu, "radiation_storm": scale, "satellite": row.get("satellite")},
                           {"flux_pfu": "cm⁻² s⁻¹ sr⁻¹"}, unix_of_iso(row["time_tag"]),
                           about="NOAA's solar radiation storm scale: S1 at 10 pfu above 10 MeV … S5 at 10⁵")
        if scale != "none" and ctx.note_once(f"protons:{scale}:{row['time_tag'][:10]}"):
            ctx.event({"id": f"protons-{row['time_tag']}", "sensor": self.id, "kind": "radiation storm", "title": f"Solar radiation storm {scale}",
                       "criticality": 2, "provenance": "physical", "values": {"flux_pfu": pfu, "scale": scale},
                       "tt_s": tt_of_unix(unix_of_iso(row["time_tag"])), "time_utc": row["time_tag"]})
        return out


class UsgsQuakes(Adapter):
    id, family, title, kernel, provenance = "usgs.quakes", "feed.usgs.earthquakes", "Earthquakes (USGS)", "event-detector", "physical"
    period_s, criticality = 60.0, 2
    window_s = 86400.0
    about = "the USGS's earthquakes of magnitude 2.5 and more of the past day (ComCat's real-time feed)"
    URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"  # registry: usgs-earthquakes

    def __init__(self):
        self.seen: set[str] = set()
        self.first = True

    def run(self, job, ctx):
        data = fetch_json(self.URL)
        features = data.get("features", [])
        largest = max(features, key=lambda f: f["properties"].get("mag") or 0, default=None)
        for f in sorted(features, key=lambda f: f["properties"]["time"]):
            if f["id"] in self.seen:
                continue
            self.seen.add(f["id"])
            if self.first:
                continue  # the day before the session is the summary's, not news
            p, (lon, lat, depth) = f["properties"], f["geometry"]["coordinates"]
            mag = p.get("mag") or 0
            ctx.event({"id": f"quake-{f['id']}", "sensor": self.id, "kind": "earthquake", "title": f"M {mag:.1f} {p.get('place', '')}",
                       "criticality": 3 if mag >= 7 else 2 if mag >= 6 else 1, "provenance": "physical",
                       "values": {"magnitude": mag, "place": p.get("place"), "depth_m": depth * 1e3, "latitude_deg": lat, "longitude_deg": lon,
                                  "tsunami": bool(p.get("tsunami")), "url": p.get("url")},
                       "address": f"earth({abs(lat):.4f} {'N' if lat >= 0 else 'S'}, {abs(lon):.4f} {'E' if lon >= 0 else 'W'}, {-depth * 1e3:.0f} m)",
                       "tt_s": tt_of_unix(p["time"] / 1000), "time_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(p["time"] / 1000))})
        self.first = False
        values = {"count_24h": len(features)}
        if largest:
            values.update({"largest_magnitude": largest["properties"].get("mag"), "largest_place": largest["properties"].get("place")})
        return self.reading(job, values, {}, data.get("metadata", {}).get("generated", time.time() * 1000) / 1000)


class HomeStation(Adapter):
    id, family, title, kernel, provenance = "home.station", "observation.sensors", "Our own stations", "point-probe", "physical"
    period_s, criticality = 30.0, 0
    about = "the user's own sensors (observation/sensors): the latest reading of each source"

    def run(self, job, ctx):
        sys.path.insert(0, str(ROOT / "observation" / "sensors"))
        import store
        sources = store.sources()
        if not sources:
            raise ValueError("no sources in the store of our own sensors (observation/sensors/README.md says how to add one)")
        values, newest = {}, 0.0
        for s in sources:
            last = store.read(s["name"], limit=1)
            if not last:
                continue
            r = last[-1]
            t = r["time"] / 1000 if isinstance(r["time"], (int, float)) else unix_of_iso(r["time"])
            newest = max(newest, t)
            values[s["name"]] = {"station": r.get("station"), "values": r.get("values"), "time_unix": t}
        return self.reading(job, values, {}, newest or time.time(), about="values in SI units, named by CF standard names")


class TerrainProbe(Adapter):
    id, family, title, kernel, provenance = "terrain.probe", "terrain.dem", "Terrain beneath the observer", "point-probe", "archive"
    period_s, criticality, mount = 30.0, 0, "observer"
    window_s = float("inf")
    about = "the data library's terrain sources at the observer: Terrarium and ETOPO 2022 on the Earth, LOLA on the Moon"

    def spec(self):
        s = super().spec()
        s["coverage"] = {"present_only": False, "about": self.about}
        return s

    def run(self, job, ctx):
        import numpy as np
        place = ctx.observer_place
        if not place:
            raise ValueError("no observer")
        lon, lat, body = np.array([place["longitude_deg"]]), np.array([place["latitude_deg"]]), place["body"]
        terrain = ctx.terrain
        if body == "earth":
            values, (land, sea), src = terrain.terrarium().sample(lon, lat, 13)
            first = lambda x: float(np.asarray(x, dtype=float).ravel()[0])
            height = first(values)
            out = {"height_m": height, "datum": "orthometric (EGM96)", "resolution_m": first(land if height >= 0 else sea), "sources": list(src)}
            try:
                out["etopo_m"] = first(terrain.etopo().sample(lon, lat))
            except Exception:
                pass
        elif body == "moon":
            h, measured = terrain.lola().sample(lon, lat, 128)
            out = {"height_m": float(h[0]), "datum": "the Moon's sphere of 1737.4 km", "measured_pixel": bool(measured[0]), "resolution_m": 237.0,
                   "sources": ["LOLA LDEM_128 and LDEC_128"]}
        else:
            raise ValueError(f"no terrain of {body}")
        return self.reading(job, out, {"height_m": "m", "resolution_m": "m", "etopo_m": "m"}, None,
                            place={"latitude_deg": place["latitude_deg"], "longitude_deg": place["longitude_deg"], "body": body})


def adapters() -> list[Adapter]:
    return [NtpAdapter(), SwpcWind(), SwpcImf(), SwpcKp(), GoesXray(), GoesProtons(), UsgsQuakes(), HomeStation(), TerrainProbe()]


# ---- the engine's sensors ----------------------------------------------------------------------------

TRANQUILITY = "moon(0.674 N, 23.473 E)"
# Reiner Gamma, the swirl of Oceanus Procellarum, on one of the Moon's strongest anomalies; and 30 km
# above it, the height of Lunar Prospector's lowest passes.
REINER_GAMMA = "moon(7.5 N, 59.0 W)"
REINER_GAMMA_30KM = "moon(7.5 N, 59.0 W, 30 km)"  # Tranquility Base, the Apollo 11 site, to about 30 m


def virtual_sensors() -> list[dict]:
    """The session's virtual instruments: an environment suite at the observer (a compass and the Moon's
    magnetometer among them, each answering only where it can), a clock, the ISS, a station at
    Tranquility Base, and magnetometers on and over Reiner Gamma, one of them with the crust's scales
    finer than the data drawn from their law."""
    s = [
        {"id": "clock", "family": "clock.scales", "period_s": 1, "criticality": 2},
        {"id": "observer.position", "family": "position.truth", "mount": "observer", "period_s": 1, "criticality": 1},
        {"id": "observer.sun", "family": "sun.sensor", "mount": "observer", "period_s": 1, "criticality": 1},
        {"id": "observer.sky", "family": "sky.bodies", "mount": "observer", "period_s": 5, "criticality": 0},
        {"id": "observer.gnss", "family": "gnss.receiver", "mount": "observer", "period_s": 1, "criticality": 1},
        {"id": "observer.magnetometer", "family": "magnetometer.wmm2025", "mount": "observer", "period_s": 1, "criticality": 1},
        {"id": "observer.gravity", "family": "gravimeter.body", "mount": "observer", "period_s": 10, "criticality": 0},
        {"id": "observer.atmosphere", "family": "atmosphere.ussa1976", "mount": "observer", "period_s": 2, "criticality": 1},
        {"id": "observer.radiosonde", "family": "radiosonde.ussa1976", "mount": "observer", "period_s": 30, "criticality": 0},
        {"id": "iss.position", "family": "position.truth", "mount": "satellite:25544", "period_s": 1, "criticality": 1},
        {"id": "iss.sun", "family": "sun.sensor", "mount": "satellite:25544", "period_s": 1, "criticality": 1},
        {"id": "iss.magnetometer", "family": "magnetometer.wmm2025", "mount": "satellite:25544", "period_s": 2, "criticality": 0},
        {"id": "tranquility.sun", "family": "sun.sensor", "mount": TRANQUILITY, "title": "Sun at Tranquility Base", "period_s": 5, "criticality": 0},
        {"id": "tranquility.sky", "family": "sky.bodies", "mount": TRANQUILITY, "title": "Sky at Tranquility Base", "period_s": 10, "criticality": 0},
        {"id": "tranquility.gravity", "family": "gravimeter.body", "mount": TRANQUILITY, "title": "Gravity at Tranquility Base", "period_s": 30, "criticality": 0},
        {"id": "observer.compass", "family": "compass.magnetic", "mount": "observer", "period_s": 1, "criticality": 1},
        {"id": "observer.moon_magnetometer", "family": "magnetometer.moon", "mount": "observer", "period_s": 2, "criticality": 0},
        {"id": "tranquility.magnetometer", "family": "magnetometer.moon", "mount": TRANQUILITY, "title": "Magnetometer at Tranquility Base", "period_s": 5, "criticality": 0},
        {"id": "reiner_gamma.magnetometer", "family": "magnetometer.moon", "mount": REINER_GAMMA, "title": "Magnetometer on Reiner Gamma",
         "period_s": 5, "criticality": 0, "settings": {"synthetic": True}},
        {"id": "reiner_gamma.30km", "family": "magnetometer.moon", "mount": REINER_GAMMA_30KM, "title": "Magnetometer 30 km over Reiner Gamma",
         "period_s": 5, "criticality": 0},
    ]
    return s


# ---- the loop ------------------------------------------------------------------------------------------

class Acquisition:
    """Steps the engine's session a few times a second and at once on an event; runs the planned external
    jobs on I/O workers in the engine's order; keeps the readings on the bus."""

    def __init__(self, engine_module, clock: MissionClock, terrain, satellites_dir: Path, address_engine=None, interval: float = 0.25):
        self.engine = engine_module.Engine()   # a process of its own: acquisition never waits for the page's requests
        self.address_engine = address_engine   # the page's engine, to resolve the observer's address
        self.clock, self.terrain, self.satellites_dir, self.interval = clock, terrain, satellites_dir, interval
        self.bus = Bus()
        self.adapters = {a.id: a for a in adapters()}
        self.extra: list[dict] = []
        self.io = ThreadPoolExecutor(max_workers=4, thread_name_prefix="cosmopoiesis-io")
        self.done: queue.Queue = queue.Queue()
        self.events: queue.Queue = queue.Queue()
        self.wake = threading.Event()
        self.lock = threading.Lock()
        self.running_jobs: set[str] = set()
        self.noted: set[str] = set()
        # The Royal Observatory at Greenwich, until the page chooses: its ground 45.3 m above the geoid (the UK's 2 m
        # LIDAR, through the terrain probe) and the geoid 45.8 m above WGS 84 (EGM96): 91 m above the ellipsoid.
        self.observer = "earth(51.4769 N, 0.0005 W, 91 m)"
        self.observer_place: dict | None = None
        # kernel: "probe" reports what the kernel would grant; "fifo" asks it for SCHED_FIFO for the engine's workers.
        self.policy = {"order": "edf", "aging": False, "aging_step_s": 0.05, "budget": 0.6, "target": 0.8, "kernel": "probe"}
        self.servers = [{"name": "io", "budget_s": 2.0, "period_s": 10.0}]
        self.generation = -1
        self.configured: dict = {}
        self.described_at = 0.0
        self.stats: dict = {}
        self.trace: collections.deque = collections.deque(maxlen=8000)
        self.error: str | None = None
        self.now_requests: list[str] = []
        self.inputs: dict = {}
        self.inputs_changed = False
        self.thread = threading.Thread(target=self.loop, daemon=True, name="cosmopoiesis-acquisition")

    def start(self) -> None:
        self.thread.start()

    # -- what the adapters call back
    def set_input(self, name: str, value: dict) -> None:
        """A physical source's input for the virtual instruments (the solar wind's field and speed)."""
        with self.lock:
            self.inputs[name] = value
            self.inputs_changed = True

    def event(self, e: dict) -> None:
        e.setdefault("event", True)
        self.events.put(e)
        self.wake.set()

    def note_once(self, key: str) -> bool:
        with self.lock:
            if key in self.noted:
                return False
            self.noted.add(key)
            return True

    # -- configuration
    def elements(self) -> list[dict]:
        out = []
        for g in ("stations", "gps-ops", "galileo", "visual"):
            f = self.satellites_dir / g / "gp.tle"
            if f.exists():
                out.append({"path": str(f), "group": g, "stamp": str(int(f.stat().st_mtime))})
        return out

    def sensors(self) -> list[dict]:
        return virtual_sensors() + [a.spec() for a in self.adapters.values()] + self.extra

    def configure(self, **changes) -> dict:
        with self.lock:
            if "observer" in changes and changes["observer"]:
                self.observer = changes["observer"]
                self.observer_place = None
            if "policy" in changes and isinstance(changes["policy"], dict):
                self.policy.update({k: v for k, v in changes["policy"].items() if k in self.policy})
            # Instruments the page mounts: virtual families on a mount, with an id of their own.
            for spec in changes.get("sensors_add") or []:
                if not isinstance(spec, dict) or not str(spec.get("id", "")).startswith("user.") or spec.get("external"):
                    raise ValueError("a mounted instrument has an id beginning user. and is a virtual family")
                self.extra = [x for x in self.extra if x["id"] != spec["id"]] + [{k: spec[k] for k in ("id", "family", "mount", "period_s", "criticality", "title", "settings") if k in spec}]
            removed = set(changes.get("sensors_remove") or [])
            if removed:
                self.extra = [x for x in self.extra if x["id"] not in removed]
        request = {"op": "acquire.configure", "session": "live", "elements": self.elements(), "sensors": self.sensors(),
                   "servers": self.servers, "policy": self.policy, "observer": self.observer}
        answer = self.engine.ask(request, timeout=30)
        if "error" not in answer:
            self.configured = answer
            self.generation = self.engine.generation
            self.resolve_observer()
            self.now_requests += [s["id"] for s in self.sensors() if s.get("mount") == "observer"]
            self.inputs_changed = True  # a new session has not been told the solar wind
            self.wake.set()
        return answer

    def resolve_observer(self) -> None:
        if not self.address_engine:
            return
        a = self.address_engine.ask({"op": "address", "text": self.observer, "time": f"unix:{time.time()}",
                                     "answers": [{"frame": "ITRS", "chart": ""}]}, timeout=20)
        if "error" in a:
            self.observer_place = None
            return
        body = a["event"].get("body") or ""
        frame = a["answers"][0] if a.get("answers") else {}
        if body == "moon":
            b = self.address_engine.ask({"op": "address", "text": self.observer, "time": f"unix:{time.time()}"}, timeout=20)
            frame = next((x for x in b.get("answers", []) if x.get("chart") == "planetocentric"), {})
        v = frame.get("values", {})
        if "latitude_deg" in v:
            self.observer_place = {"latitude_deg": v["latitude_deg"], "longitude_deg": v["longitude_deg"], "height_m": v.get("height_m", 0), "body": body}

    def world_inputs(self) -> dict:
        """What the session's world holds beside the sources the server names: the satellites' element sets, the
        solar wind as the session was last told it, the present (TT seconds from J2000.0), the seed and the observer.
        A computation in another engine process that must read the same world (the page's cubes, probe_volume)
        is given these, so that the session's engine never pauses for it."""
        with self.lock:
            inputs = {"solar_wind": {**self.inputs.get("imf", {}), **self.inputs.get("speed", {})}} if self.inputs else {}
            observer = self.observer
        seed = (self.configured or {}).get("seed")
        return {"elements": self.elements(), "inputs": inputs, "now_tt_s": tt_of_unix(time.time()),
                "seed": seed, "observer": observer}

    def request_now(self, ids: list[str]) -> None:
        with self.lock:
            self.now_requests += ids
        self.wake.set()

    # -- the loop
    def loop(self) -> None:
        while True:
            self.wake.wait(self.interval)
            self.wake.clear()
            try:
                self.step()
                self.error = None
            except Exception as error:  # the loop goes on; the page shows why it stalled
                self.error = f"{type(error).__name__}: {error}"
                time.sleep(1.0)

    def step(self) -> None:
        if self.generation != self.engine.generation or not self.configured:
            answer = self.configure()
            if "error" in answer:
                raise RuntimeError(answer["error"])
        external, events = [], []
        while not self.done.empty():
            external.append(self.done.get_nowait())
        while not self.events.empty():
            events.append(self.events.get_nowait())
        with self.lock:
            now, self.now_requests = self.now_requests, []
            inputs = {}
            if self.inputs_changed and self.inputs:
                inputs = {"solar_wind": {**self.inputs.get("imf", {}), **self.inputs.get("speed", {})}}
                self.inputs_changed = False
        request = {"op": "acquire.step", "session": "live", "clock": self.clock.for_engine(), "wall": time.time(),
                   "interval_s": self.interval, "external": external, "events": events, "now": now, "now_tt_s": tt_of_unix(time.time())}
        if inputs:
            request["inputs"] = inputs
        answer = self.engine.ask(request, timeout=20)
        if "error" in answer:
            if "no instrument" in answer["error"] or self.generation != self.engine.generation:
                self.configured = {}
            raise RuntimeError(answer["error"])
        self.bus.append(answer.get("readings", []))
        self.trace.extend(answer.get("trace", []))
        self.stats = answer.get("stats", {})
        for job in answer.get("plan", []):
            sid = job["sensor"]
            adapter = self.adapters.get(sid)
            if adapter is None:
                continue
            with self.lock:
                if sid in self.running_jobs:
                    continue  # the previous job is still out: a feed is not asked twice at once
                self.running_jobs.add(sid)
            self.io.submit(self.run_external, adapter, job)

    def run_external(self, adapter: Adapter, job: dict) -> None:
        start = time.time()
        try:
            reading = adapter.run(job, self)
        except Exception as error:
            reading = {"sensor": adapter.id, "family": adapter.family, "title": adapter.title, "kernel": adapter.kernel,
                       "provenance": adapter.provenance, "criticality": adapter.criticality, "available": False,
                       "reason": f"{type(error).__name__}: {error}"}
        end = time.time()
        reading.update({"release_wall": job.get("release_wall"), "deadline_wall": job.get("deadline_wall"), "start_wall": start,
                        "end_wall": end, "tick": job.get("tick"), "world_tt_s": job.get("tt_s")})
        if reading.get("available") and adapter.window_s != float("inf"):
            reading["of_the_world_instant"] = abs(self.clock.now() - reading["tt_s"]) <= adapter.window_s
        with self.lock:
            self.running_jobs.discard(adapter.id)
        self.done.put(reading)
        if adapter.criticality >= 2:
            self.wake.set()  # a critical source's reading goes out at once

    def describe(self) -> dict:
        # The sensors' counters (released, skipped, late, the measured cost) are the engine's, read
        # afresh at most once a second; the configuration's answer holds them as they were then.
        if self.configured and time.monotonic() - self.described_at > 1.0:
            try:
                answer = self.engine.ask({"op": "acquire.describe", "session": "live"}, timeout=10)
                if "error" not in answer:
                    self.configured = answer
                    self.described_at = time.monotonic()
            except Exception:  # the last description stands
                pass
        return {"session": self.configured, "stats": self.stats, "observer": self.observer, "observer_place": self.observer_place,
                "policy": self.policy, "servers": self.servers, "error": self.error, "interval_s": self.interval,
                "sources": [{**a.spec(), "about": a.about} for a in self.adapters.values()]}

    def analyse(self, body: dict) -> dict:
        return self.engine.ask({"op": "acquire.analyse", "session": "live", **{k: body[k] for k in ("rate", "horizon_s", "burst") if k in body}}, timeout=60)
