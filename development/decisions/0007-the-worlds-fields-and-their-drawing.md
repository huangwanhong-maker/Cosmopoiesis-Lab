# 0007. The World's Fields and Their Drawing

- **Status:** Accepted, provisionally (the Earth's fields on spheres about its centre; a shell above the ellipsoid, and fields of the other bodies, wait for their models). Amends the field layers of [0005](0005-fields-known-in-part-and-declared-instruments.md) and the field about a point of [0006](0006-the-world-first-and-the-field-about-a-point.md).
- **Date:** 2026-10-29
- **Decided by:** the user saw that the work's model is "basically a field theory based model", and asked for "a unified way, model various fields (tensor, scalar, even manifold or complexes), and their formalism. Then the visualizations for them", with the evolution "separated". Claude designed and wrote it, with the foundations' and the domains' parts. The infrastructure's record is [ADR 0053](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0053-fields-and-their-visual-expression.md); the general model is physis's [decision 0012](https://github.com/huangwanhong-maker/physis/blob/main/development/decisions/0012-fields-as-sections.md).

## 1. Context

The formalism names a phenomenon's kind (base, fibre, process; Definition 3.9) and its drawing (restriction, reduction and mark; Definition 3.10). The engine held neither as a type. The field lines were a loop of their own over WMM2025. The Moon's map was a grid of its own over T2015_449. The cube about a point read instruments only. Each refused, coloured and named its quantities in its own way.

## 2. Decision

### 2.1 The World's Fields

The engine holds the world's fields by name (`engine/fields.hpp`). Each is one of physis's fields, of a domain's model, bound to this world:

| Field | Of | Bound to the world by |
|---|---|---|
| `earth.magnetic` | geophysics `WmmField`, on WMM2025's base | the world's time, TT seconds from J2000.0, read as a decimal year of UTC through metrology's leap seconds |
| `earth.magnetic.core` | the same, continued outward | the core's field beyond 850 km, noted |
| `earth.gravity.normal` | geodesy `NormalGravityField` | — |
| `earth.atmosphere.temperature`, `.pressure`, `.density`, `.speed_of_sound` | meteorology `StandardAtmosphereField`, pulled back into space | the height above the world's geoid (EGM96), or above the ellipsoid with a note when the geoid is not loaded |
| `moon.magnetic.crust` | planetary science `LunarCrustalField`, the model | — |
| `moon.magnetic.unresolved` | the same, its unresolved part to degree 720 | the world's seed |
| `moon.magnetic` | physis's sum of the two | its provenance synthetic, its parts named |

A field whose model is not loaded is listed with the reason, as a declared instrument is. Fields are made again when the world's models, geoid or seed change.

### 2.2 The Operations

- **`fields`** gives each field's descriptor: base, fibre with its unit, representation, provenance, parts, source and capabilities. The Moon's fields also carry the law of the crust's spectrum.
- **`field.sample`** reads a field on a sphere, a plane, a volume or a list of points in its frame. It can reduce a vector to its magnitude, a component, its radial or horizontal part, or its components on given axes. Values are doubles in JSON or float32 in base64. Each point carries its quality as a byte and its reason or note by index, with the counts. A field that depends on the time is not read without one.
- **`field.curves`** integrates the field lines or streamlines of a vector field through seeds, within a shell if asked. Each end says why it ended. $\lvert v\rvert$ is given along each curve.
- **`field_lines` and `field_map`** are now these. The lines are the curves of `earth.magnetic.core` through the 48 seeds, within the shell from the sphere of 6371.2 km to six Earth radii. Each ends where it first leaves the field's base (1 km below the ellipsoid) or the shell. The map is `moon.magnetic.crust`, or its sum with the unresolved scales of a degree and a seed, sampled on a sphere.
- **`probe_volume` with `field`** reads a field over the cells of a cube, the same cells as a family's: physis's volume grid about the centre, its axes the body's east, north and up. The answer has the same shape. A vector field gives its magnitude, its components along the cube's axes and its vector on them. A field is read in its own frame: the Earth's about a point on the Moon is refused. A family's cube now stands on the same grid.

The server allows the three operations, bounds a sampling at $2^{20}$ points and a curve's seeds at 512, gives the session's seed, and keeps the last few fields read without a time.

### 2.3 Their Drawing

Every drawing of a field on the page is a visual expression of the shared scene model (visualization `scene/`), coloured by the shared styles and built by the shared renderers:

- **The Earth's field lines** are coloured by $\lvert B\rvert$ along them on the plum map, on a logarithmic scale, bright near the ground and fading outward.
- **The Moon's crust** is $\lvert B\rvert$ on gold, logarithmic from 1 nT and clear below. Its radial part is on the orchid–gold diverging map, logarithmic in its size from 1 nT each way, clear about zero.
- **A field on a sphere about the Earth** is new in LAYERS. It is any field of the ITRS on the sphere of 6371.2 km raised by a height, as a translucent shell: a vector's magnitude or radial part, a scalar as it is. WMM2025's $\lvert B\rvert$ at 400 km shows the South Atlantic Anomaly.
- **LAYERS lists the world's fields**, each with its fibre, unit, representation, base and provenance, or why it is not loaded.
- **FIELD reads a cube by an instrument or by a field of the world**, offered side by side, so that an instrument's reading and the field it samples can be set against each other. The cube's cells, scales, fit and level surface are the scene model's; its meshes are the renderer's.

## 3. Alternatives Considered

- **Keeping the operations of their own beside the fields.** Rejected: two ways to compute one field disagree in time. `field_lines` and `field_map` keep their answers for the page and the checks, and are now the general operations.
- **A shell at constant height above the ellipsoid.** Deferred: a sampling of the figure's own surfaces, which physis's samplings, being of a frame's spheres and planes, do not have yet. The sphere about the centre is what WMM2025's own reference sphere is.
- **Reading a field in another frame by its change of frame** (physis `in_frame`). Deferred to the first field that needs it: the Earth's fields are refused on the Moon, where the models do not hold anyway.

## 4. Consequences

- Cosmopoiesis has 240 checks, 19 of them new. They hold the operations to truths outside them:
  - WMM2025's field at NOAA's test point;
  - `field_map`'s values, which the sampling reproduces;
  - normal gravity's $\nabla\cdot\gamma=2\omega^2$ and $\nabla\times\gamma=0$ on a volume's own axes;
  - the standard atmosphere's tropopause, and its refusal above 86 km with the reason;
  - the curves within their shell, each end with its reason, $\lvert B\rvert$ along them the field's;
  - a field's cube against the magnetometer's, cell for cell, to $10^{-12}$;
  - the refusals (too many points, a reduction of a scalar, an unknown field, a field outside its frame).
- A field line ends where it first leaves the field's base or its shell. Near the poles that is the shell's sphere of 6371.2 km, as before. At low latitudes it is WMM2025's base, 1 km below the ellipsoid, which lies above the sphere there: up to some 6 km above it at the equator.
