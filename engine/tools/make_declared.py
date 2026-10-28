"""Write engine/declared.hpp, the declared families of instruments: every family of the encyclopedia
of instruments the user gave (sections A to J, 2026-10-28), bound to the class of its kernel, with
what it reads, its interaction and its temporal behaviour, and its state in Cosmopoiesis.

    python applications/cosmopoiesis-lab/engine/tools/make_declared.py <encyclopedia.md>

<encyclopedia.md> holds the encyclopedia's tables as the user gave them (lines
"| A01. Family | instruments | observables |"); docs/instruments.md §3 gives each family's kernels,
what it reads and its state. A family is declared, not implemented, unless the state names an
engine family or a server source; mounting a declared family is refused with what it waits for.
"""

import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[2]
DOC = APP / "docs" / "instruments.md"
OUT = APP / "engine" / "declared.hpp"

KERNELS = {
    "point probe": "point_probe", "footprint": "footprint", "line of sight": "line_of_sight", "ranging": "ranging", "counter": "counter",
    "event detector": "event_detector", "proprioceptive": "proprioceptive", "clock": "clock", "protocol": "protocol", "quantum": "quantum",
    "estimator": "estimator", "feed": "feed",
}
CLASSES = {
    "point_probe": "PointProbe", "footprint": "Footprint", "line_of_sight": "LineOfSight", "ranging": "Ranging", "counter": "Counter",
    "event_detector": "EventDetector", "proprioceptive": "Proprioceptive", "clock": "ClockReading", "protocol": "Protocol",
    "quantum": "QuantumMeasurement", "estimator": "Estimator", "feed": "Feed",
}
# The interaction with the world (the encyclopedia's §K): passive unless named here.
ACTIVE = {"A08", "B08", "C06", "D07", "D11", "E05", "E06", "F09"}
MIXED = {"A02": "passive (GNSS) or active (laser, radio, acoustic ranging)", "A05": "passive or active (laser Doppler)",
         "D02": "passive or active (Doppler lidar, profilers)", "D03": "passive or active (ceilometers, radars)",
         "D04": "passive or active (lidar)", "D08": "passive or active (wave radar)", "E07": "contact, some active (nuclear logs)",
         "F06": "passive or active (radar sounders, laser altimeters)", "I08": "active (a measurement changes the state)"}
CONTACT = {"A06", "A07", "A09", "B01", "B03", "B05", "B06", "B09", "B10", "C04", "D12", "E08", "H07", "H09", "J01", "J02", "J03"}
DESTRUCTIVE = {"G01", "G02", "G04", "G05", "G08", "G09", "H02", "H03", "H04", "H10", "D09", "E10"}
VIRTUAL = {"J06", "J07", "J08", "J09", "J10"}
# Temporal behaviour: periodic sampling unless named here.
EVENTS = {"J04", "E01", "F04", "I06", "I07", "H05"}
PROTOCOLS = {"G01", "G02", "G03", "G04", "G05", "G06", "G08", "G09", "H02", "H03", "H08", "H10", "I04", "E05", "E06"}
STREAMS = {"B07", "C05", "F02", "H06", "E09"}

EXTRA = {
    "J09": ("Data-fusion estimators",
            "Kalman state estimator, particle-filter tracker, Bayesian field reconstructor, multisensor localization, environmental data-assimilation system",
            "Inferred states and uncertainties"),
    "J10": ("Simulation validation monitors",
            "Mesh-quality monitor, numerical error estimator, residual monitor, conservation checker, solver convergence detector, boundary-condition monitor, time-step stability monitor",
            "Numerical model diagnostics"),
}


def encyclopedia(path: Path) -> dict:
    rows = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-J]\d\d)\.\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m:
            rows[m.group(1)] = (m.group(2).strip(), m.group(3).strip(), m.group(4).strip())
    rows.update(EXTRA)
    return rows


def documented() -> dict:
    rows = {}
    for line in DOC.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-J]\d\d)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m:
            rows[m.group(1)] = tuple(x.strip() for x in m.groups()[1:])
    return rows


def kernels_of(text: str) -> list:
    out = []
    for part in re.split(r";|,", text):
        word = re.sub(r"\(.*?\)", "", part).strip().lower()
        for k, v in KERNELS.items():
            if word.startswith(k) and v not in out:
                out.append(v)
    return out


