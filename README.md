# Cosmopoiesis

*Status: draft (2026-10-28): the design is written, and its first slice: the spacetime of the Solar System as one world, addressed from a crater to the Galaxy's centre ([decisions 0002](development/decisions/0002-the-spacetime-slice-first.md) and [0003](development/decisions/0003-one-world-its-addresses-and-a-console.md)), read by instruments, virtual and physical, on a runtime with deadlines ([decision 0004](development/decisions/0004-instruments-and-their-acquisition.md)). Serves: research, learning and use. Draws on: the foundations physis, morphe, calx and tyche; the domains metrology, geodesy, astronomy, geophysics, meteorology and the navigation bridge (and geography, oceanography and climate, and planetary science when it is founded, as the slices reach them); the data library, the visualization layer and the API, through its C++ engine.* A work of [The Science Infrastructures](https://github.com/huangwanhong-maker/The-Science-Infrastructures), in a repository of its own attached as the submodule `applications/cosmopoiesis-lab`; founded by its decision [0001](development/decisions/0001-the-founding-of-cosmopoiesis.md).

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

## 2. What It Shows

**One world, its addresses and its instruments** (decisions [0002](development/decisions/0002-the-spacetime-slice-first.md), [0003](development/decisions/0003-one-world-its-addresses-and-a-console.md), [0004](development/decisions/0004-instruments-and-their-acquisition.md), [0005](development/decisions/0005-fields-known-in-part-and-declared-instruments.md) and [0006](development/decisions/0006-the-world-first-and-the-field-about-a-point.md)). The page is a console laid out as a flight deck, over the Solar System at any instant from 1849 to 2150, or now, running at any rate.

- **Layout.** It shows the world first, its evidence second and its machinery third.
- **The context bar.** A bar beneath the clocks keeps apart:
  - what the camera looks at;
  - the point chosen (rose);
  - the observer whose instruments read (orchid);
  - the frame positions are written in;
  - where the instruments are mounted.
- **Two decks.** The **science** deck shows POINT, LAYERS, ENV, FIELD, ROVER and INSTR. The **engineering** deck shows FRAMES, SYS, BUS and SCHED.

The page shows:

- **One world.** The Sun, the planets, Pluto and the Moon, placed and turned by DE440 and the IAU's rotation models, drawn in the barycentric ICRS from the regolith of a crater to 110 au above the ecliptic, with each planet's orbit. The Earth and the Moon have their terrain and imagery, refined as one comes near: ETOPO 2022, Mapzen's Terrarium and LOLA, Sentinel-2's cloudless Earth, the Blue Marble, a day's VIIRS and LRO's Moon, with every height saying where it came from. The other bodies carry their maps, finer close in from NASA's Trek. Saturn has its rings, the sky its stars and the Milky Way. Going to another body is a flight.
- **Addresses.** Any point is written in one line, `moon(43.31 S, 11.36 W)`, `earth(35.36 N, 138.73 E)/aer(45°, 30°, 10 km)` or `ICRS:equatorial(266.4051°, 28.936175° S, 8.122 kpc) @ 2026-10-28T12:00:00Z`, read by the navigation domain's address language, answered in every frame and chart of the catalogue, and flown to. A name from the gazetteer goes there too, and a syntax error is marked where it is ([formalism §2.5](docs/formalism.md)).
- **Time.** The instant in every time scale, with the Earth's rotation, on the mission clock that the server holds for every page and instrument.
- **Frames.** The catalogue as one tree, from the galactocentric frame and the barycentre to a place on the Moon, read as a connection: the holonomies of its loops measure the disagreements of its standards ([formalism §2.6](docs/formalism.md)).
- **The point chosen** (POINT): a click on any body, a name or an address chooses it.
  - It is shown first as a place: its coordinates and the feature it lies in.
  - Then as seen from the observer, which follows it unless told not to.
  - Then in every frame and chart.
  - The address line, empty, offers examples and a composer, and a syntax error says what was expected and how such an address is written.
