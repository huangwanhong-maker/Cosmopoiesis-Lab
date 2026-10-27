# Cosmopoiesis

*Status: seed (2026-10-28): the design is written; no code yet. Serves: research, learning and use. Draws on: the foundations physis, morphe, calx and tyche; the domains metrology, astronomy, geodesy, geophysics, geography, oceanography, meteorology and climate, and planetary science when it is founded; the data library, the visualization layer and the API, through its C++ engine.* A work of [The Science Infrastructures](https://github.com/huangwanhong-maker/The-Science-Infrastructures), in a repository of its own attached as the submodule `applications/cosmopoiesis-lab`; founded by its decision [0001](development/decisions/0001-the-founding-of-cosmopoiesis.md).

Cosmopoiesis constructs heterogeneous physical worlds and simulates them with the agents that inhabit them: a lunar patch under the Sun of a given date with a rover on it, an ocean basin with a submersible in its currents, ocean and atmosphere exchanging momentum and heat at the sea surface, the Solar System seeded from the JPL ephemeris, the flow of the nearby galaxies, and worlds whose space is itself the sample of a field theory. The same formalism describes all of them, and the same engine runs them.

## 1. Concepts

- **A world is a field configuration on a space with a geometry.** Its carrier is a manifold with a metric (flat space, a sphere, an ellipsoid, an exact spacetime of general relativity), cut into regions that meet at interfaces: the ocean, the air above it, the rock beneath. Its fields are sections of bundles with units (temperatures, fluxes, velocities, stresses, connections, material labels, the states of bodies), and they form a sheaf: fields on the regions whose traces match on the interfaces are one field on the world ([formalism §3](docs/formalism.md)).
- **Laws are actions and balance laws.** Where there is an action, its stationary points are the equations and Noether's charges are the invariants a run watches; where matter dissipates, a balance law $\partial_tu+dJ=s$ closes by a constitutive relation; collisions, switching and sampling are the jumps of hybrid systems ([formalism §5](docs/formalism.md)).
- **Coupling is a fibre product, and conservation across an interface is exact.** Each region's model is an open system with ports; a world is the fibre product of its regions over their interfaces. On a cell complex the flux through a shared interface is one cochain counted with opposite signs on its two sides, so what leaves one region enters the other to rounding, and the balance residual of a run is a check of the construction, not a tolerance ([formalism §5.4–5.6](docs/formalism.md)).
- **Discretisation keeps the structure.** Fields are cochains on morphe's complexes; $d\circ d=0$ and Stokes's theorem hold exactly (physis's discrete exterior calculus); the Helmholtz projection of a flow is the Hodge decomposition; a remeshing commutes with $d$ and loses nothing of a conserved total ([formalism §3.4, §6.3](docs/formalism.md)).
- **Shapes are equations.** Bodies are semi-algebraic sets, figures of planets are quadrics, gravity fields are expansions in the harmonic polynomials that carry the representations of $SO(3)$, and the configuration space of a mechanism is a real algebraic variety whose dimension is its degrees of freedom and whose singular locus is its kinematic singularities ([formalism §7](docs/formalism.md)).
- **Observables are invariants, and controllers see readings.** A sensor reads an invariant of the world, with noise, latency and a clock; a controller acts on the readings delivered to it and on its own memory and beliefs, never on the fields themselves unless an experiment says so; its estimates are distinct from the scenario's parameters ([formalism §6.2, §8](docs/formalism.md)).
- **Scales are a chain of embeddings.** A patch is embedded in the Moon, the Moon in the Solar System, the Solar System in the Local Volume, each world keeping positions in its own frame and the chain carrying the offsets, with a precision budget that says why ([formalism §10](docs/formalism.md)).
- **The space may be generated.** A carrier can be the sample of a group field theory, a random quadrangulation, a melonic graph or a causal set, from physis, with a world put on it ([formalism §11](docs/formalism.md)).
- **Evidence, reconstruction, model and display are four channels** that never silently substitute for one another; a query where there is no value says so, never zero. The data library's provenance is the evidence store ([formalism §9](docs/formalism.md)).

## 2. What It Will Show

The page, when it exists ([architecture §7](docs/architecture.md)), has six views: **World** (the composed world in the round, from the galaxy to the rover with floating origins), **Fields** (cochains on the cellulation, the Hodge decomposition of a flow, the four channels side by side), **Dynamics** (a run's invariants, residuals and events against the closed forms), **Agents** (readings as delivered, the controller's beliefs beside the truth, commands and exchanges), **Experiment** (the world, scenario, plan and evaluation as editable documents, with the manifest's commits and retrievals) and **Generation** (a generated carrier with a world on it). Its colour is terracotta, provisionally; serif type; day and night.

## 3. Running

Nothing runs yet. When the first slice is written, from the infrastructure's root:

```
python data/acquisition/recipe.py applications/cosmopoiesis-lab/recipe.json
python applications/cosmopoiesis-lab/serve.py --open
```

will build the engine (g++ 11 or later, natively or in WSL) and fetch the data, and open the page at http://127.0.0.1:8930/.

## 4. The Design

| Read | For |
|---|---|
| [docs/formalism.md](docs/formalism.md) | What a world is, mathematically: carrier, frames, fields as a sheaf, matter, dynamics, coupling as a fibre product, exact conservation, transformations and gauge, the algebraic geometry of bodies and mechanisms, agents, scenario and evidence, scales, generated carriers; eleven propositions with their proofs and their checks |
| [docs/architecture.md](docs/architecture.md) | The place of the work in the infrastructure: what it owns, what it asks of each foundation and domain, the engine and its protocol, World JSON, the data, the page, plug-ins, the slices by which it is built, open decisions; and a critique of the preliminary design |
| [development/decisions/0001](development/decisions/0001-the-founding-of-cosmopoiesis.md) | Why it is designed so, and what was decided |
| [CLAUDE.md](CLAUDE.md) | The rules for working here |

## 5. Where Things Go

Cosmopoiesis owns the composition and nothing general: the description of a world (World, Agent and Experiment JSON), the runtime that advances a composed world as a task graph with trial and commit, the records of runs, the engine, the server and the page. What names no object in nature goes to a foundation (rigid bodies, balance laws and their closures, the gluing of complexes, filters) and is used from there; what names an object (the Moon's gravity, seawater, the Earth's rotation) comes from a domain. The table of who owns what, and what each slice asks the foundations to gain first, is [architecture §3 and §9](docs/architecture.md).

## 6. The Slices

| Slice | World | First check |
|---|---|---|
| 0 | a thermal box, two frames | the sine mode of the heat equation at second order; the energy balance exact |
| 1 | two bodies glued on a face, unequal steps | the interface residual zero to rounding; a transfer that keeps its total |
| 2 | a lunar patch from LOLA, the Sun from DE440, a lander and a rover | free fall; the Sun's elevation against the Celestial Atlas; $J_2$; causality of the controller |
| 3 | a marine basin over the bathymetry, a submersible | hydrostatics; Archimedes; the harmonic flows round the islands |
| 4 | ocean and atmosphere glued at the sea surface | Williamson's cases; exact conservation; the exchange's residual |
| 5 | the Solar System and the galaxy flow, a patch in the chain | orbital elements against DE440; the chain's precision |
| 6 | agents estimating, adapting, cooperating | an estimate converging where identifiable, reported unidentifiable where not |

## 7. Files

| Path | Content | Status |
|---|---|---|
| `README.md`, `CLAUDE.md`, `LICENSE` | This page; the guide for Claude Code; MIT | draft |
| `docs/formalism.md`, `docs/architecture.md` | The mathematics; the structure | draft |
| `development/` | Decisions, ideas, release notes | draft |
| `worlds/`, `agents/`, `experiments/` | World, Agent and Experiment JSON | planned |
| `engine/`, `CMakeLists.txt`, `engine.py` | The C++ engine, its checks and its builder | planned |
| `src/`, `index.html`, `styles.css`, `serve.py`, `recipe.json` | The page and its server | planned |
| `plugins/` | Models, controllers and agents under the API's contract | planned |
| `tests/` | The checks on the shared harness, with fixtures | planned |

## 8. References

Those of the [formalism](docs/formalism.md#14-references): Arnold, Falk and Winther (2006) on exterior calculus; Desbrun, Hirani, Leok and Marsden (2005) on its discrete form; Willems (2007), Baez and Pollard (2017) and Fong and Spivak (2019) on interconnection and compositionality; Hairer, Lubich and Wanner (2006) on geometric integration; Goebel, Sanfelice and Teel (2012) on hybrid systems; Bochnak, Coste and Roy (1998), Cox, Little and O'Shea (2015) and Sommese and Wampler (2005) on real and numerical algebraic geometry; Heiskanen and Moritz (1967) on physical geodesy; Archinal et al. (2018) on the rotation of the bodies; the GRAIL and LOLA papers on the Moon.

## 9. Licence

MIT; see [LICENSE](LICENSE). Datasets keep their own licences, recorded in the infrastructure's data registry.