# The documents' inline mathematics, as the text of a C++ string: their macros as the symbols they
# stand for, the rest of the markup dropped.
SYMBOLS = [("\\operatorname{tr}", "tr"), ("\\mathbf ", ""), ("\\hat y", "ŷ"), ("\\dot q", "q̇"), ("\\nabla ", "∇"), ("\\nabla", "∇"),
           ("\\varphi", "φ"), ("\\varepsilon", "ε"), ("\\sigma", "σ"), ("\\rho", "ρ"), ("\\mu", "μ"), ("\\eta", "η"), ("\\delta", "δ"),
           ("\\Phi", "Φ"), ("\\Theta", "Θ"), ("\\mid", " | "), ("\\lvert", "|"), ("\\rvert", "|"), ("\\sim", " ~ "), ("\\int", "∫"),
           ("\\big", ""), ("\\,", " ")]


def esc(s: str) -> str:
    for macro, symbol in SYMBOLS:
        s = s.replace(macro, symbol)
    s = s.replace("$", "").replace("`", "").replace("\\(", "").replace("\\)", "").replace("\\", "")
    return s.replace('"', '\\"')


def main() -> None:
    enc = encyclopedia(Path(sys.argv[1]))
    doc = documented()
    codes = sorted(set(enc) | set(doc))
    missing = [c for c in codes if c not in enc or c not in doc]
    if missing:
        raise SystemExit(f"families missing from one source: {missing}")
    lines = []
    for c in codes:
        title, instruments, observables = enc[c]
        _, kernels_text, reads, state = doc[c]
        ks = kernels_of(kernels_text) or (["estimator"] if c in VIRTUAL else [])
        if not ks:
            raise SystemExit(f"{c}: no kernel in '{kernels_text}'")
        interaction = ("active" if c in ACTIVE else MIXED.get(c) or ("contact" if c in CONTACT else "destructive (a sample is taken)" if c in DESTRUCTIVE
                       else "virtual (no physical interaction)" if c in VIRTUAL else "passive"))
        temporal = "event-driven" if c in EVENTS else "a protocol of stages" if c in PROTOCOLS else "a continuous stream" if c in STREAMS else "periodic"
        implemented = "planned" not in state.split(":")[0].lower() and not state.lower().startswith("planned")
        lines.append(f'      {{"{c}", "{esc(title)}", Kernel::{ks[0]}, "{CLASSES[ks[0]]}", "{esc(", ".join(k.replace("_", " ") for k in ks))}", "{esc(reads)}", '
                     f'"{esc(instruments)}", "{esc(observables)}", "{esc(interaction)}", "{temporal}", "{esc(state)}", {"true" if implemented else "false"}}},')
    OUT.write_text(f'''// The declared families of instruments: the encyclopedia of instruments (sections A to J, the user's,
// 2026-10-28), every family bound to the class of its kernel (observation.hpp), with what it reads (a
// base and a fibre, formalism Definition 3.9), how it interacts with the world, when it reads, and its
// state here (docs/instruments.md §3). Written by tools/make_declared.py; edit that, or the documents
// it reads, and run it again.
//
// A declared family is a name and its facts, not a class: what distinguishes a fluxgate from a SQUID
// is a parameter set of one point probe, and a class is written only where the observation operator
// differs (the twelve kernels). An implemented family is a class deriving from its kernel's
// (instruments.hpp, environment.hpp, lunar.hpp) or a source of the server (runtime.py); the others
// are here so that users and developers see what can be built and on what, and mounting one is
// refused with what it waits for.

#pragma once

#include <vector>

#include "observation.hpp"

namespace cosmopoiesis {{

struct DeclaredFamily {{
  const char* code;         // the encyclopedia's, as "C01"
  const char* title;
  Kernel kernel;            // its first kernel
  const char* kernel_class; // the class an implementation derives from
  const char* kernels;      // all the kernels it reads through
  const char* reads;        // base · fibre
  const char* instruments;  // the encyclopedia's makes and methods: parameter sets of the kernel
  const char* observables;
  const char* interaction;  // passive, active, contact, destructive, virtual
  const char* temporal;     // periodic, event-driven, a protocol of stages, a continuous stream
  const char* state;        // implemented by what, or what it waits for
  bool implemented;
}};

inline const std::vector<DeclaredFamily>& declared_families() {{
  static const std::vector<DeclaredFamily> families = {{
{chr(10).join(lines)}
  }};
  return families;
}}

}}  // namespace cosmopoiesis
''', encoding="utf-8")
    print(f"wrote {OUT} ({len(codes)} families, {sum(1 for l in lines if l.rstrip().endswith('true},'))} implemented)")


if __name__ == "__main__":
    main()