- **The field about a point** (FIELD): any instrument whose reading depends on where it stands, read by the engine at every cell of a cube about the point or the observer, in the same world as the observer's instruments.
  - The instruments: a magnetometer of the Earth or the Moon, a gravimeter, the standard atmosphere, a compass, the Sun sensor, the GNSS receiver.
  - It is drawn in three dimensions with its inside filled with colour: cells with gaps between them, three slices, the shell, or the surface of one level.
  - Arrows of the field or of its departure from the cube's mean.
  - The body's figure where it crosses the cube.
  - The figures: the value at the centre, the range across the cube, and the gradient.
  - The cube can also be placed in the world ([decision 0006](development/decisions/0006-the-world-first-and-the-field-about-a-point.md) §2.5).
- **A body that senses, a mission that learns** (ROVER, [decision 0008](development/decisions/0008-a-body-that-senses-and-a-mission-that-learns.md); [formalism §8.8](docs/formalism.md)). A rover of the robotics domain surveys the Moon's crustal field at Reiner Gamma, Apollo 16's Descartes or Gerasimovich. The page keeps the world's truth, the body and the knowledge apart:
  - **The world** holds the truth: T2015_449 and a hidden realisation of what it leaves unresolved, to degree 1440, from the law of its spectrum and a seed.
  - **The body** is the rover, kinematic or dynamic (the same commands; the two fidelities translate exactly). It drives a lawnmower or, adaptively, to wherever the field is least known, and its magnetometer on a 1.5 m mast reads the truth with noise.
  - **The knowledge** is the mission's Gaussian posterior of the field, from the truth's own law, conditioned on each reading as it comes. The map shows its mean or its uncertainty, with the prior on the same scale, and the whitened innovations against their band.
  - **Reveal** is a god's view: the truth, the error, the z and their calibration. A key runs the survey over twenty truths and pools their z, which is standard normal by construction.
- **The environment** (ENV), as the observer's instruments read it, each reading a value with its unit, provenance and age, under the place it describes: the ground, the air with the standard atmosphere's profiles, the Sun and the sky with the GNSS satellites above the horizon, the solar wind, the interplanetary field, the $K$ index, the Sun's X-rays and energetic protons, the geomagnetic field, a compass where one works (near the Earth's ground, outside the blackout zones about the magnetic poles), and gravity. On the Moon, its magnetometer: the crust's remanence from T2015_449, its finer scales drawn from their spectral law, and the solar wind's field carried from L1 ([formalism §8.7](docs/formalism.md)).
- **The fields** (LAYERS): the Earth's field lines from WMM2025, and the Moon's crustal field, $\lvert B\rvert$ or its radial component, laid on its ground ([formalism §3.6](docs/formalism.md)).
- **The data** (BUS): every stream of readings, grouped by mount and found by text, mount or provenance, coloured by its provenance: observed in rose, modelled in blue, assimilated in amber, with glyphs for archive and synthetic. Each stream has an inspector: every quantity with its unit, and the observation envelope ([formalism §8.5](docs/formalism.md)).
- **Instruments** (INSTR): the mounted sensors as cards, each with its reading and health, grouped by mount. Each has an inspector: the kernel, the family, the counters, the cost and the coverage. A family can be mounted on the observer, the point, the ISS or any address. The registry lists the kernels, the engine's families, and the encyclopedia's 101 families by section ([docs/instruments.md](docs/instruments.md)).
- **Scheduling** (SCHED): its key figures, the policy, the jobs on each worker as they ran, each policy simulated on the declared set and compared in bars with what each figure counts, the servers, and what the operating system's kernel grants: its real-time classes, or why it refuses them ([formalism §8.6](docs/formalism.md)).
- **Satellites.** CelesTrak's groups by SGP4, lit or eclipsed, with orbits, ground tracks and look angles.

