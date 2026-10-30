# 0010. The World beneath the Ground and the Sea

- **Status:** Accepted, provisionally (seen in headless Chrome by night and by day, over the Japan Trench and northern Chile). The Earth only: on the Moon a section has its terrain and says it has no interior. Amends [0004](0004-instruments-and-their-acquisition.md) (a twelfth family of virtual instruments) and the ENV page of [0006](0006-the-world-first-and-the-field-about-a-point.md).
- **Date:** 2026-10-30
- **Decided by:** the user, who asked of the environment page: "we may even visualize under ground/sea geography". Claude designed the answer, on the infrastructure's [ADR 0055](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0055-the-earth-beneath.md).

## 1. Context

ENV described the observer's environment from the ground up: the air, gravity, the magnetic field, the sky. The world could already show the sea floor with the water taken away (LAYERS). Nothing showed what lies beneath the ground or the sea floor: the crust and its layers, the Moho, the mantle, the earthquakes at depth, the core.

## 2. Decision

### 2.1 What the Page Shows

ENV gains a section **Beneath**, between the ground and the magnetic field, so that the page reads downward from the sky. It holds three things.

- **The column's readings.** These come from the instrument `seismic_column.crust1`: the crust's thickness and kind (oceanic or continental), the Moho's depth, the sediments, the water and the ice, the speeds beneath the Moho (Pn), and the time a P wave takes through the crust. Under the ground or under the sea, the observer is told the layer it is in; otherwise ENV gives gravity at the core–mantle boundary. The ground's tile becomes **Sea floor** at sea, with its depth.
- **A section through the observer** along a geodesic, in three views:
  - **Surface:** the land, the sea and its floor, heights against distance, exaggerated and said so.
  - **Crust:** to 15 km below the deepest Moho.
  - **Mantle:** to 800 km, at true scale, the Earth's curvature drawn.

  The keys choose the direction (N–S, W–E, SW–NE, NW–SE, or turned by 15°) and the length (±250, ±750 or ±2000 km). The legend names each colour and mark. On hover, every point says what lies there: its layer or shell, its density and its speeds, and which model says so. An earthquake on hover gives its magnitude, depth, date and region, and its distance off the line.
- **The column to the centre:** the speeds of P and S waves and the density against depth, below the Moho or to the centre, the Earth's regions banded. S waves stop at the liquid outer core.

Both figures separate into windows of their own ([0009](0009-a-precision-console-and-figures-that-separate.md)), the section's larger than the default. The section's trace is drawn on the world in the observer's orchid.

### 2.2 How It Is Drawn

- **Density by colour.** Rock is coloured by its density, light rock pale and dense rock dark. By night this is the plum map reversed: cream sediments, Old Rose crust, plum mantle. By day it is the orchid map, as the rover's map uses it.
- **The other marks:**
  - the sea in a translucent blue, and ice pale;
  - the layers' boundaries as hairlines, and the Moho in the ink's colour;
  - the earthquakes in the observed rose, sized by magnitude;
  - PREM's discontinuities as dashed arcs.
- **Composed, not smoothed.** The terrain gives the surface, CRUST1.0 the layers, constant in its cells of 1°, and PREM the mantle as one gradient in depth (radial in the mantle view). A clip of the region below the terrain cuts the layers where the ground or the sea floor does.
- **What it says.** The figure states the exaggeration, the terrain's sources and the catalogue's span. In its own window the long note gives way to the chart; the legend and the hover say the rest.

### 2.3 What Computes It

- **The engine** (`engine/beneath.hpp`):
  - the instrument `seismic_column.crust1`, a footprint of the model provenance, the encyclopedia's B09, written at last;
  - the operation `beneath.section`, which answers the samples, CRUST1.0's columns and PREM's shells, and places the events given to it along and across the geodesic;
  - three fields of the world, `earth.interior.density`, `earth.interior.vp` and `earth.interior.vs`, CRUST1.0 over PREM at each point's place and height above the geoid, so that FIELD's cube can read the interior too.

  All of it is the geophysics domain's `structure` (ADR 0055).
- **The server** composes a section:
  - Global CMT's centroids near it, from the product `events-gcmt`, are handed to the engine;
  - the terrain along it comes from the data library's tiles: ETOPO 2022 for steps of 4 km and more, otherwise Terrarium at the zoom of half the step; LOLA on the Moon;
  - Natural Earth's land tells the sea from land below sea level;
  - SRTM's 0 m at sea is replaced by ETOPO's floor, in the section and in the terrain probe, which now says when it stands over the sea.

  The last eight sections are kept.
- **The page** (`src/beneath.js`) holds what lies at a point and the views' projections, flat and curved, with their inverses, and draws in SVG.

## 3. Alternatives Considered

- **Cut the world itself open** (a block of the globe removed). Deferred: a section is how the subject is read, and its scales can be stated; a cut in the three-dimensional world would need the terrain's mesh and the interior's together, and is a later piece of work.
- **The gold map for rock.** Tried and rejected after the first screenshots: it is bright orange against the plum console. The plum and orchid maps keep the figure in the console's family.
- **Smooth layers.** Rejected: CRUST1.0's cells are averages, and the steps say what the model knows.
- **The present's earthquakes** (USGS's feed of the last day) instead of Global CMT. Rejected: a day's events rarely fall near a section, while fifty years of centroids trace the sinking plates to 660 km.

## 4. Consequences

- **The engine** answers thirty operations; the world holds thirteen fields; twelve families of virtual instruments are written.
- **The recipe** fetches CRUST1.0 and Global CMT and builds their products.
- **`tests/run-tests.mjs`** gains checks of the page's geometry (what lies where, the projections and their inverses, true scale), of the engine's section (its samples, its events on, beside and far from the line, its columns), of the interior's fields against PREM as ObsPy tabulates it, and of the Moon's refusal. **`tests/check_runtime.py`** reads the column at Greenwich and on the Moon. The suite runs 305 checks.
- **Open:**
  - the Moon's interior (GRAIL's crust, Apollo's seismology);
  - the ocean's water column (temperature, salinity, the speed of sound, the SOFAR channel);
  - the terrain tiles' sea floor near coasts (ADR 0055 §5);
  - a cut through the world itself.
