# 0005. Fields Known in Part, a Compass with Its Coverage, Declared Instruments, and the Kernel Asked

- **Status:** Accepted, provisionally (the unresolved part of the Moon's crust is a stationary prior; the solar wind is carried ballistically; no instrument acts back on the world). Amends [0004](0004-instruments-and-their-acquisition.md) §2.1 (classes) and its account of timing.
- **Date:** 2026-10-28
- **Decided by:** the user, in five requests: "Whether currently the scheduler algorithm is the RT kernel aware"; "compass seems not working, as we said, class has its available spacetime, we can define compass as a sensor, that make it only available near Earth's ground, or simply remove compass and only visualize the magnet fields"; "build a generative model (You can utilize NN, Auto regression, fix a nonlinear dynamical model, or anything you want, or find advance job that SOTA on planetary magnet field data assimilation on spacetime) from historical data of moon magnet field etc. And input to virtual sensor instances"; "Create classes for such sensors as possible, but can not enable them … What I want to do just create such classes, to let developers and users know that, we can implement various kinds of sensors", with sections K (six axes), L (ten measurement engines) and M (an observation envelope) to criticise; and whether phenomena are well categorised, with a second layer of visual expression: "if you think better design exist, just use your idea." Claude designed and wrote it. The general methods are calx's ([decision 0010](https://github.com/huangwanhong-maker/calx/blob/main/development/decisions/0010-kernel-awareness-and-extended-range-legendre.md)) and physis's ([decision 0010](https://github.com/huangwanhong-maker/physis/blob/main/development/decisions/0010-potential-fields.md)); the composition is the infrastructure's [ADR 0052](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0052-fields-known-in-part.md).

## 1. Context

Decision 0004 gave Cosmopoiesis instruments as kernels of observation and a runtime with deadlines. Five things were missing or wrong:

- the runtime did not ask the operating system what it would grant;
- the HUD's north arrow read a stored heading rather than the picture;
- ENV's compass was the WMM magnetometer's declination drawn as a needle, wherever the observer was;
- the Moon had no magnetic field;
- the encyclopedia's families existed only as a table in a document.

## 2. Decision

### 2.1 The Kernel Is Asked

Before decision 0005 the scheduler was not aware of the real-time kernel: its policies (EDF, fixed priority with aging, FIFO, constant bandwidth servers) ordered jobs among the engine's workers, and the workers ran in the time-sharing class, preemptible by any process.

Each session now asks the kernel when it starts (calx `scheduler/kernel.hpp`). It reports:

- the system and its release;
- whether it is WSL;
- whether the kernel is PREEMPT_RT;
- whether SCHED_FIFO and SCHED_DEADLINE would be granted, each tried on a thread of its own and given back;
- RLIMIT_RTPRIO;
- the reason for any refusal;
- the class the workers run in.

The policy's `kernel` is `probe` by default and `fifo` on request, which raises the workers to SCHED_FIFO when the kernel grants it. SCHED shows the report and the choice. WSL 2 refuses both classes (no CAP_SYS_NICE, RLIMIT_RTPRIO 0), and its Linux kernel is itself scheduled by Windows. The timing stays measured, as 0004 said; it is now known why.

### 2.2 The Compass Is an Instrument with Its Coverage

The user's first option is taken. `compass.magnetic` (the encyclopedia's A03) is a point probe on WMM2025. Its coverage is the Earth from 1 km below the ellipsoid to 30 km above it, within the model's lifetime. It reads the declination, the inclination and the horizontal field.

Where $H<2000$ nT, WMM's blackout zone about each magnetic pole, a needle does not settle. There it answers *invalid*, with the reason. Below 6000 nT it reads with a caution (WMM2025 report, §1.8).

ENV's rose reads this compass, and says why where it cannot. The magnetometers read the field wherever their models hold.

The HUD's arrow was not a magnetic compass. It is now labelled as what it is, the focus body's north at the centre of the view. It is drawn from the picture: the target and a point a hundredth of the range north of it, both projected. So it holds for any heading, tilt or following of the stars, and it is dimmed in a flight between bodies.

The user's second option, drawing the field itself, is taken too (§2.4).

### 2.3 The Moon's Field: an Assimilated Model, Its Unresolved Part, and the Solar Wind

The Moon's crustal field has no history to learn from: it is remanent, constant over any human time. The work published on it solves an inverse problem, potential fields fitted to orbital magnetometry.

The model used is T2015_449 (Tsunakawa et al. 2015, Kaguya and Lunar Prospector, expanded by Wieczorek to degree 449). It is registered in the data library as `moon-magnetic-t2015` (CC BY 4.0) and evaluated by physis `analysis`. Its reading, its law, its unresolved part and the solar wind's carriage are the planetary-science domain's `magnetism`, founded for it at the user's request ("planetary can founded"; the infrastructure's ADR 0052); the magnetometer is this work's instrument on that model.

The generative part is principled rather than learned (formalism §8.7):

- **The spectral law.** A law $A\,n^\beta\rho^{2n}$ is fitted to the model's spectrum on degrees 30 to 250: $\beta=2.04$, and $\rho=0.99621$, an effective depth of 6.6 km (of the sources and the model's regularisation together).
- **The prior.** It is isotropic and Gaussian with that power.
- **The unresolved part.** By the law of total variance, its power is the law's less the model's, and it is drawn to degree 720 from the session's seed.

