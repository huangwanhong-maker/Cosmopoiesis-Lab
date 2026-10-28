# CLAUDE.md

This file guides Claude Code in the Cosmopoiesis repository.

Cosmopoiesis is a work of [The Science Infrastructures](https://github.com/huangwanhong-maker/The-Science-Infrastructures), which includes it as the git submodule `applications/cosmopoiesis-lab`. It is a repository of its own for its history and its collaborators; it is developed and run inside the infrastructure, whose [CLAUDE.md](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/CLAUDE.md), [architecture](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/docs/architecture.md) and [ADR 0026](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0026-domains-as-libraries.md) govern how a work composes the domains and the foundations. Read them first; then [docs/formalism.md](docs/formalism.md) and [docs/architecture.md](docs/architecture.md), which are the authority here.

## 1. Purpose and Scope

Cosmopoiesis constructs heterogeneous physical worlds (a lunar patch, an ocean basin, the coupled ocean and atmosphere, the Solar System, the flow of the galaxies, a world on a generated spacetime) and simulates them with the agents that inhabit them, in one formalism: a world is a sheaf of fields on a carrier cut into regions, its laws actions and balance laws, its coupling a fibre product over interfaces, its shapes equations, its observables invariants. It serves research, learning and use.

Out of scope, by the infrastructure's test of placement:

- **General methods.** A balance law on a complex, a rigid body on $SE(3)$, contact, the gluing of complexes, a Kalman filter, a Gröbner basis: these belong to physis, morphe, calx or tyche. Cosmopoiesis asks for them there (in that library's decision log), and uses them. It never writes a second copy.
- **Objects of nature.** The Moon's figure and gravity, seawater, the Earth's rotation, a named vehicle: these belong to the domains (astronomy, geodesy, oceanography, metrology; planetary science and robotics when founded). Cosmopoiesis composes them.
- **Fetching and drawing in the engine.** Data come through the infrastructure's data library; drawing is the page's and the visualization layer's.

## 2. Invariants

1. **Composes, never reimplements.** Units are physis's; time scales and frames metrology's and astronomy's; figures geodesy's and planetary science's; numerics calx's; inference tyche's; evidence and provenance the data library's; drawing the visualization layer's. A method written here provisionally is marked so in its header and listed in architecture §12, and moved down at the next opportunity.
2. **The engine is pure.** It reads one request and the files whose paths the request names, computes, and answers; no network, no user interface, no hidden global state. Runs are files in the data library's cache, named in the answer.
3. **Every quantity carries its unit and every coordinate its frame**, at every interface of the engine and in every JSON document; inside, SI and radians. A world declares its root frame and its time scale.
4. **Exact where the structure allows.** $\partial\partial=0$ on every cellulation; conservation across a shared interface to rounding (formalism Proposition 5.6); a variational integrator's momenta; a mechanism's variety over the rationals. Where not exact, the order is measured and the invariants' drift reported.
5. **Observables are invariants; controllers see readings.** A sensor reads an invariant with noise, latency and a clock; a controller acts on delivered readings and its memory, and never on the fields unless the experiment declares it (Propositions 6.1 and 8.4). Its estimates $\hat\vartheta$ are never the scenario's $\theta$.
6. **Four channels, no silent substitution.** Observed, reconstructed, modelled and displayed values are answered separately; a query with no value says why, never zero.
7. **Every model is verified before it runs on a world:** against a closed form, a manufactured solution or an independent implementation, at its expected order, by a program on calx `verification`. Every proposition of the formalism has its check (formalism §12). Every number that is not computed cites its source, with the fixture's date.
8. **Reproducible.** A run's manifest records the engine's build, the commit of every foundation and domain used, and the retrieval of every dataset; random streams are keyed by purpose so that the result does not depend on the number of threads; a run restarted from a checkpoint reproduces an uninterrupted one on one machine.
9. **No "laboratory".** The word is retired in the infrastructure; this work is Cosmopoiesis. Proper names and the decision records keep it.

## 3. Repository Layout

```
cosmopoiesis-lab/
├── README.md · CLAUDE.md · LICENSE
├── docs/            formalism · architecture · glossary (later)
├── development/     decisions · ideas · release-notes
├── worlds/          World JSON (planned)
├── agents/          Agent JSON (planned)
├── experiments/     Experiment JSON and the research records (planned)
├── engine/          the C++ engine, header-only C++20 (draft: slice S)
├── plugins/         models, controllers and agents under the API's contract (planned)
├── src/             the page, ES modules without a build step (draft: slice S)
├── tests/           run-tests.mjs on the infrastructure's harness; fixtures/ (draft)
└── engine.py · serve.py · recipe.json · index.html · styles.css (draft); CMakeLists.txt (planned)
```

A directory is created when its first content is written. The layout is architecture §10; change it there and here together.

## 4. Working Procedures

- **Checks.** `node tests/run-tests.mjs` from the infrastructure's root (it imports the shared harness, `development/tools/checks.mjs`, which builds the C++ checks with CMake here or in WSL), or `node development/tools/run-tests.mjs` for the whole run. Run them before every commit that touches code.
- **Commits.** Foundations first (calx and morphe, then physis, then tyche and nomos), then the domains in their order, then this repository, then the infrastructure's submodule pointer, by path. Release notes at each commit, in `development/release-notes/YYYY-MM-DD.md` (one file per day, one short section per commit, newest first, plain prose: what is new, what one can now do, what works better; not a list of files), indexed in that folder's README; not between commits. Push only with the user's agreement.
- **Decisions and ideas.** Decisions in `development/decisions/NNNN-slug.md`, never rewritten, superseded by later records; the founding record is 0001. Ideas as `development/ideas/YYYY-MM-DD-slug.md` with a status. Decisions that shape the infrastructure as a whole (a new domain, a change to the API, a submodule) go in its log, proposed to the user first.
- **Asking the foundations.** When a slice needs a method the foundations lack, write it in the foundation with its checks and its decision record there, commit it there, and only then use it here. Architecture §3.2 lists what each slice asks for.
- **Shared conventions.** The writing style (declarative, numbered, academic headings, never questions; concepts before structure; asides as *Rationale.*, *Remark.* or *Caveat.*; English), the status vocabulary (`planned`, `seed`, `draft`, `stable`, `deprecated`), and the decision, idea and release-note conventions are the infrastructure's. Change them everywhere together.
- **Change discipline.** Before changing an invariant (§2), the layout, World JSON's schema, the engine's protocol or a convention, propose the change and wait for the user's agreement. Keep each change to one concept. Where this file no longer matches the repository, say so and propose a fix.
- **Parallel sessions.** Several sessions share the infrastructure's working tree. Work here stays under `applications/cosmopoiesis-lab`; a change elsewhere (a foundation, a domain, the API, the root CLAUDE.md or README) is proposed, and made in that place's own conventions.

## 5. Technology

- **Language.** C++20 for the engine, header-only on the foundations and the domains, in the namespace `cosmopoiesis`; built as the program `cosmopoiesis` by `engine.py` into `data/cache/engines/cosmopoiesis/` (g++ 11 or later, natively or in WSL; stale when a header it includes changes), and as a CMake project whose checks are programs on calx `verification` (`calx_add_check`), adding the foundations from `../../foundations` when no larger project has. The API's JSON (`api/cpp/science/json.hpp`) is its JSON.
- **The page.** ES modules without a build step; three.js from jsDelivr pinned to 0.170.0; the visualization layer's helpers; Source Serif 4; pink and purple, the user's (rose and orchid; decision 0003), day and night; a console, with no pop-ups. Served by `serve.py` on port **8930** with Python's standard library, mounting `domains/`, `foundations/` and `visualization/` beside the page and the cache at `/data/`, reporting the recipe at `/setup`.
- **Data.** Through the infrastructure's data library only: datasets registered with their licences (LOLA, MOLA, GRAIL, EGM2008, GEBCO, Cosmicflows-4 to come), products built by the recipe, never committed.
- **Plug-ins.** Models, controllers and agents in Python or C++ under the API's contract, each in a process of its own, bounded in time; the classes to be proposed for the API edge.
- **Licence.** MIT. Check every dependency's licence before adopting it; copyleft never by default.
- **Version control.** The remote is `git@github.com:huangwanhong-maker/Cosmopoiesis-Lab.git` (branch `master`); pushes go over the SSH alias `serendip_wanhong` (key `serendip_id_ed25519`, port 443), set as the remote's `pushurl`, as in the infrastructure's other repositories. Push only with the user's agreement.

## 6. Conventions

- SI internally, radians; a quantity at a boundary with its unit (physis `units`).
- Rotations active and right-handed; $SO(3)$ as unit quaternions (physis `symmetry`); longitude positive eastward; azimuth clockwise from north; signature $(-,+,+,+)$ with $x^0=ct$; curvature after Misner, Thorne and Wheeler.
- A time states its scale (TT, TDB, TAI, UTC, UT1, or a synthetic epoch) and its representation.
- A cell complex is oriented once; $d=\partial^{\mathsf T}$; holonomies along attaching words; gauge transformations $U_e\mapsto g_{\mathrm{tail}}U_eg_{\mathrm{head}}^{-1}$; spins as $2j$.
- Notation in the documents corresponds to names in the code; the formalism's §13 is the glossary until `docs/glossary.md` exists.

## 7. Open Decisions

Architecture §12: the branch and the submodule's registration; the planetary-science domain; where the agents' archetypes live; the plug-in classes in the API; the job model of long runs; the colour; the snapshot format; compile-time units; the list of methods written here provisionally.

## 8. Current State

As of 2026-10-28: the design, and slice S, the spacetime of the Earth and the Moon ([decision 0002](development/decisions/0002-the-spacetime-slice-first.md); the infrastructure's ADR 0049). The engine (`engine/`: `cosmopoiesis.cpp` with the bindings `spacetime.hpp`, `coordinates.hpp` and `satellites.hpp`) answers nine operations on the domains' C++ (metrology, geodesy, astronomy, the navigation bridge) and physis; `engine.py` builds it and keeps it alive; `serve.py` serves the page, the engine, the data library's terrain tiles and the recipe; the page (`index.html`, `styles.css`, `src/`) draws the Earth and the Moon on the visualization layer's `globe`, with time, places in every coordinate system, frames and their loops, and satellites; `tests/run-tests.mjs` checks the page's logic and the engine's answers. World JSON, the runtime, the engine's CMake checks and the other slices are not yet written; slice 0, the thermal box, is next, beginning with what it asks of morphe and physis (architecture §9).
