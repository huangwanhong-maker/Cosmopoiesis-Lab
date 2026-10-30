# 0006. The World First: the Context, Two Decks, Readings Before Machinery, and the Field About a Point

- **Status:** Accepted, provisionally (the arrangement of the displays awaits the usability task of §4). Amends [0003](0003-one-world-its-addresses-and-a-console.md) §2.3 (its type) and the displays' pages of [0004](0004-instruments-and-their-acquisition.md) and [0005](0005-fields-known-in-part-and-declared-instruments.md). Its field about a point is amended by [0007](0007-the-worlds-fields-and-their-drawing.md), its type (§2.4) by [0009](0009-a-precision-console-and-figures-that-separate.md).
- **Date:** 2026-10-29
- **Decided by:** the user, in two requests.
  - **The field about a point.** "Whether we can utilizing 3D cube to visualize a spacetime point nearby's magnet field … just fill different color inside this. And for other available sensor also the same."
  - **The console revised.** The user asked for the console to be revised after a review by another reader ("I not sure what is a good design, but try your efforts"). The review found:
    - the interface shows the system's internal structure more clearly than the physical world;
    - five contexts are mixed together: what the camera looks at, the observer, the place studied, the frame, and where a sensor is mounted;
    - the serif type is hard to read in dense panels;
    - the technical panels take the screen;
    - instruments are listed as identifiers and counters rather than readings;
    - the bus reads as a debugging log;
    - the scheduling page buries its results in prose;
    - the address's syntax errors are cut short;
    - "Position (truth)" misnames a modelled state.

  Claude designed and wrote it, keeping the console of decision 0003 (bezels, square keys, lamps, no pop-ups) and its pink and purple.

## 1. Context

Decision 0003 laid the page out as a flight deck, and decisions 0004 and 0005 filled its displays with the instruments, the bus, the scheduler and the declared families. The reviewer's principle is taken as this decision's: *the user meets the phenomenon first, its evidence second, and the machinery behind it third, and can move freely among the three.* A flight deck itself is built that way. The primary flight display shows the aircraft's state; the systems pages are a key away.

## 2. Decision

### 2.1 The Context Is Always Shown

A bar beneath the glareshield keeps five things apart. A click on each opens the page that studies it.

- **View.** The body the camera looks at, and the range.
- **Point chosen.** The place studied. It is drawn as a rose cross in the world and on every display, and named by the feature it lies in.
- **Observer.** Where the instruments mounted on the observer read. It is drawn as an orchid diamond, and the bar says whether it follows the point.
- **Frame.** The frame in which the positions on the body in view are written.
- **Instruments.** How many are mounted on the observer, elsewhere, and as feeds.

The bar also says how the point and the observer stand to each other: the same place, a distance apart, or on different bodies. In the world, the two marks carry their names.

### 2.2 Two Decks

The two displays keep their keys. Each page now belongs to a deck:

| Deck | Left display | Right display |
|---|---|---|
| **Science** (the default) | POINT, LAYERS, TIME | ENV, FIELD, INSTR |
| **Engineering** | FRAMES, SYS, TIME | BUS, SCHED, INSTR |

- **Switching.** Two keys on the glareshield switch decks. Each display returns to the page it last showed in that deck.
- **Pages across decks.** A page of the other deck asked for by name (a click on the context) is shown all the same, with its key lit.
- **POINT** replaces NAV. It shows the point chosen as a place first, then the point as seen from the observer, then its address in every frame (folded away), then the view and the language of addresses with its examples.

### 2.3 Readings Before Machinery

- **One formatter.** A reading is shown first as its main value with its unit, a few parts beside it, its provenance and its age, and where it was read. One formatter (`src/readings.js`) serves ENV, INSTR and BUS, so a value found on one page is recognised on the others.
- **ENV** says first which place its readings describe. Its readings are tiles.
- **INSTR** shows cards grouped by mount: on the observer, at fixed places, on satellites, feeds. Each card holds its reading and its health. Its inspector holds the kernel, the family's key, the counters, the cost and the coverage. The registry's kernels, families and declared families are folded beneath.
- **BUS** groups its streams the same way. A stream can be found by text, mount or provenance. Its inspector shows every quantity with its unit, the observation envelope and the record.
- **SCHED** leads with its key figures. It compares the policies in bars, and writes out what each figure counts: the periodic load is Σ cost/period over the periodic sensors, and a burst is not in it. With the burst, workers × deadline bounds how many of its jobs can be on time under any policy.
- **FRAMES** is a tree that folds and can be searched.
- **The address line.** Empty, it shows examples and a composer (body, latitude, longitude, height, instant). Its syntax errors are shown in full, with a hint of how such an address is written. A step after a point follows a slash, the error behind "expected @ and an instant".
- **The reference state.** `position.truth` is titled "Reference state", the mount's modelled place without error, a control. Its key is unchanged.

