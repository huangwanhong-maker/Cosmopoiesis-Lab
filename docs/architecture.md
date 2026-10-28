# Architecture

*Status: draft, 2026-10-28.* How Cosmopoiesis is structured: its place among the tiers of [The Science Infrastructures](https://github.com/huangwanhong-maker/The-Science-Infrastructures), what it owns and what it composes, its engine, its data, its page, and the slices by which it is built. The mathematics it rests on is [formalism.md](formalism.md); the decision that founded it is [0001](../development/decisions/0001-the-founding-of-cosmopoiesis.md). The infrastructure's own [architecture](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/docs/architecture.md) and [CLAUDE.md](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/CLAUDE.md) govern everything here that they cover.

## 1. Principles

### 1.1 A Work of the Infrastructure

Cosmopoiesis is a *work*: an application with a research arm, organised by purpose, composing the domains and the foundations it needs. It owns no general method and no object of nature. The test of placement of the infrastructure applies to every line of it:

- a method that names no object in nature (a balance law on a complex, a rigid body on $SE(3)$, a Kalman filter, the gluing of two complexes) belongs to a foundation, and Cosmopoiesis asks for it there and uses it;
- an object of nature (the Moon's figure and gravity, seawater, the Earth's rotation, a rover's wheels) belongs to a domain, and Cosmopoiesis composes it;
- what is left to Cosmopoiesis is the composition: the description of a world, the runtime that advances a composed world, the records of experiments, the engine that answers requests, and the page that shows it.

*Rationale.* The preliminary design proposed a framework of its own, with its own units, references, geometry, evidence store and solvers. Every one of these exists in the infrastructure or is planned there, written once for every science; a second copy would drift from the first and be checked by no one. The infrastructure is also what makes the worlds *real*: the Solar System of the Celestial Atlas, the ocean beneath a place of the Earth Atlas, the body maps with their live tiles, the time scales and frames of metrology, are the materials of Cosmopoiesis's worlds, not things to be rebuilt.

### 1.2 Physics First, Geometry First, as Equations

A world is a field configuration on a space with a geometry, governed by actions and balance laws, with symmetries that act on it and shapes given by equations (formalism §§1–7). Learned components may estimate and control (§8), never replace the physics. Sampled data are evidence about equations: a digital elevation model is evidence about a terrain, not the terrain.

### 1.3 Exact Where the Structure Allows

Where the mathematics gives an exact discrete structure, the engine uses it and checks it to rounding: $d\circ d=0$ and Stokes's theorem on cochains, conservation across a shared interface, the momenta of a variational integrator, the configuration variety of a mechanism over the rationals. Where it does not, the method's order is measured and its invariants' drift reported. Every model is verified against a closed form before it is run on a world.

### 1.4 Pure Engine, Effectful Edges

The engine is pure: it reads a request and the files whose paths the request names, computes, and answers; no network, no user interface, no hidden state. The server, the recipe, the data library and the page are the edges. A run's artefacts are files in the data library's cache, named in the answer.

### 1.5 Observables Are Invariants; Controllers See Readings

A sensor reads an invariant of the world with noise and latency (formalism, Proposition 6.1); a controller acts on delivered readings and its own memory (Proposition 8.4). Nothing gives a controller the fields themselves unless an experiment declares that it does.

### 1.6 Growth by Vertical Slices

Each slice is a world that runs end to end: described in World JSON, cellulated on morphe's complexes, advanced by the runtime on physis's and calx's methods, recorded as a run, drawn by the page, checked against a closed form. Interfaces are extracted from the slices, not designed complete in advance (the infrastructure's principle 1.7).

### 1.7 Three Activities

Cosmopoiesis serves **research** (heterogeneous coupling with exact conservation; embedding across scales; physically constrained adaptation; worlds on generated carriers), **learning** (each world a worked example with its closed forms beside it) and **use** (a verified environment in which an agent, simulated or real, can be put).

## 2. What the Preliminary Design Got Right, and What Changes

The preliminary design of 2026-10-28 (fifteen notes, a formalism in its fifth version, a stage plan) was read in full and is kept out of the repository (decision 0001). It is right about the separations it insists on, and it is replaced where it stands apart from the infrastructure or stops short of mathematics.

| The preliminary design | This design |
|---|---|
| A framework of its own: modules `core`, `quantities`, `references`, `geometry`, `fields`, `evidence`, `reconstruction`, `models`, `numerics`, `runtime`, with external libraries behind adapters | A work of the infrastructure: units are physis's, time scales and frames metrology's and astronomy's, figures geodesy's, evidence the data library's, numerics calx's, inference tyche's, drawing the visualization layer's (§3) |
| A tuple $\mathfrak W_{\mathrm{def}}=(\mathcal X,\mathfrak A,\ldots,\mathfrak Q)$ naming responsibilities, with "sections of bundles where the model supports it" and no result stated | A world as a sheaf of fields on a site of regions, coupling as a fibre product over interfaces, conservation across an interface as a theorem of the construction, mechanisms as real algebraic varieties, observables as invariants; eleven propositions, each with its check (formalism §12) |
| "Bounded worlds" of local extent; planetary and astronomical references as later adapters | Worlds at every scale the user named (a galaxy flow, the Solar System, a planet, an ocean basin, a patch), as a chain of embeddings in the frame groupoid with a precision budget (formalism §10), on the ephemerides, rotation models and frames the infrastructure already evaluates |
| A stage plan beginning with typed units, static transforms and epochs | These exist; the first slice is the first thing the infrastructure cannot yet do: a world composed of regions with fields on a complex, advanced with exact balances, recorded and drawn (§9) |
| Gauge discussed as an optional attachment | Kept and made concrete: connections are a kind of field, computed by physis `gauge`; the carrier itself may be the sample of a field theory (formalism §11, after ADR 0040) |
| Observation ≠ reconstruction ≠ simulation ≠ display; never fill silently; `proposed`/`implemented`/`verified`/`validated` | Kept: the four channels are the data library's products with their provenance and the engine's snapshots (formalism §9); the status vocabulary is the infrastructure's (`planned`, `seed`, `draft`, `stable`, `deprecated`), with *verified* and *validated* as the two kinds of claim |
| Candidate libraries (PETSc, SUNDIALS, preCICE, Chrono, Kokkos, AMReX, VTK, 3D Tiles, Zarr) listed for evaluation | The infrastructure's rule: own the interfaces, borrow where it serves, MIT-compatible only, never copyleft by default; calx is the device layer and the solvers' home, three.js the renderer, the data library the formats. None is adopted now; SUNDIALS (BSD) is calx's candidate for stiff and differential-algebraic systems, as the map of the mathematics already says |
| Illustrative YAML, "not a parser contract" | World JSON is a real schema from the first slice, read by the engine and checked by the suite (§5) |
| "Cosmopoiesis Lab" | The infrastructure retired the word; the work is **Cosmopoiesis**, and its directory's suffix is an open decision (§12) |
| Disclaimers repeated in every document | A status stated once, and claims that carry theirs |

What the preliminary design most lacked was the root project. A design that does not know that the Celestial Atlas evaluates DE440 and the IAU rotation models, that the Earth Atlas fetches ETOPO and the ocean beneath a place, that physis already has discrete exterior calculus and the Hodge decomposition on any complex, that calx has task graphs and reproducible random streams, and that tyche is being written for exactly the estimation it defers, will rebuild all of them worse. This design starts from them.

## 3. The Place of Cosmopoiesis in the Infrastructure

### 3.1 What the Work Owns

| Concern | Owner | Where |
|---|---|---|
| The description of a world: carrier, regions, interfaces, frames, fields, materials, models, agents, scenario, experiment (World JSON, Agent JSON, Experiment JSON) | Cosmopoiesis | `worlds/`, `agents/`, `experiments/`, `engine/world.hpp` |
| The cellulation of a described carrier from the foundations' constructions, and its gluing along interfaces | Cosmopoiesis composes; the constructions and the gluing are morphe's and physis's | `engine/carrier.hpp` |
| The binding of a region to a model: which cochains, which law, which constitutive relation, which ports | Cosmopoiesis | `engine/models/` (thin bindings; the laws are physis's) |
| The runtime: preparation, the multirate schedule as a task graph, trial and commit, interface accounting, invariants, snapshots, checkpoints, provenance | Cosmopoiesis | `engine/runtime.hpp` |
| Agents as hybrid systems with ports, sensors, clocks and controllers; delivery queues | Cosmopoiesis composes physis `dynamics`; the mechanics are physis `mechanics`'s | `engine/agents.hpp` |
| The engine's protocol and jobs; the server; the recipe; the page | Cosmopoiesis | `engine/cosmopoiesis.cpp`, `serve.py`, `engine.py`, `recipe.json`, `src/` |
| The worlds' data products (terrain patches, gravity fields, world catalogues) | Cosmopoiesis's recipe, built by the data library's builders | `data/products/` of the infrastructure |
| The checks of all of the above, and the research experiments | Cosmopoiesis | `tests/`, `experiments/` |

### 3.2 What It Uses from the Foundations

Written means usable now; needed means Cosmopoiesis is the first client and asks the foundation for it, in that foundation's decision log (the infrastructure's rule: a general method is written where it belongs and used from there).

| Foundation | Module | Written, used now | Needed, asked for |
|---|---|---|---|
| morphe | `topology` | CW and simplicial complexes, products (box lattices), constructions, validation, homology, persistence | the gluing of two complexes along a shared subcomplex (a pushout); box lattices with boundary; prisms (a complex times an interval) with their cellular structure; subdivision of a cell |
| morphe | `arithmetic`, `algebra` | exact rationals, Smith normal form, determinants | — |
| morphe | `algebraic_geometry` | — (planned) | Gröbner bases over ℚ; the dimension of $V(I)$ and the ideal of its singular locus (formalism §7.3); intersections of quadrics |
| morphe | `combinatorics` | graphs, spanning forests | communication networks of agents (graphs with delays) |
| calx | `linalg` | dense solves, CSR, conjugate gradients, Cholesky, QR, eigenproblems | GMRES or MINRES for indefinite systems; sparse factorisations for many right-hand sides |
| calx | `integrators` | Euler, Heun, RK4, Dormand–Prince 5(4) | implicit and IMEX methods; differential-algebraic systems (index 1 and 3); symplectic and RATTLE; Euler–Maruyama |
| calx | `random`, `scheduler`, `verification`, `differentiation` | Philox streams keyed by purpose; thread pool, task graphs, dynamic loops; checks; jets | — |
| calx | `compute` | the CPU target and lanes | kernels through the IR when a world's fields are large (later) |
| physis | `units` | dimensions and quantities read with their units | compile-time dimensioned types (physis's open decision 1), when the engine's field types want them |
| physis | `geometry` | metrics in charts, curvature, geodesics | rotations and $SE(3)$ as objects (from `symmetry`'s $SU(2)$); charts as objects with transition maps (its open question 2); differential forms |
| physis | `symmetry` | $SU(2)$ as unit quaternions, $SO(3)$ through the cover, the Lorentz group | — |
| physis | `spacetime` | exact solutions, Regge geometry, causal sets, dimensions | — |
| physis | `discretisation` | cochains, $d_0$, $d_1$, potentials, the Hodge decomposition (dense and by conjugate gradients), flows with conductances | the Laplacian on 0-forms with Dirichlet and Neumann data; the de Rham and Whitney maps; circumcentric Hodge stars; the finite-volume balance law on any complex; variational and Lie-group integrators |
| physis | `dynamics` | linear propagators, hybrid systems | events located between grid points; stochastic systems |
| physis | `field_theory`, `gauge`, `quantum_gravity` | scalar fields on complexes, gauge fields on 2-complexes, random geometries, spin foams | — (generated carriers use them as they are) |
| physis | `mechanics` | — (planned) | rigid bodies on $SE(3)$, articulated mechanisms, contact as a hybrid system, $n$ bodies |
| physis | `continuum`, `thermodynamics`, `gravitation` | — (planned) | balance laws with their constitutive closures (heat, mass, momentum, the shallow-water equations), equations of state, hydrostatics; spherical-harmonic potentials and their gradients |
| physis | `control` | — (planned) | feedback, LQR, model-predictive control, system identification |
| physis | `computational_geometry` | points on the sphere and their Delaunay triangulation | triangulations in the plane and in space; distances to semi-algebraic surfaces; exact predicates |
| tyche | `probability`, `descriptive`, `regression` | distributions, summaries, least squares | `assimilation` (Kalman and ensemble filters), `uncertainty` (sensitivity, calibration), `spatial` (kriging, for reconstructions), `learning` |

### 3.3 What It Uses from the Domains

| Domain | Used for | State |
|---|---|---|
| metrology | time scales (TT, TDB, UTC, UT1), the celestial and terrestrial frames and their transformations | built (provisional JavaScript; its C++ to come) |
| astronomy | the JPL ephemeris (DE440) for the positions of the bodies; the IAU rotation models for their body-fixed frames; the Sun's direction at a place and date | built |
| geodesy | the figure of the Earth (WGS 84, GRS 80), geodetic coordinates, local horizon frames | built |
| geophysics, geography | the solid Earth, terrain analysis and drainage, projections for maps of a world | built |
| oceanography | the ocean column, waves, seawater (TEOS-10, planned), bathymetry | built in part |
| meteorology | atmospheric dynamics (the shallow-water model of our own), the standard atmosphere, settling in the wind | built |
| climate, air-sea (planned) | the forcing of a world over seasons; the exchange at the sea surface | built; planned |
| planetary-science | the planets and moons as worlds: the Moon's crustal field and the solar wind's about it (`magnetism`); later figures, gravity fields, surfaces, atmospheres, regolith | **founded** (the infrastructure's ADR 0052, at the user's request), with `magnetism`; its other modules planned |
| robotics | named vehicles, their mechanisms, actuators and sensors | **later**: tier 4 of the map; until then the agents' archetypes live in `agents/` as the work's own, marked provisional (§12) |

A domain is used only through its public interface, and only the domains Cosmopoiesis declares. The order of the domains is not changed by a work: Cosmopoiesis needs the order ideal of the domains it uses, which is most of the Earth and the sky.

### 3.4 What It Uses from the Edges

- **The data library** (`data/`): the manifests, the fetcher, the recipe and the products are the evidence store and the provenance of every world (formalism §9); new datasets and products are registered there (§6).
- **The visualization layer** (`visualization/js/`): complexes realised in space (`complex.js`), surfaces from volumes (`isosurface.js`), particles on the sphere (`flow.js`), contours, display units and map tiles; the scene model with floating origins when it exists.
- **The API** (`api/`): its JSON for the engine (`api/cpp/science/json.hpp`), its plug-in contracts for models and controllers written by others (§8), its stream of readings for real agents.
- **The observation edge** (`observation/sensors`): real sensors' readings, as the inputs of a real agent (formalism §8.4).

### 3.5 Dependencies Point Down

Nothing in the foundations, the domains or the edges depends on Cosmopoiesis; Cosmopoiesis depends on them through their public interfaces and declares which. When a slice needs a method the foundations lack, the method is written in the foundation, with its checks, and committed there first; the engine then uses it. A method written in the engine "for now" is marked provisional in its header, listed in §12, and moved down at the next opportunity.

## 4. The Engine

The engine is header-only C++20 on the foundations and the domains, in the namespace `cosmopoiesis`, built two ways from the same headers: as the program `cosmopoiesis` by `engine.py` into `data/cache/engines/cosmopoiesis/` for the server (as every engine of the infrastructure is built, natively or with g++ in WSL, stale when a header it includes changes), and as a CMake project whose checks are programs on calx `verification`, run by `tests/run-tests.mjs` through the shared harness.

### 4.1 The Headers

| Header | Content |
|---|---|
| `world.hpp` | World, Agent and Experiment JSON read into typed descriptions: carrier, frames, regions, interfaces, fields with kinds and units, materials, models, agents, scenario bindings, the numerical plan, the evaluation; every unit parsed by physis `units`, every frame named, every reference to a dataset resolved to a path given in the request |
| `carrier.hpp` | cellulations from the foundations' constructions (box lattices, spheres and shells, terrains over triangulations, the gluing along interfaces, generated carriers from physis), their geometry (positions or Regge lengths), their Hodge weights, their orientation checked ($\partial\partial=0$) |
| `frames.hpp` | the frame groupoid: the root frame, the morphisms (from the domains' transformations, or from a body's state), the chain of embeddings, the kinematic terms (formalism Proposition 2.2) |
| `fields.hpp` | typed cochains with units and frame tags; traces on interfaces; the de Rham and Whitney maps; sampling at points and footprints; the four channels' answers (a value, or why there is none) |
| `materials.hpp` | occupancy and constitutive bindings: the relation (physis's or a domain's) and the scenario's parameters |
| `models/` | one header per model family, each a binding of a region's cochains to a law of physis and a port set: `heat.hpp`, `balance.hpp` (any balance law with a flux closure), `rigid_body.hpp`, `hydrostatic.hpp`, `shallow_water.hpp`, `nbody.hpp`, `gauge.hpp` (a connection on the carrier's 1-cells) |
| `interfaces.hpp` | ports and port spaces; interface laws (continuity, flux equality, jumps, Robin); the transfer operators between two cellulations of one interface; balances and residuals (formalism §5.5–5.6) |
| `runtime.hpp` | preparation (§4.2); the schedule as a task graph; trial and commit; events and deliveries; invariants; snapshots and checkpoints; the run's manifest with the commits of every library |
| `agents.hpp` | agents as hybrid systems on a configuration variety with ports, sensors (observation operators on footprints, with latency, clocks and seeded noise), actuators, controllers on memory, delivery queues, communication networks; the controller interface that plug-ins implement |
| `cosmopoiesis.cpp` | the program: one JSON request in, one JSON answer out (§4.5) |

### 4.2 Preparation

Before a run advances, the runtime prepares it and refuses what is incomplete, naming the fault:

1. every quantity's unit parsed and its dimension checked against its kind; every frame resolved to a morphism to the root; every dataset binding resolved to a file that exists;
2. the carrier cellulated, each region and interface a subcomplex, $\partial\partial=0$, the orientation consistent across interfaces;
3. every evolving field with exactly one owner (a model), every algebraic field with its closure, every prescribed field with its source; no cycle of dependencies without a declared algebraic solve;
4. every model's requirements met: initial fields on their supports, boundary data on every boundary face, constitutive parameters for every material it touches, the integrator able to take its index;
5. every interface law typed: the ports on both sides of the same kind and unit, the flux shared or a transfer declared, the schedule's steps compatible;
6. every agent's sensors inside the carrier, its controller bound, its clock set;
7. the invariants to watch and the residuals to report named, the seeds and the threads fixed, the manifest frozen.

Preparation proves consistency, not well-posedness; what it cannot check (that a step is stable for a nonlinear law) the run's checks catch.

### 4.3 Advancement

A macro step is a task graph on calx's scheduler: each (region, micro step) a task, the interfaces its edges, the agents' sensor and controller ticks tasks of their own; the graph runs on the machine's threads, the random streams keyed by purpose so that the result does not depend on their number. A macro step is a trial: its states, events and deliveries are committed together when every check passes (admissibility of the fields, the residuals at the interfaces within rounding or the declared transfer error, the integrators' error estimates within tolerance), and discarded together otherwise, with the step halved or the run stopped with the reason. Hybrid events are located and applied within the micro steps; the readings measured during a trial are delivered only on commit (formalism Proposition 8.4).

### 4.4 Snapshots, Checkpoints and Provenance

A **snapshot** is a committed state at a time: the fields' cochains with their cellulation's identity, the bodies' and agents' states, the invariants and residuals, the readings delivered since the last. A **checkpoint** adds what a restart needs: integrators' histories, event queues, controllers' memories, the random streams' counters. Both are written to `data/cache/cosmopoiesis/runs/<id>/` in a binary format with a JSON index, and a run restarted from a checkpoint reproduces an uninterrupted one bitwise on one machine. The **manifest** records the experiment, the engine's build, the commit of every foundation and domain used (the infrastructure's rule, architecture §8), and the retrieval record of every dataset.

### 4.5 The Protocol

One JSON request on the standard input, one JSON answer on the standard output, an error as `{"error": "..."}`; files by their paths; the engine reads nothing else.

| Request | Answer |
|---|---|
| `{"op": "catalogue"}` | the worlds, agents, models, interface laws and integrators the engine knows, with their parameters and units |
| `{"op": "prepare", "experiment": {...}, "paths": {...}}` | the prepared manifest, or the faults |
| `{"op": "run", "experiment", "paths", "until", "snapshots": every, "checkpoints": every, "run": dir}` | the run's directory, its manifest, its final invariants and residuals; progress lines on the standard error as it goes |
| `{"op": "resume", "run": dir, "until"}` | the same, from the last checkpoint |
| `{"op": "sample", "run", "snapshot", "channel", "queries": [{"field", "frame", "points" or "footprint"}]}` | values with their units, or why there is none (outside the support, undefined in the material, no evidence); never a zero for a missing value |
| `{"op": "invariants", "run"}` | the invariants and interface residuals over the run |
| `{"op": "verify", "model", "case"}` | a model's verification case against its closed form: the errors and the measured order |
| `{"op": "status" \| "time" \| "frames" \| "ephemeris" \| "bodies" \| "transform" \| "holonomy" \| "convert" \| "address" \| "geodesic" \| "satellites", …}` | the spacetime of slice S: the world's sources, an instant in every scale, the catalogue of frames, sampled motions of the bodies, transformations, loops' holonomies, a point in every coordinate system, addresses read and answered in every frame and chart, geodesics, satellites (the README, §5) |
| `{"op": "instruments" \| "acquire.configure" \| "acquire.step" \| "acquire.describe" \| "acquire.analyse", …}` | the kernels, their classes, the families and the encyclopedia's declared families; an acquisition session configured, stepped, described and simulated, with the kernel's report (decisions 0004, 0005) |
| `{"op": "field_lines" \| "field_map", …}` | the Earth's field lines of WMM2025; the Moon's crustal field on a grid, with its finer scales when asked (decision 0005) |

With `--serve` the engine reads a request per line and keeps what it has read between them; the server keeps it so for the spacetime's operations, and will still run `run` as a job of its own process.

The server runs `run` as a job: one engine process per run, its progress followed, cancellable, the answers of `sample` served from the run's snapshots. On a public address, runs need the server's token and are held within smaller limits.

### 4.6 Building and Checking

`CMakeLists.txt` at the root of the repository makes the engine's checks (`calx_add_check`), adding the foundations from `../../foundations` when no larger project has; `engine.py build` compiles the program with g++ 11 or later, natively or in WSL, keeping `build.json` with the hash of every header it includes, followed transitively. `node tests/run-tests.mjs` runs the C++ checks through the harness (`cppChecks`), the checks of World JSON and of the page, and, when the engine is built, the verification cases of every model and the first worlds end to end.

## 5. World JSON

A world is a document the engine reads and the page edits; its schema is versioned and checked by the suite. In outline:

```
{"schema": "cosmopoiesis/world/1",
 "title", "status",
 "carrier": {"kind": "euclidean" | "sphere" | "ellipsoid" | "spacetime" | "generated",
             "metric": {...}, "time": {"scale": "TT" | "TDB" | "UTC" | "synthetic", "epoch"}},
 "frames": {"root": "moon-fixed", "chain": [{"from": "patch", "to": "moon-fixed", "by": {...}}, ...]},
 "regions": [{"id": "regolith", "material": "regolith", "shape": {semi-algebraic or terrain}, "cellulation": {...}}, ...],
 "interfaces": [{"between": ["air", "water"], "laws": [{"field": "heat", "kind": "flux-equality"}, ...]}],
 "fields": [{"id": "temperature", "kind": "0-form", "unit": "K", "support": ["regolith"], "affine": true}, ...],
 "materials": {"regolith": {"relations": {"heat": "fourier"}, "parameters": {"k": "0.01 W/(m K)", ...}}},
 "models": [{"region": "regolith", "model": "heat", "owns": ["temperature"], "closure": "fourier", "boundary": {...}}],
 "agents": [{"ref": "agents/rover.json", "frame": "patch", "controller": "plugins/waypoint.py"}],
 "scenario": {"geometry": {...}, "parameters": {...}, "initial": {...}, "forcing": {...}, "bindings": [{"dataset": "lola-dem", "retrieval": "..."}]},
 "plan": {"steps": {"regolith": "60 s", "rover": "1 ms"}, "macro": "60 s", "integrators": {...}, "tolerances": {...}, "seed": 1, "threads": 0},
 "evaluation": {"invariants": ["energy"], "observables": [...], "references": [...], "tolerances": {...}}}
```

Every quantity is written with its unit and parsed by physis; every shape is an equation or a reference to a product; every binding names a retrieval record. Agent JSON describes an agent's variety (bodies and joints), ports, sensors with footprints and latencies, actuators and clock; Experiment JSON is the scenario, plan and evaluation apart from the world, so that one world serves many experiments.

## 6. The Data

### 6.1 Datasets Already in the Library

`jpl-de440s` (the positions of the Sun, Moon and planets), `noaa-wmm` (WMM2025), `moon-magnetic-t2015` (the Moon's crustal field, Tsunakawa et al. 2015 to degree 449, CC BY 4.0), `solar-system-maps` (maps of the bodies, with live tiles of the Moon from LRO WAC and of Mars from Viking MDIM at close range), `etopo-2022` (relief of land and sea floor), `hycom-column` (the ocean beneath a place, on demand), `gfs` and ECMWF's forecasts (the atmosphere over a world), `oisst`, `ww3`, `gibs-relief`, `crust1`, `natural-earth-50m`; and `tully-2mass-groups` and `ungc` for the galaxies. Each with its licence and provenance; none is fetched by the engine.

### 6.2 Datasets to Register

| Dataset | Provider | Use | Terms |
|---|---|---|---|
| `lola-dem` | NASA PDS Geosciences Node, LRO LOLA (Smith et al. 2010) | lunar terrain patches at 118 m, and finer where tiles exist | public domain (US government) |
| `mola-dem` | NASA PDS, MGS MOLA | Martian terrain | public domain |
| `grail-gravity` | NASA PDS, GRGM1200A (Goossens et al. 2020) | the Moon's gravity to the degree a world asks | public domain |
| `egm2008` | NGA | the Earth's gravity | public domain |
| `gebco` | GEBCO Compilation Group | bathymetry finer than ETOPO where a basin needs it | public domain (GEBCO Grid) |
| `cosmicflows-4` | Tully et al. 2023, via VizieR | the Local Volume's distances and peculiar velocities, for the galaxy world | CDS terms, cited |

### 6.3 Products

| Product | Builder | Content |
|---|---|---|
| `terrain-patch` | `terrain_patch.py` | a patch of a body's elevation on a triangulation of a chart, with its coverage mask (cells without a sounding carry none), its datum, its source and its retrieval; a hypothesis family where the source is sparse |
| `gravity-field` | `gravity_field.py` | spherical-harmonic coefficients to a degree, with $GM$, $R$ and the normalisation stated |
| `world-catalogue` | `world_catalogue.py` | the catalogue of worlds and agents the page offers, with their requirements |

Reconstructions (a terrain interpolated across a gap, a bathymetry hypothesis) are products of their own, named by their method, with their held-out error, never written over an observation.

## 7. The Page

### 7.1 Views

| View | Shows |
|---|---|
| **World** | the composed world in the round (three.js), from the chain's largest frame to its smallest with floating origins: the galaxy flow, the Solar System from DE440, a planet with its map and live tiles, a basin with its bathymetry, a patch with its terrain and its agents; the regions and interfaces drawn as the subcomplexes they are |
| **Fields** | cochains on the cellulation, coloured by value, as contours, as particles on a flow; the Hodge decomposition of a flow (driven, local, global, as the Economy Atlas draws it); the four channels side by side, with what is unobserved left visibly blank |
| **Dynamics** | a run's time: invariants and their drift, residuals at every interface, events, the integrators' steps; a comparison with the closed form where one exists |
| **Agents** | each agent's readings as delivered, its controller's memory and estimates beside the scenario's parameters (the truth, shown as such), its commands, its ports' exchanges; many agents and their messages |
| **Experiment** | the world, scenario, plan and evaluation as editable documents; preparation's verdict; the manifest with its commits and retrievals; what each claim's status is |
| **Generation** | a generated carrier (a quadrangulation, a melonic graph, a spin foam, a causal set) with a world on it and its dimensions, after the Complex Atlas |

### 7.2 Drawing

The page draws with the visualization layer and adds nothing general of its own: `complex.js` realises cellulations, `isosurface.js` extracts surfaces, `flow.js` carries particles, `contour.js` draws isolines, `tiles.js` fetches the bodies' live tiles. What any application could use goes to `visualization/js/`.

### 7.3 Style

A console laid out as a flight deck (decision [0003](../development/decisions/0003-one-world-its-addresses-and-a-console.md)): a glareshield of clocks and annunciator lamps, multifunction displays with pages chosen by keys, a control and display unit, a status line; no pop-ups, messages to a log and a lamp. Serif type (Source Serif 4), day and night. Its colours are **pink and purple**, the user's: rose (#EE8FBD) and orchid (#B892DD) on a plum night, a deeper rose (#C2477F) and orchid (#7D54AB) on lilac paper by day; its data in colours validated for colour vision deficiencies, the provenance of readings in three hues with glyphs, the status colours reserved.

### 7.4 The Server

`serve.py` on port **8930**, mounting `domains/`, `foundations/` and `visualization/` beside the page and the cache at `/data/`, reporting the recipe at `/setup` and running it on request, running the engine's jobs, serving snapshots and samples, and refusing on a public address what has no token. `recipe.json`: the engine, the datasets of §6, the products.

## 8. Plug-ins

Models and controllers written by the person using Cosmopoiesis run as plug-ins under the API's contract, in Python or C++, as the Earth Atlas's and the Economy Atlas's do: a **controller** plug-in receives delivered readings and the agent's clock and returns commands, and can receive nothing else (the host enforces Proposition 8.4); a **model** plug-in supplies a region's flux closure or residual on the cochains the engine hands it; an **agent** plug-in supplies an Agent JSON with its controller. The classes (`science.worlds` in Python, `api/cpp/world_plugin.hpp`) are an addition to the API edge, to be proposed when the first slice that needs them is reached; each runs in a process of its own, bounded in time, cancellable.

## 9. The Slices

Each slice is a world that runs end to end and is checked against a closed form; each names what it needs from the foundations and the domains, which is written there first.

| Slice | World | Needs | Checks |
|---|---|---|---|
| **S. The spacetime of the Solar System** (done; decisions [0002](../development/decisions/0002-the-spacetime-slice-first.md), [0003](../development/decisions/0003-one-world-its-addresses-and-a-console.md), [0004](../development/decisions/0004-instruments-and-their-acquisition.md), [0005](../development/decisions/0005-fields-known-in-part-and-declared-instruments.md)) | every body of DE440 at any instant from 1849 to 2150 in one world, the Earth and the Moon with their terrain, placed and turned by DE440, IAU 2006/2000A and the IERS; addresses in every frame and chart, to the Galaxy's centre; satellites by SGP4; instruments, virtual and physical, on a runtime with deadlines that asks the kernel what it grants; a compass with its coverage, the Moon's magnetic field known in part, the fields drawn; the encyclopedia's families declared; a console | physis `geometry` and `mechanics` (physis decision 0009); the C++ of metrology, geodesy and astronomy, and the navigation bridge founded (the infrastructure's ADR 0049); the address language and the galactocentric frame in navigation, WMM2025 in geophysics, the 1976 standard atmosphere in meteorology, normal gravity in geodesy, real-time scheduling and the Legendre functions in calx (calx decision 0009, the infrastructure's ADR 0050); the kernel's classes and the Legendre functions in extended range in calx (calx decision 0010), potential fields and random fields in physis `analysis` (physis decision 0010; the infrastructure's ADR 0052); the data library's `tiles`, `noaa-wmm`, `noaa-swpc` and `moon-magnetic-t2015`; the visualization layer's `globe` | SOFA's and ERFA's values, JPL Horizons, NAIF's worked example, GeographicLib, PROJ, GEOTRANS, Vallado's verification set, skyfield, astropy, NOAA's WMM test values and the 1976 tables, in the domains; the engine's answers through its protocol in `tests/run-tests.mjs`; the runtime and a session's determinism in `tests/check_runtime.py`; the Moon's field against pyshtools (`tests/make_fixtures.py`) |
| **0. The thermal box** | a box of one material with a temperature field; heat by Fourier's law; Dirichlet and insulated faces; two frames | morphe: a box lattice with boundary; physis `discretisation`: the Laplacian on 0-forms with boundary data, the de Rham and Whitney maps; the engine: World JSON, the runtime, snapshots, the page's World, Fields and Dynamics views | the sine mode $T_b+Ae^{-\lambda t}\sin(\pi x/L)$ at second order in $h$ (the preliminary design's fixture, kept); the energy balance exact to rounding (Proposition 5.3); the frame change (Proposition 2.2) |
| **1. Two bodies, one interface** | two boxes glued on a face, unequal steps; then two cellulations of the interface | morphe: gluing along a subcomplex; the engine: interface laws, transfers, residuals, trial and commit | the lumped two-body limit $C_1\dot T_1=-Q$, $C_2\dot T_2=Q$; the residual zero to rounding (Proposition 5.6); the transfer's total preserved (Proposition 6.2) |
| **2. The lunar patch** | a patch of the Moon from LOLA, Moon-fixed frame by astronomy's rotation model, the Sun from DE440, uniform gravity then GRGM1200A at degree 2, a rigid body landing and resting, a rover driving to a waypoint on an inclinometer and odometry | physis `mechanics` (rigid bodies, contact), `gravitation` (harmonics); planetary-science founded (the Moon's figure and constants); `lola-dem` and `grail-gravity` registered; the engine's agents | free fall; the Sun's elevation against the Celestial Atlas; the contact's energy; $J_2$ against its closed form (Proposition 7.2); the four-bar linkage's variety (Proposition 7.4); causality (Proposition 8.4); the chain of frames (§10) |
| **3. The marine basin** | a water column over ETOPO or GEBCO bathymetry with a coverage mask and a hypothesis family where it is sparse; hydrostatics with $\rho(z)$; currents from the ocean column product; a submersible with buoyancy, drag and a depth sensor | physis `continuum` (hydrostatics, drag), `thermodynamics`; oceanography `seawater` (TEOS-10); tyche `spatial` for the reconstruction's held-out error | hydrostatic pressure against $\int\rho g\,dz$; Archimedes; the harmonic flows round the islands (Proposition 3.8) |
| **4. Ocean and atmosphere** | the shallow-water equations on a spherical shell (the meteorology domain's model, now on physis in C++), air and water glued at the sea surface with momentum and heat exchange, the air–sea bridge's bulk formulae | physis `continuum` (the shallow-water equations on complexes of the sphere, roadmap Phase 2); air-sea founded | Williamson's cases 2 and 6; conservation of mass and energy exactly; the exchange's residual |
| **5. The Solar System and the galaxy** | $n$ bodies seeded from DE440; the Local Volume from Cosmicflows-4 as a flow field; a lander's patch embedded in the chain | physis `mechanics` ($n$ bodies, symplectic); `cosmicflows-4` registered | orbital elements against DE440 over a year; the chain's precision; diffusion on a melonic carrier (Proposition 11.1) |
| **6. Adaptation** | a rover estimating the regolith's friction, a submersible the drag, from delivered readings; a controller's parameters optimised over repeated runs; several agents cooperating over a network | tyche `assimilation`, `uncertainty`, `learning`; physis `control`; calx `optimisation` | the estimate converging to the scenario's parameter where it is identifiable, and reported as unidentifiable where it is not |

The order of the slices follows the order in which the foundations can gain what they need; a slice may be split, and a later one brought forward when its foundation is ready. After each slice the status of every module is updated, and the whole run of the infrastructure counts the new checks.

## 10. Repository Layout

```
cosmopoiesis-lab/
├── README.md             purpose, status, what it shows, running, the design, files, references
├── CLAUDE.md             the guide for Claude Code sessions here
├── LICENSE               MIT
├── docs/                 architecture (this document) · formalism · instruments · glossary (later)
├── development/          decisions · ideas · release-notes
├── worlds/               World JSON: the catalogue of worlds (slice 0 onwards)
├── agents/               Agent JSON: the archetypes (slice 2 onwards)
├── experiments/          Experiment JSON: the research experiments and their records
├── engine/               the C++: world, carrier, frames, fields, materials, models/, interfaces, runtime, agents, cosmopoiesis.cpp
├── plugins/              models, controllers and agents under the API's contract, with examples
├── src/                  the page: ES modules, no build step
├── tests/                run-tests.mjs on the shared harness; fixtures/; the C++ checks' sources beside the engine
├── CMakeLists.txt        the engine's checks, on calx verification
├── engine.py · serve.py · recipe.json
└── index.html · styles.css
```

Only `README.md`, `CLAUDE.md`, `LICENSE`, `docs/` and `development/` exist now; each other directory is created when its first content is written, and is a `planned` row until then.

## 11. Checks

The infrastructure's rule holds: `node tests/run-tests.mjs` runs everything the work has, reporting in the harness's form, and `node development/tools/run-tests.mjs` from the infrastructure's root counts it with every other suite. The engine's C++ checks are programs on calx `verification`; the verification case of every model is one of them, with its closed form and the order it must reach; each proposition of the formalism has its check (formalism §12); the page's modules and World JSON are checked in JavaScript; the worlds of the catalogue are prepared and run for a few steps when the engine is built, and skipped with a word when it is not. Reference values live in `tests/fixtures/`, each with its source and date.

## 12. Open Decisions

1. **The repository and its attachment.** The repository is `huangwanhong-maker/Cosmopoiesis-Lab` on GitHub, the user's choice (2026-10-28), in the directory `applications/cosmopoiesis-lab`; the work is called Cosmopoiesis in its documents. Still open: the branch (`master`) against the infrastructure's `main`, and the submodule to register in the infrastructure's `.gitmodules`.
2. **The planetary-science domain**: founded (the infrastructure's ADR 0052), a bridge over astronomy, geophysics and meteorology at height 3, with its first module, `magnetism`. Still open: its next modules for the lunar and Martian worlds (figures and constants, gravity fields, surfaces, atmospheres, regolith).
3. **Where the agents' archetypes live**: in `agents/` as the work's own until a robotics domain is founded (tier 4 of the map), or in a domain from the start.
4. **The plug-in classes** for models, controllers and agents in the API edge (§8).
5. **The job model** of long runs: one process per run, as proposed, or workers kept alive as the Genome Workbench keeps them.
6. **The colour** of the page: decided, pink and purple (decision 0003).
7. **The format of snapshots and checkpoints**: the engine's own binary with a JSON index, as proposed, or a standard (Zarr, netCDF) through the data library's formats.
8. **Compile-time units** in the engine's field types, when physis decides its open decision 1.
9. **Methods written in the engine provisionally**, to be moved down: the twelve kernels of observation (`engine/observation.hpp`), which name no object in nature; they stay here until a second work needs them (the infrastructure's ADR 0050), and then go to a foundation with their registry in the observation edge. This list is kept current.

## 13. References

The references of the formalism, and the infrastructure's own: its [architecture](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/docs/architecture.md), its [map of the mathematics](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/docs/mathematics.md), [ADR 0026](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0026-domains-as-libraries.md) (domains as libraries, works that compose them), [ADR 0028](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0028-neuroscience-and-the-brain-atlas.md) (a repository of its own as a submodule), [ADR 0029](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0029-plugins-in-python-and-cpp.md) and [0030](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0030-the-api-edge.md) (plug-ins and the API), [ADR 0038](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0038-the-spiking-simulator.md), [0039](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0039-complexes-symmetry-and-fields.md), [0040](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0040-the-generation-of-spacetime.md), [0043](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0043-the-genome-infrastructure.md) and [0044](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0044-value-in-space-and-time.md) (engines built by recipe, the foundations gaining what a work needs), and the ideas on [meshes as cell complexes](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/ideas/2026-10-21-meshes-as-cell-complexes.md) and on [units and frames as types](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/ideas/2026-10-21-units-and-frames-as-types.md), whose frame groupoid this design adopts.