**Later** ([architecture §7](docs/architecture.md)), six views: **World** (the composed world in the round, from the galaxy to the rover with floating origins), **Fields** (cochains on the cellulation, the Hodge decomposition of a flow, the four channels side by side), **Dynamics** (a run's invariants, residuals and events against the closed forms), **Agents** (readings as delivered, the controller's beliefs beside the truth, commands and exchanges), **Experiment** (the world, scenario, plan and evaluation as editable documents) and **Generation** (a generated carrier with a world on it). The globe of this slice is the World view's first form.

Its colours are pink and purple, rose and orchid on a plum night and on lilac paper by day ([decision 0003](development/decisions/0003-one-world-its-addresses-and-a-console.md) §2.3). Its type is one family of three ([decision 0006](development/decisions/0006-the-world-first-and-the-field-about-a-point.md) §2.4): Source Serif 4 for its name and prose, Source Sans 3 with tabular figures for what is read at a glance, and Source Code Pro for addresses and identifiers. No pop-ups: messages go to a log and light a lamp.

## 3. Running

From the infrastructure's root:

```
python data/acquisition/recipe.py applications/cosmopoiesis-lab/recipe.json
python applications/cosmopoiesis-lab/serve.py --open
```

The first command builds the engine (g++ 11 or later, natively or in WSL) and fetches the data, about 250 MB with the coarse terrain; the finer terrain is fetched as the page asks for it, and kept. The second opens the page at http://127.0.0.1:8930/; the SYS page can also run the recipe. The Earth's orientation, the leap seconds and the satellites' elements change: running their steps again refreshes them (the page's "fetch fresh elements" does so for the satellites).

## 4. The Design

| Read | For |
|---|---|
| [docs/formalism.md](docs/formalism.md) | What a world is, mathematically: carrier, frames, events and their addresses, frames as a connection, fields as a sheaf, the kinds of phenomena, matter, dynamics, coupling as a fibre product, exact conservation, transformations and gauge, the algebraic geometry of bodies and mechanisms, agents, instruments and the timing of their acquisition, scenario and evidence, scales, generated carriers; the propositions with their proofs and their checks |
| [docs/instruments.md](docs/instruments.md) | What an instrument is: the twelve kernels of observation, the encyclopedia of instruments mapped onto them, a critique of it and of a proposed architecture (six axes, ten engines, an envelope), and the classes with the families declared |
| [docs/architecture.md](docs/architecture.md) | The place of the work in the infrastructure: what it owns, what it asks of each foundation and domain, the engine and its protocol, World JSON, the data, the page, plug-ins, the slices by which it is built, open decisions; and a critique of the preliminary design |
| [development/decisions/](development/decisions/) | Why it is designed so, and what was decided: the founding (0001), the spacetime slice (0002), one world and its console (0003), instruments and their acquisition (0004), fields known in part and declared instruments (0005), the world first and the field about a point (0006) |
| [CLAUDE.md](CLAUDE.md) | The rules for working here |

## 5. The Engine and the Server

The engine (`engine/cosmopoiesis.cpp`, header-only C++20 in the namespace `cosmopoiesis`) composes the domains and writes none of their science. It reads one request in JSON and writes one answer; with `--serve` it reads a request per line and keeps its kernels between them, which is how the server runs it (`engine.py`). Every value is named with its unit (`_m`, `_s`, `_deg`, `_rad`, `_arcsec`, `_mas`) and every position with its frame. Times are text: ISO 8601 with `Z` or a scale, `JD …` or `MJD …` with a scale, or `unix:<seconds>` for UTC from a clock. The server adds the world's sources (the ephemeris, the Moon's PCK, the IERS's series, the leap seconds, the geoid), so that a request names none of its paths.