### 2.4 Type

The console's type is a family of three:

- **Source Serif 4** for the name and the few lines of prose;
- **Source Sans 3** for everything read at a glance: labels, keys, headings and readings, with tabular figures;
- **Source Code Pro** for identifiers, addresses and records.

The sizes are:

- readings 22–26 px;
- headings 15 px, in sentence case without small capitals;
- text 14 px;
- labels 12.5 px, and nothing under 12 px.

The three faces are one design family, licensed under the SIL Open Font License, so the serif's character carries over. The palest inks are darkened by day and lightened by night: the faintest text is about 6:1 against its ground (WCAG 2.2 asks 4.5:1). The rose and the orchid are kept for what is chosen and what can be pressed.

### 2.5 The Field About a Point

The engine reads any instrument whose reading is a function of where it stands at every cell of a cube about an event (`probe_volume`, `engine/neighbourhood.hpp`). Those are the point probes, the lines of sight and ranging. It reads them in the same world and at the same instant as the observer's own instruments. The cube is the restriction of the instrument's observation operator to a neighbourhood. It is formalism §3.6's visual expression, restriction ∘ reduction ∘ mark, with the restriction to the cube, the reduction to one quantity or the vector, and the mark a colour per cell.

- **The cube.**
  - Its axes are the local east, north and up at its centre.
  - It has n per edge cells, ordered east fastest.
  - It is centred on the point or the observer, or it stands on the ground with the point at the middle of its floor. That is the default when the point is on the ground, where a centred cube would be half below it.
- **Vectors.** A magnetometer's north, east and down, or a gravimeter's east, north and up, are each turned from the cell's own local frame into the cube's axes. The local frames differ by degrees across a cube a thousand kilometres wide.
- **FIELD draws it** (src/cube.js on three.js, src/volume.js for its arithmetic):
  - the cells as boxes with gaps between them, so that the inside shows through;
  - or three slices, the shell, or the surface of one level (the visualization layer's surface nets);
  - arrows of the vector, or of its departure from the cube's mean;
  - the body's figure in amber where it crosses the cube;
  - a readout of the cell under the pointer.
- **Colours.** The colours are the visualization layer's sequential and diverging maps, monotone in lightness. The scale is linear, logarithmic, or diverging about the centre's value.
- **Empty cells.** A cell the instrument cannot read is left empty, and the reasons are counted.
- **The figures.** The value at the centre, the range across the cube, and the gradient by a linear least-squares fit over the cells.
- **In the world.** The same cells can be placed in the world, in the body's fixed frame, as a feature of the scene (`Scene.setObject`).

## 3. Alternatives Considered

- **A complete visual rewrite**, a scientific workstation in place of the console. Rejected: the reviewer advised against it, the console is the user's choice (decision 0003), and its faults were of hierarchy, not of identity.
- **One deck with fewer pages.** Rejected: the machinery is part of what Cosmopoiesis is for, and engineers need it a key away, not removed.
- **A sans-serif face of another family** (Inter, IBM Plex Sans). Not chosen: Source Sans 3 is the serif's companion, so the console keeps one voice.
- **Volume rendering by ray marching** for the cube. Deferred: boxes with gaps, slices and level surfaces show every value exactly as read, a ray-marched cloud blends them, and a cube of 21³ readings is small.
- **The cube in the engine's own frame axes** (ITRS, MOON_ME). Rejected: east, north and up are the axes in which a reader of a place thinks, and in which a magnetometer reports.

## 4. Consequences

- **What changed with this decision.** CLAUDE.md §5 and architecture §7 record the type and the decks. README §2 records the displays, and README §5 and architecture §4 record the operation. The infrastructure's CLAUDE.md records that Cosmopoiesis's data are set in Source Sans 3.
- **The checks** hold:
  - the cube's centre to the instrument's own reading;
  - the WMM2025 cube's divergence and curl near zero (the axes and the turning of vectors right);
  - its coverage, refusals, encodings and determinism;
  - the page's arithmetic: cells, scales, the gradient of a linear field recovered exactly, the centre, and the ground.
- **A usability task is proposed**, after the reviewer's: someone new to Cosmopoiesis finds Tycho, reads the modelled magnetic field there, says where the value came from, and checks whether a virtual magnetometer can be mounted. The measures are time, steps, errors and confidence. The arrangement of §2.2 is provisional until it has been run.
- **Open.**
  - A time axis for the cube (a cube for each tick of the world clock).
  - Cubes of a physical source's readings, which are of the present only.
  - Moving `volume.js` to the visualization layer when a second work needs it.
