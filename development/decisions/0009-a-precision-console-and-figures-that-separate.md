# 0009. A Precision Console, and Figures That Separate

- **Status:** Accepted, provisionally (seen in headless Chrome by night and by day; the usability task of [0006](0006-the-world-first-and-the-field-about-a-point.md) §4 is still to be run). Amends [0003](0003-one-world-its-addresses-and-a-console.md) §2.3 (how its keys and panels are drawn) and [0006](0006-the-world-first-and-the-field-about-a-point.md) §2.4 (its type). The arrangement of both is kept.
- **Date:** 2026-10-29
- **Decided by:** the user, in two messages.
  - **The request.** "Could you revise the UI and font for better. And make some diagram/graph like field graph can seperate. And Multi panel design can remain, but we love more future-feeling style. Current UI style like old computer game's UI… anyways, try your creativity."
  - **The first answer, rejected.** Claude first drew rounded panels of dark glass (14 px corners), rounded keys (7 px) glowing from beneath, and set them in Space Grotesk and Inter. The user rejected it at once: "rounded button, and cartoon-like font… make it like a children toy…".

  This record holds the second answer, which Claude designed and wrote.

## 1. Context

Decision 0003 drew the console as a panel of the 1990s is drawn:
- bezels with ticks;
- keys as raised squares with lit indicators;
- a serif with small capitals for the legends.

Decision 0006 replaced the serif, for legibility, and kept the bezels. To the user the console read as an old computer game.

The rejected first answer taught two things:
- **Precision, not softness.** What feels like the future in an instrument is precision. Rounded glass and soft glows read as a toy.
- **The type carries the character.** A geometric face with quirky letters (Space Grotesk) reads as a cartoon, whatever is drawn around it.

There was a second matter. The figures (the field's cube, the rover's map, the charts) were confined to a display 384 px wide, and could not be studied at a size of their own.

## 2. Decision

### 2.1 The Look

- **Square.** Nothing has a radius except what is round in the world: the reticle, the compass, a body, and the glyph of an observed reading, whose circle is its code.
- **Displays.** A display is a pane of dark glass, the world blurred behind it, with a 1 px hairline round it and a tick of rose at each corner (9 px). There are no bevels and no lit edge.
- **Keys.**
  - A key is an outline. Hovered, it is washed. Chosen, it is lit rose, with a notch of 6 px in its top-left corner.
  - A choice of one among several is a row of keys joined, sharing their borders (`.seg`).
  - A display's page keys are tabs with a rule beneath.
- **Indicators.**
  - Lamps, the instruments' health and the marks of headings are small squares (5–6 px). A lamp keeps its word beside its light.
  - A choice of several is a square box; a choice of one is a diamond.
  - A slider is a hairline with a bar.
- **Readings** are large, light figures (Plex Sans at weight 300, 25–29 px), each with a tick at its corner.
- **Glow** is kept for what is lit, a lamp, and for nothing else.
- **By day** the panes are frosted light glass, in the same forms. The status colours are darkened until their words read at 4.5:1 or better on it, as WCAG 2.2 asks: good #0B7A36, warning #9A6200, serious #B4482A, critical #C22F33.
- **The colours** are the pink and purple of decision 0003, unchanged.

### 2.2 Type

One engineered family, IBM Plex, under the SIL Open Font License:
- **Plex Sans Condensed** for what names: the mark, headings, keys and labels;
- **Plex Sans** for what is read: text, tables and readings, with tabular figures;
- **Plex Mono** for clocks, addresses, identifiers and lamps.

The world's labels are in Plex Sans Condensed.

Sizes and cases:
- readings 25–29 px, light;
- headings 14.5 px, in sentence case (decision 0006);
- text 13.5 px;
- labels 10.5 px, in capitals tracked 0.16 em. They are words of one or two (UTC, SITE, READ BY), not sentences. Nothing else is under 11 px.

Keys stay in sentence case, because their units must not be capitalised (nT, km).

### 2.3 Figures That Separate (`src/separate.js`)

- **Which figures.** Seven figures can leave their displays: the field's cube (FIELD), the profiles of the air, the compass's dial and the sky (ENV), the rover's map and the graph along its track (ROVER), and the scheduler's timeline (SCHED).
- **Separating.** Each has a key in its corner. Pressed, the figure is *moved*, not copied, into a window of its own over the world. It keeps its state, its listeners and its updates. Its place keeps a note with a key to dock it back.
- **A window.**
  - It is dragged by its bar, and is kept on the screen with its bar reachable.
  - It is resized from its corner.
  - It is enlarged to the stage between the displays, and back, by ⤢ or a double click on its bar.
  - It comes to the front when touched.
  - It opens only when asked and stays until docked, so it is not a pop-up.
- **Placement.** A window first stands beside the display it came from, within the stage between the displays, and level with its figure where it can be. A figure scrolled out of sight is not followed off the screen. Windows opened one after another cascade by 40 px, more than a bar, so that none hides another's bar. The browser remembers where each window was and whether it was open.
- **Drawing.** A page whose figure is out counts as shown, so that it keeps the figure current. In a window, a figure is drawn at the window's size, and its text at its own size.
- **A new figure: the graph along the track.**
  - It shows what the magnetometer read (|B|) against the distance driven, what T2015_449 said there, and, once revealed, the truth.
  - The engine's readings now carry `driven_m`, `prior_ned_nT` and `prior_total_nT`, and `truth_total_nT` when revealed.
- **The rover's map** is drawn in the plum map on the night's glass and in the orchid map by day. Its track, readings and waypoints have dark halos, so that they read on any colour of the map.

## 3. Alternatives Considered

- **Rounded dark glass with Space Grotesk and Inter** (the first answer): rejected by the user as a toy.
- **Chamfered corners** (clip-path) on panels and keys, the idiom of films and games: they cut the borders at the chamfer and read as a game's HUD, the look the user left.
- **Keys in capitals:** they would capitalise the units (nT as NT, km as KM), which is wrong in SI.
- **Other faces:**
  - Orbitron, Rajdhani and Exo are styled for games;
  - Sora and Manrope are rounded and geometric, the toy again;
  - Barlow has softened corners.

  Plex is drawn as engineering type: its grotesque has squared curves, and its mono is a working face.
- **Copying a figure into a window:** there would be two copies to keep current, and the cube's camera would be duplicated.
- **Windows of the browser** (`window.open`): they are pop-ups, are often blocked, and lose the page's shared state.

## 4. Consequences

- **What stays.** The console keeps its arrangement (decisions 0003 and 0006), its decks and its context bar. Only its drawing and its type change.
- **Tokens.** The tokens keep their old names (`--bezel`, `--panel`, `--radius`, now 0), so the canvases that read them needed no change. The canvases now take their fonts from the tokens, since a canvas cannot resolve `var()`.
- **Checks.** `tests/run-tests.mjs` gains eight: four of placement, three of the readings along the track, and one of the revealed truth's |B|. The suite runs 274 checks.
- **Open.**
  - The usability task of decision 0006 §4 is still to be run.
  - The left display's pages have no figures to separate yet.