| Request | Answer |
|---|---|
| `{"op": "status"}` | the ephemeris and its coverage, the Moon's frames, the Earth's orientation and its span, the leap seconds and their expiry |
| `{"op": "time", "time"}` | the instant in every scale, with UT1's source, ΔT, TDB − TT, the ERA, GMST (2006 and 1982), GAST, the EOP and the GPS week |
| `{"op": "frames"}` | the catalogue's frames (each with its parent and what it is) and its relations |
| `{"op": "bodies", "start", "span", "step", "bodies"?}` | samples of every body's position and velocity in the ICRS and of its orientation (a quaternion from its fixed frame to the ICRS), with its radius, GM and frames, for the page to interpolate |
| `{"op": "ephemeris", "start", "span", "step"}` | the same for the Earth, the Moon and the Sun in the GCRS (slice S's form) |
| `{"op": "address", "text", "time"?, "answers"?, "observer"?, "charts"?}` | an address read, canonically printed and resolved to an event, answered in every frame and chart (or in those asked), seen from an observer (AER, ENU, NED); a syntax error with its column and what was expected; the grammar and every frame's charts |
| `{"op": "transform", "from", "to", "time", "positions", "velocities"?}` | the motion between two frames, its path through the tree, and the points carried |
| `{"op": "holonomy", "time"}` | the holonomy of every loop of the catalogue: angle and slide |
| `{"op": "convert", "time", "point", "observer"?}` | a point given geodetically, in Cartesian coordinates of any frame, in UTM, UPS or MGRS, on the Earth or the Moon, in every system (§2, Place) |
| `{"op": "geodesic", "from", "to", "points"?}` | the geodesic on WGS 84: distance, azimuths, the path |
| `{"op": "satellites", "time", "groups", "observer"?, "window"?}` | the satellites of CelesTrak's groups by SGP4: TEME, GCRS and ITRS states, sub-point, shadow, the age of the elements, look angles from the observer, and a window of samples |
| `{"op": "instruments"}` | the kernels of observation and their classes, the engine's instrument families, the encyclopedia's declared families, the provenances and the qualities |
| `{"op": "fields"}` | the world's fields (decision 0007): each one's descriptor (base, fibre and unit, representation, provenance, parts, source, capabilities), or why its model is not loaded |
| `{"op": "field.sample", "field", "time"?, "sampling", "reduce"?, "encoding"?}` | a field read on a sampling in its frame: `{"kind": "sphere", "radius_m", "nlat", "nlon", "centre"?}`, `{"kind": "plane", "origin", "u", "v", "nu", "nv"}`, `{"kind": "volume", "centre", "axes"?, "edges", "n"}` or `{"kind": "points", "points"}`; a vector reduced to its `magnitude`, a `component` (`axis`), its `radial` or `horizontal` part, or `on_axes`; each point's value (NaN where none), quality and reason or note, with the counts. A field that depends on the time needs one |
| `{"op": "field.curves", "field", "time"?, "seeds", "within"?, "direction"?, "streamline"?, "step_m"? \| "step_fraction"?, "max_steps"?, "encoding"?}` | the field lines (or streamlines) of a vector field through seeds, within a shell `{"inner_m", "outer_m", "centre"?}` if asked; each curve's points, $\lvert v\rvert$ along it, and why each end ended |
| `{"op": "field_lines", "time", "max_radius"?}` | the Earth's field lines at an instant, in the ITRS: the curves of `earth.magnetic.core` through 48 seeds |
| `{"op": "field_map", "body": "moon", "quantity"?, "step_deg"?, "height_m"?, "synthetic"?, "encoding"?}` | the Moon's crustal field on a sphere ($\lvert B\rvert$ or $B_r$): `moon.magnetic.crust`, or its sum with its finer scales when asked; `"encoding": "f32"` sends the values as float32 in base64 |
| `{"op": "probe_volume", "at", "time"?, "family" \| "field", "edge_m", "n", "quantities"?, "settings"?, "encoding"?}` | an instrument whose reading depends on its place (point probes, lines of sight, ranging), or a field of the world, read at every cell of a cube about an event. The cube has n per edge cells, with axes east, north and up at its centre (physis's volume grid). The answer gives each numeric quantity per cell (NaN where it cannot read, with the reasons counted) and the vector in the cube's axes; it reads the live session's world (decision 0006 §2.5; decision 0007) |
| `{"op": "mission.start" \| "mission.step" \| "mission.state" \| "mission.map" \| "mission.stop", "session"?, …}` | a mission (decision 0008) kept by the serving engine: started from a config (site, plan, fidelity, the truth's seed and degree, the instrument's noise and interval), stepped by its own clock (the track and readings since the indices given), its state, and the posterior's map on a grid about the site (mean and uncertainty of $\lvert B\rvert$ and of $B$'s down component, the prior; revealed, the truth, the error, the z and their calibration) |
| `{"op": "mission.run" \| "mission.calibrate", "config", …}` | a whole mission in one request, with its map; the same mission over many truths, its posterior's z and the whitened innovations pooled |
| `{"op": "acquire.configure" \| "acquire.step" \| "acquire.describe" \| "acquire.analyse", "session", …}` | an acquisition session: its sensors (with their settings), servers and policy (with the kernel's class asked for); one step of releases, admission and dispatch with the readings in their envelopes, the trace and the plan of external jobs, and the inputs physical sources give the virtual instruments (the solar wind); its state with every sensor's counters and the kernel's report; a simulation of its declared set under each policy |

The server (`serve.py`, Python's standard library) serves the page, the shared code and the data cache. It runs the engine (`GET` and `POST /api/engine`), lists the satellites' groups (`/api/satellites`), and builds terrain tiles with the data library's `tiles` (`/tiles/terrain/<body>/<z>/<x>/<y>`, and `?synthetic=1` for the labelled detail). It reports and runs the recipe (`/setup`, `/setup/run`). It holds the mission clock (`/api/clock`: set, rate, play, pause, present) and the acquisition (`runtime.py`): the engine's session stepped four times a second, the physical sources run by its I/O workers (NTP, SWPC's solar wind, interplanetary field and $K$ index, GOES's X-rays and protons, USGS's earthquakes, the user's stations, the terrain), and the readings on a bus read by long polls (`/api/bus`, `/api/bus/latest`), with the session's state, trace and analysis (`/api/acquisition`, `/api/acquisition/trace`, `/api/acquisition/analyse`) and the instruments (`/api/instruments`). Only 127.0.0.1 is bound unless `--host` says otherwise; on a public address the recipe and changes to the acquisition need the server's token, and requests are held within smaller limits.

## 6. Where Things Go

Cosmopoiesis owns the composition and nothing general: the description of a world (World, Agent and Experiment JSON), the runtime that advances a composed world as a task graph with trial and commit, the records of runs, the engine, the server and the page. What names no object in nature goes to a foundation (rigid bodies, balance laws and their closures, the gluing of complexes, filters) and is used from there; what names an object (the Moon's gravity, seawater, the Earth's rotation) comes from a domain. The table of who owns what, and what each slice asks the foundations to gain first, is [architecture §3 and §9](docs/architecture.md).

## 7. The Slices

| Slice | World | First check |
|---|---|---|
| S | the spacetime of the Solar System as one world: its frames, figures and bodies at any instant, addresses in every frame and chart, satellites, instruments and their acquisition, a console (done, decisions 0002–0004) | SOFA's and ERFA's values, Horizons, NAIF's example, GeographicLib, PROJ, GEOTRANS, Vallado's verification set, astropy's galactocentric frame, WMM2025's report and NOAA's test values, the 1976 standard atmosphere, in the domains' and the work's checks; readings that do not depend on the schedule |
| R | a body that senses, a mission that learns: a rover on the Moon at either fidelity, its magnetometer reading a hidden truth, the mission's Gaussian knowledge of the crust's field (done, decision 0008) | the vehicles' closed forms and the lag between fidelities, in robotics; the covariance against the sum over the coefficients, in physis; a survey's innovations within their band, and the posterior's z standard normal over many truths, here |
| 0 | a thermal box, two frames | the sine mode of the heat equation at second order; the energy balance exact |
| 1 | two bodies glued on a face, unequal steps | the interface residual zero to rounding; a transfer that keeps its total |
| 2 | a lunar patch from LOLA, the Sun from DE440, a lander and a rover | free fall; the Sun's elevation against the Celestial Atlas; $J_2$; causality of the controller |
| 3 | a marine basin over the bathymetry, a submersible | hydrostatics; Archimedes; the harmonic flows round the islands |
| 4 | ocean and atmosphere glued at the sea surface | Williamson's cases; exact conservation; the exchange's residual |
| 5 | the Solar System and the galaxy flow, a patch in the chain | orbital elements against DE440; the chain's precision |
| 6 | agents estimating, adapting, cooperating | an estimate converging where identifiable, reported unidentifiable where not |

## 8. Files

| Path | Content | Status |
|---|---|---|
| `README.md`, `CLAUDE.md`, `LICENSE` | This page; the guide for Claude Code; MIT | draft |
| `docs/formalism.md`, `docs/architecture.md`, `docs/instruments.md` | The mathematics; the structure; the instruments | draft |
| `development/` | Decisions, ideas, release notes | draft |
| `worlds/`, `agents/`, `experiments/` | World, Agent and Experiment JSON | planned |
| `engine/`, `engine.py` | The C++ engine (`cosmopoiesis.cpp`; the bindings `spacetime.hpp`, `coordinates.hpp`, `satellites.hpp`; observation and the kernel classes `observation.hpp`, the instruments `instruments.hpp`, `environment.hpp` and `lunar.hpp`, the encyclopedia's declared families `declared.hpp` with their generator `tools/make_declared.py`, the acquisition session `acquisition.hpp`, the mission `mission.hpp`) and its builder | draft |
| `CMakeLists.txt` | The engine's own checks on calx's verification | planned |
| `src/`, `index.html`, `styles.css`, `serve.py`, `runtime.py`, `recipe.json` | The page: the console (`console.js`, `charts.js`, the pages in `pages/`), the world (`world.js`, `scene.js`, `navigator.js`, `maps.js`, `satellites.js`, `labels.js`, `places.js`, the fields `fields.js`, the mission's arithmetic `mission.js`), the mission clock's view (`clock.js`), the bus (`busclient.js`), `format.js`, `api.js`, `app.js`; its server, the server's runtime (the mission clock, the bus, the physical sources, the acquisition) and its recipe | draft |
| `plugins/` | Models, controllers and agents under the API's contract | planned |
| `tests/` | The checks on the shared harness: the formats, the clock, the search, the interpolated windows, the recipe, and the engine's answers; `check_runtime.py`, the server's runtime and an acquisition session; `make_fixtures.py`, the Moon's field by pyshtools (`fixtures/lunar-field.txt`) | draft |

## 9. References

Those of the [formalism](docs/formalism.md#14-references): Arnold, Falk and Winther (2006) on exterior calculus; Desbrun, Hirani, Leok and Marsden (2005) on its discrete form; Willems (2007), Baez and Pollard (2017) and Fong and Spivak (2019) on interconnection and compositionality; Hairer, Lubich and Wanner (2006) on geometric integration; Goebel, Sanfelice and Teel (2012) on hybrid systems; Bochnak, Coste and Roy (1998), Cox, Little and O'Shea (2015) and Sommese and Wampler (2005) on real and numerical algebraic geometry; Heiskanen and Moritz (1967) on physical geodesy; Archinal et al. (2018) on the rotation of the bodies; the GRAIL and LOLA papers on the Moon.

## 10. Licence

MIT; see [LICENSE](LICENSE). Datasets keep their own licences, recorded in the infrastructure's data registry.