Its provenance is synthetic. It says how much finer structure there is, not where it is.

The time-varying part is the interplanetary field that SWPC measures at L1, one-minute values in GSE axes. It is carried ballistically to the Moon at the solar wind's speed, about an hour, and left out inside the Earth's magnetotail.

The server passes the field and the speed to the session as inputs. A reading lists the provenance of each part: assimilated for the crust, synthetic for the finer scales, physical for the solar wind's field.

The virtual instruments are the magnetometer at the observer, at Tranquility Base, on Reiner Gamma (with the finer scales) and 30 km above it.

### 2.4 The Fields Drawn

The Earth's field lines come from the engine's `field_lines`: 48 curves of WMM2025, traced by RK4 from 100 km above the ground at ±30°, ±50° and ±65° of latitude, to the ground or six Earth radii, with the caveat that beyond some four radii the magnetosphere shapes the field. They are drawn in the modelled blue and hidden behind the Earth.

The Moon's crust comes from `field_map`: $\lvert B\rvert$ or $B_r$ on a half-degree grid, optionally with its finer scales. It is laid over the Moon's ground in gold, logarithmic from 1 nT and clear where the crust is weakly magnetised, its radial component diverging. Its strongest cell lies at Gerasimovich on the far side, and its values about Reiner Gamma bracket the magnetometer's.

Three changes make the map fast:

- The engine sends the grid as float32 in base64. That is a sixth of the text of its decimal digits, which took 8.3 s through WSL's pipe and now takes 2.1 s.
- The server keeps the last few maps.
- The page lays the canvas on the tiles without encoding it as an image.

Drawing it exposed a fault of the shared tile tree. A layer of one level (a whole map) was never loaded once the view was close, because only the drawn tiles asked for images. Now the drawn tiles' ancestor at the layer's last level asks (`visualization/js/globe/lod.js`, with a check that fails without the fix).

### 2.5 Classes for the Instruments, and the Encyclopedia Declared

This amends 0004 §2.1. Its "no class per instrument" stands for makes. For operators and families there are now three layers (instruments.md §6):

1. **The sensor.** The abstract `Instrument`.
2. **Twelve kernel classes.** `PointProbe`, `Footprint`, `LineOfSight`, `Ranging`, `Counter`, `EventDetector`, `Proprioceptive`, `ClockReading`, `Protocol`, `QuantumMeasurement`, `Estimator` and `Feed`. Each is abstract, and fixes its kernel and the chain its readings pair with.
3. **Families.** Each family with a model is a final class deriving from its kernel's class, and the registry refuses a mismatch.

