# 0002. The Spacetime Slice First: the Earth and the Moon, Their Coordinates, and a Globe

- **Status:** Accepted, provisionally; §2.3, the page, amended by [0003](0003-one-world-its-addresses-and-a-console.md) (one world, addresses, a console)
- **Date:** 2026-10-28
- **Decided by:** the user: "begin from spacetime model and visualization", with a frontend like the Earth Atlas or Google Earth and its multi-resolution rendering, the Earth's, the ocean's and the Moon's data, and something better than interpolation where they are missing; then "our spatial and time coordination system … various systems, and convert among them, like aircraft/spacecraft navigation". Claude designed and wrote the slice; the infrastructure's side of it, the domains' C++, the navigation bridge, the data and the globe, is its [ADR 0049](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0049-the-spacetime-of-the-earth-and-the-moon.md).

## 1. Context

Decision 0001 planned the work in vertical slices beginning with a thermal box (architecture §9). Every later slice stands in a world's frames and at an instant of its time scale: the lunar patch under the Sun of a date, the basin on the Earth, the Solar System. The infrastructure had those frames only as provisional JavaScript. The user asked for them first, with a globe to see them on.

## 2. Decision

### 2.1 The Slice

A new first slice, **S**, before slice 0: the spacetime of the Earth and the Moon.

- **The world.** Its root frame is the ICRS and its time scale TT. Its bodies are the Earth (WGS 84, the IERS's orientation) and the Moon (the sphere of 1737.4 km, DE440's libration), placed by DE440.
- **Its coordinates.** Every system navigation uses, converted by the domains' C++.
- **Its satellites.** CelesTrak's element sets, propagated by SGP4.
- **The page.** A globe of both bodies that refines as one comes near.

The slice holds no dynamics of its own: the motions are the ephemeris's and SGP4's. Its checks are the authorities' values in the domains and the work's own checks of the engine's answers.

### 2.2 The Engine's First Operations

The protocol of architecture §4.5 gains:

- `status`, `time`, `frames`, `ephemeris`, `transform` and `holonomy`;
- `convert` and `geodesic`;
- `satellites`.

Their names and fields are in the README, §5. Every value is named with its unit, and every position with its frame. The engine is also run with `--serve`: kept alive, one request per line, its kernels read once. The planned operations (`catalogue`, `prepare`, `run`, `sample`, `invariants`, `verify`) are unchanged.

### 2.3 The Page

The page's thread does not recompute the frames. It asks for windows of samples and interpolates them: slerp with the Earth's spin factored out, and Hermite paths. It draws only when something changes. The globe, its level of detail, its imagery and its sky belong to the shared visualization layer, not to this work, so that other works can draw globes too.

## 3. Alternatives Considered

- **The thermal box first, as planned.** It would have built the runtime before the world it runs in. The user preferred the world's spacetime, and every later slice needs it.
- **The frames in JavaScript in the page.** That would mean a second implementation to keep equal to the C++, of the full IAU 2006/2000A model among them. It was rejected for the windows of samples.
- **The engine in WebAssembly in the page.** It would remove the server's round trips. It is kept open: the engine is pure C++, and nothing in the protocol prevents it.

## 4. Consequences

- Slice 0, the thermal box, follows. It will read its frames from the catalogue too.
- The World view of architecture §7 has its first form in the globe. The tabs (Layers, Time, Place, Frames, Data) are this slice's, and will be folded into the views as they come.
- The engine's own CMake checks (architecture §4.6) are not yet written. Its answers are checked through the protocol by `tests/run-tests.mjs`.
