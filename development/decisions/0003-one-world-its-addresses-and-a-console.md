# 0003. One World, Its Addresses, and a Console

- **Status:** Accepted, provisionally (the bodies beyond the Earth and the Moon have maps, not terrain; the relativistic transformations are stated and not modelled). §2.3: its type amended by [0006](0006-the-world-first-and-the-field-about-a-point.md), its keys and panels by [0009](0009-a-precision-console-and-figures-that-separate.md).
- **Date:** 2026-10-28
- **Decided by:** the user, on seeing slice S: "the UI need largely revise. We prefer pink and purple as major color"; the page felt like "a daily smartphone app … the pop-up notification bar design, and rounded button design", where "more advanced, professional" designs were wanted, "aircraft/spacecraft's control panel like"; "Moon and earth should not seperate … We hope a global spacetime addressable system … the solar system, may be extend to galaxy, so be extenable", with "different space time coordinations" converting to each other "by our unified framework … algebraic structure and field theory based. May be gaugue theory"; "a brief of environment around, like atomsphere, geography, radiation/field"; and "a planel or tab display all data like the earth atlas one", with colours distinguishing physical, simulated and assimilated data. Claude designed and wrote it. It amends [0002](0002-the-spacetime-slice-first.md) §2.3, the page; the instruments and their acquisition are [0004](0004-instruments-and-their-acquisition.md).

## 1. Context

Slice S drew the Earth and the Moon as two globes, each with its own tab, a panel of coordinates for a chosen point, and messages that rose as toasts. The infrastructure's frames already joined the two bodies in one graph (ADR 0049); the page did not. The user asked for one world in which every place, from a crater to the Galaxy's centre, can be written and reached, and for a page that reads as an instrument panel rather than an application on a telephone.

## 2. Decision

### 2.1 One World

The page draws one world in the barycentric ICRS: the Sun, the planets, Pluto and the Moon of DE440 (the engine's new operation `bodies`: every body's position, velocity and orientation, sampled over a window and interpolated by the page as before). The camera is held in the ICRS and every body is drawn relative to it in double precision (formalism §10's precision budget), so that the camera can stand on the regolith of Tycho or 110 au above the ecliptic without a change of scene. The Earth and the Moon keep their terrain, with every height's provenance; the other bodies carry the maps of the data library, finer close in from NASA's Trek services; Saturn has its rings and their shadow; the Milky Way is drawn in galactic coordinates; each planet's orbit is drawn for one period, from the ephemeris itself. Going to another body is a flight (the shared layer's `transferCamera`): the distance interpolated in its logarithm and raised in mid-flight to see both, the view turned toward the target.

### 2.2 Addresses and the Frames as a Connection

A point of the world is written in the navigation domain's address language (formalism §2.5): a body or a frame, a chart, coordinates, steps from the local horizon and an instant, read with one parse and printed in one canonical text. The page's address field takes a name from the gazetteer or an address; the engine's operation `address` reads it, answers it in every frame and chart of the catalogue, and says where a syntax error is and what was expected. The Galaxy enters as a frame of the catalogue, the galactocentric frame of astropy, so that "extend to the galaxy" is a new frame and not a new system. The conversions are the catalogue's frame graph, read as an $E(3)$-connection (formalism §2.6): a route-independent conversion is a flat connection, and the holonomies of the loops the catalogue holds measure the disagreement of its standards, reported in the FRAMES page. That is the gauge theory the user asked about, in the precise sense in which it applies: re-describing frames is a gauge transformation, and what can be measured is its invariants.

### 2.3 The Console

The page is laid out as a flight deck:

- **A glareshield** across the top: the clocks (UTC, TT, TDB, MJD, the world clock's rate, the distance from the present) and an annunciator panel of lamps for the engine, the ephemeris, Earth orientation, the clock, NTP, acquisition, the bus, the tiles, space weather and seismicity. Each lamp has four states, the reserved status colours, always with a word.
- **Two multifunction displays** at the sides, each with pages chosen by keys: on the left NAV (where the view is, and a point in every frame), TIME, FRAMES (the catalogue and its loops), LAYERS and SYS; on the right ENV, BUS, INSTR and SCHED (§2.4, 0004).
- **A control and display unit** along the bottom: the bodies' focus keys, the address, the world clock's keys, and the log of messages.
- **A status line** beneath it.

Nothing pops up. A message goes to the log and lights a lamp, and a lamp's state is its message in short. Keys are square, with a lit indicator; panels have hairlines and bezel ticks; the type is Source Serif 4, with small capitals for legends. The colours are pink and purple: rose (#EE8FBD) and orchid (#B892DD) on a plum night (#150D1B), and a deeper rose (#C2477F) and orchid (#7D54AB) on lilac paper (#FAF4FA) by day. The data's colours are validated for the colour-vision deficiencies by the dataviz skill's validator, and are kept apart from the status colours.

### 2.4 The Environment and the Data

- **ENV** shows what surrounds the observer, as its instruments read it (0004): the place and the ground beneath it; the air, with the 1976 standard atmosphere's profiles of temperature and pressure and the observer's height marked; the Sun and the sky, with a skyplot of the bodies and of the GPS and Galileo satellites above the horizon; radiation and space weather (the solar wind, the interplanetary field's $B_z$, the planetary $K$ index, the Sun's X-rays, energetic protons, each a gauge with its scale's thresholds); the geomagnetic field, with a compass rose of its declination; gravity.
- **BUS** shows every reading as it arrives, newest first, the latest of each sensor apart, each with its provenance as a colour and a glyph: observed now in rose, archive as a hollow mark, model in blue, synthetic hatched, assimilated in amber (formalism Definition 8.7).

## 3. Alternatives Considered

- **Keep a page for each body.** Simpler, and what slice S had; rejected by the user, and by the structure: the frames are one graph, so the page should be one world.
- **A virtual globe of the Earth, such as CesiumJS.** Its world is the Earth's fixed frame. The other bodies would be separate ellipsoids, without the barycentric chain that holds the Moon's regolith and Neptune's orbit in one double-precision scene. The shared layer's globe already has a level of detail after Cesium's (ADR 0049).
- **A style of dashboard widgets.** Rejected by the user ("smartphone app-like"), and by the infrastructure's preference for warm, humane pages that are not generic dashboards.
- **A syntax borrowed whole from STC-S** (IVOA). Kept in spirit, a frame, a reference position and coordinates on one line; STC-S has no surfaces of bodies, no grids and no steps from a local horizon, and its frames are the Virtual Observatory's alone.

## 4. Consequences

- The page is rewritten: `index.html`, `styles.css`, and `src/` as a console (`console.js`, `charts.js`, `pages/`), a world (`world.js`, `scene.js`, `navigator.js`, `maps.js`), the mission clock's view (`clock.js`) and the bus (`busclient.js`). The slice's tabs (`ephemeris.js`, `panels.js`, `place.js`) are removed.
- The engine gains `bodies`, `address` and `instruments`. The navigation domain gains the address language and the galactocentric frame, which are infrastructure ([ADR 0050](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0050-instruments-and-their-acquisition.md)). The shared visualization layer gains flights between bodies, bodies' maps as two root tiles, the Sun's lighting and the Milky Way.
- The formalism gains §2.5 (events and their addresses) and §2.6 (frames as a connection, standards as gauge).
- Cosmopoiesis's colour in the infrastructure's CLAUDE.md is pink and purple, replacing the provisional terracotta.
- Planned: terrain for Mars from its DEMs; the relativistic transformation between the BCRS and the GCRS (formalism §2.6, Remark); frames beyond the Galaxy, as boosts.