The encyclopedia's 101 families are declared as rows of a generated table (`engine/declared.hpp`, from the encyclopedia by `engine/tools/make_declared.py`). Each row gives:

- the kernel class the family would derive from;
- what it reads, its instruments and its observables;
- its interaction: passive, active, contact, destructive or mixed;
- its temporal behaviour and its state.

INSTR lists them by section, 21 with a model. A declared family is refused when mounted ("the family C06 (Radar sensing) is declared, not implemented: planned") and produces no data, as the user asked.

### 2.6 The Envelope of a Reading

Every reading carries:

- its measurement ($k@n$);
- its interval;
- its frame;
- its support (the chain its kernel pairs with);
- its snapshot;
- its interaction;
- its provenance;
- a quality: valid, outside, missing or invalid.

These are the user's envelope (M) with the reasons for absence made exact (formalism Definition 8.9). Uncertainty is carried where a family declares it, and is an open question elsewhere.

### 2.7 Phenomena on Three Axes, and Their Drawings as Composites

Formalism §3.5 already replaced the five kinds of phenomena (layer 1) by three axes (base, fibre, process). The five kinds of visual expression (layer 2) are replaced in the same way (formalism §3.6), by a composite:

- a restriction to the sub-base drawn;
- a reduction of the fibre;
- a mark, whose geometry follows the sub-base and whose channels follow the fibre.

Processes are drawn as the moving instant, as events, as wavefronts or as networks. The magnetic field is the example: curves in the volume, a colour on the surface and a needle at a point, all of one phenomenon. The user's surface, volume, field, wave and object are, respectively, two sub-bases, a fibre's channels, a process with a base, and a base with a fibre.

## 3. Alternatives Considered

- **Removing the compass and drawing only the field** (the user's second option). Rejected as the only change. The compass is an instrument of the encyclopedia, and its coverage and blackout zones are where a magnetic heading fails, which is worth showing. The field is drawn as well.
- **A neural network, an autoregression or a fitted dynamical system** for the Moon's field. Rejected for the crust: there is no time series of it to learn from, and a generator of maps trained on one model would invent structure. Such a generator would also not be a potential field, so its divergence and curl would be wrong. The Gaussian prior with the fitted law is the least committal choice for a given spectrum, and it keeps the field a potential's. For the part that does vary in time, the observations themselves (SWPC's) are the forcing, rather than a model of them.
- **Ravat, Purucker and Olsen (2020)'s model**, from along-track gradients. It was not fetchable here: its host serves a challenge to automatic clients. It may replace T2015 when it can be registered.
- **An empty abstract class for each of the 101 families.** Rejected (instruments.md §6). An empty class says nothing its row does not, and 101 of them would be kept in step with the encyclopedia by hand. A generated table is checked: 101 rows, each bound to one of the twelve classes, each refused when mounted.
- **The ten measurement engines (L) as the architecture.** Kept as a map onto the kernels. Wave, radiation and particle propagation belong to the world's models, so that every instrument reading one field reads it once (instruments.md §5.2).
- **SCHED_FIFO by default.** Rejected. It needs privilege, and a real-time thread that spins can starve the system. It is offered on request and reported.

## 4. Consequences

- The engine answers eighteen operations, among them the field lines and the field map. Its families are twelve classes deep; the encyclopedia's 101 families are listed and refused alike until written.
- The Cosmopoiesis suite runs 174 checks:
  - the compass's reading, blackout and coverage;
  - the Moon's magnetometer against pyshtools at five mounts, to $10^{-7}$ of $\lvert B\rvert$;
  - the finer scales as a function of the seed;
  - the solar wind's part and its travel;
  - the envelope and the qualities;
  - the declared families' refusal;
  - the kernel's report;
  - the field lines' closure at low latitude;
  - the map's float32 encoding.
- A first active instrument (a radar, a laser altimeter) will need the world system's ports (formalism §5.4).
- A law of uncertainty for every reading remains to be written (instruments.md §8).
