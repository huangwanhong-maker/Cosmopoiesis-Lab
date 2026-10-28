---
title: The Instruments of Cosmopoiesis
status: draft
date: 2026-10-28
implemented-by: [engine/observation.hpp, engine/instruments.hpp, engine/environment.hpp, engine/lunar.hpp, engine/declared.hpp, runtime.py]
---

# The Instruments of Cosmopoiesis

*Status: draft, 2026-10-28.* This note says what an instrument is in Cosmopoiesis, and maps the encyclopedia of scientific instruments that the user gave ([its tables](encyclopedia-of-instruments.md): sections A to J, 101 families and several hundred makes and methods) onto the kernels of observation of the formalism ([§8.5](formalism.md), Table 8.1). It records which families the engine and the server have and which are planned, and how a new one is added. The decision is [0004](../development/decisions/0004-instruments-and-their-acquisition.md).

## 1. Four Things That Are Not One

The encyclopedia itself insists on a distinction, and the registry keeps it: *gravity is a physical field, a gravimeter is an instrument, and a gravity anomaly map is an inferred data product.* Cosmopoiesis keeps four things apart:

| Thing | What it is | Where it lives |
|---|---|---|
| **a quantity of the world** | a section of a bundle over a base, of a kind (base, fibre, process) of formalism Definition 3.9: $B$ on the region about the Earth, the radiance of the Sun's disc, the counting measure of a population | the domains' models: geophysics `geomagnetism`, meteorology `atmosphere`, geodesy `gravity`, astronomy's ephemerides |
| **an instrument family** | an observation operator of one kernel, bound to a model, with quantities, a cost and a coverage | the engine's registry (`InstrumentInfo`), the server's adapters (`runtime.py`) |
| **a sensor** | a family mounted somewhere, with a timing | a session's declared set (`SensorSpec`): an id, a family, a mount, a clock, a period, a deadline, a criticality |
| **a product** | data derived from readings by a declared method: a map, an analysis, a reconstructed state | the data library's products, and the readings of estimators (provenance assimilated) |

A make is not a class of its own. A fluxgate, a SQUID and an NV-centre magnetometer are one point probe of $B$ with different noise, bandwidth and range: a family with parameters, which is data. An abstract class is written where the observation operator differs, which happens twelve times; each family with a model is a final class deriving from its kernel's; and the encyclopedia's other families are declared as data bound to the class they would derive from (§6).

## 2. The Kernels

| Kernel | Observation operator | Pairs with (formalism §3.5) |
|---|---|---|
| point probe | $y=\varphi(x(t))+\varepsilon$ | a point of a region: a 0-chain |
| footprint | $y=\int_D w\,\varphi\,d\mu+\varepsilon$ | a weighted $k$-chain: a pixel's footprint, a gauge length, a column |
| line of sight | $y=\int_{\text{aperture}}\int_{\text{cone}}L\,R\,d\Omega\,d\nu$ | a point and a cone of directions of the radiation bundle |
| ranging | $y=\lvert x-x_e\rvert+c\,\delta t+\text{delays}+\varepsilon$ | two worldlines and the medium between |
| counter | $N\sim\mathrm{Poisson}\big(\int A\,\eta\,\Phi\,dt\big)$ | a window of a counting measure (particles, photons, drops) |
| event detector | an event when a guard $g=0$ is crossed | the jumps of a hybrid system; a point process |
| proprioceptive | $y=h(q,\dot q,a)$ | the agent's own worldline and configuration |
| clock | $c(t)=t+b+d\,(t-t_0)+\varepsilon$ | a worldline's proper time against a scale |
| protocol | a hybrid automaton of stages with latencies, ending in a result | a sample taken from the world, prepared and measured |
| quantum | $P(y)=\operatorname{tr}(\rho M_y)$ | a density operator, the state fibre |
| estimator | $\hat y$ from other readings and a model | readings (not the world): its output is assimilated |
| feed | readings delivered by another system; timing and coverage modelled | another system's evidence |

**The parameters of a make.** What distinguishes one make within a family is a set of parameters of its kernel, not a type: the noise (white, random walk, bias instability as read from an Allan deviation, quantisation), the bias and its drift, saturation and range, the bandwidth (a response filter), the latency, the dead time of a counter, the field of view and the point-spread function of a line of sight, its spectral response, the duty cycle of a protocol's stages. The encyclopedia's "individual instruments and methods" are, in this sense, rows of parameters.

## 3. The Encyclopedia, Mapped

Each family of the encyclopedia is given its kernel or kernels, what it reads in the terms of formalism Definition 3.9 (base · fibre), and its state in Cosmopoiesis: the engine's family (model provenance, computed on the domains' models), the server's adapter (physical or archive provenance, an external feed), or *planned*, with what it waits for. A family reading through several kernels has them all; the first is the usual one.

### 3.1 A. Spacetime, Navigation, Geometry and Mechanics

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| A01 | Time and frequency metrology | clock | a worldline · its proper time against a scale | `clock.scales` (the time scales, metrology); `clock.ntp` (the host's clock against NTP, physical) |
| A02 | Position and ranging | ranging | worldlines of emitters · ranges and delays | `gnss.receiver` (GPS and Galileo by SGP4, dilution of precision, σ_UERE = 3 m) |
| A03 | Orientation and attitude | line of sight; point probe | directions of the Sun, stars, the limb; $B$ and $g$ for a compass and an inclinometer | `sun.sensor` (the Sun's direction); `compass.magnetic` (WMM2025, near the ground, refused in the blackout zones); star trackers planned with an agent's attitude |
| A04 | Inertial measurement | proprioceptive | an agent's worldline · specific force, angular rate | planned: an agent's dynamics (slice 2) |
| A05 | Motion and odometry | proprioceptive; line of sight; ranging | an agent's motion; the scene | planned: agents |
| A06 | Contact and force | point probe on a port; event detector | an interface between an agent and the ground · traction | planned: ports (formalism §8.1) |
| A07 | Structural deformation | footprint | a body's region · strain over a gauge length | planned: deformable bodies |
| A08 | Geometry and mapping | ranging over a scan | the scene's surfaces · ranges | planned: the page already casts rays against the terrain |
| A09 | Surface metrology | footprint over a profile | a surface · heights at small scales | planned |

### 3.2 B. Thermal, Fluid, Acoustic and Environmental Physics

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| B01 | Contact thermometry | point probe | a region · temperature (a 0-form) | the temperature of `atmosphere.ussa1976` |
| B02 | Remote thermometry | line of sight | the radiation bundle in the infrared and microwave · radiance | planned |
| B03 | Heat and calorimetry | footprint; protocol | an interface · heat flux (an $(n-1)$-form) | planned |
| B04 | Pressure and vacuum | point probe | a region · pressure | the pressure of `atmosphere.ussa1976` |
| B05 | Flow and velocity | point probe; footprint | a region · velocity | planned: the atmosphere's and the ocean's flows |
| B06 | Turbulence and mixing | point probe at a high rate; estimator | a region · fluctuations; fluxes estimated over a window | planned |
| B07 | Acoustic pressure and sound | point probe | a region · the acoustic pressure of a wave field | planned |
| B08 | Active acoustics | ranging | a region · sound speed and scatterers | planned |
| B09 | Elastic waves and vibration | point probe | a solid region · ground velocity | planned: geophysics' sections |
| B10 | Density and rheology | point probe; protocol | a region · density, viscosity | the density of `atmosphere.ussa1976` |

### 3.3 C. Electromagnetism, Optics and Radiation

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| C01 | Magnetic-field sensing | point probe | a region · $B$ | `magnetometer.wmm2025`; `magnetometer.moon` (the crust from T2015_449, assimilated; synthetic small scales; the solar wind's field); `swpc.imf`, the field at L1 (physical) |
| C02 | Magnetic gradients and material response | point probe of $\nabla B$; protocol | a region · $\nabla B$; a sample · magnetisation | planned: WMM's gradient is computable |
| C03 | Electric fields and charge | point probe | a region · $E$, potential | planned |
| C04 | Electric circuits | point probe on a network | a circuit graph · currents (1-cochains), potentials (0-cochains) | planned |
| C05 | Radio and microwave signals | line of sight with a spectral response | the radiation bundle at radio frequencies | planned |
| C06 | Radar sensing | ranging (with Doppler) | the scene · backscatter | planned |
| C07 | Optical imaging | line of sight, one per pixel | the radiation bundle · radiance | planned as an instrument; the page draws imagery |
| C08 | Optical intensity and polarisation | line of sight | radiance and its Stokes parameters | planned |
| C09 | Optical spectroscopy | line of sight with a spectral response | spectra | planned |
| C10 | Radiative energy | line of sight (a cosine-weighted integral) | the radiation bundle · irradiance | `sun.sensor`: the Sun's irradiance, on the level and normal to it, eclipses by the Earth and the Moon |
| C11 | Ionising radiation | counter | the particles' phase space · flux | `goes.protons` (physical) |
| C12 | Nuclear and particle spectroscopy | counter by energy | the particles' phase space · spectra | planned |

### 3.4 D. Atmospheres, Oceans and Planetary Environments

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| D01 | Atmospheric thermodynamics | point probe; footprint | the atmosphere · pressure, temperature, water vapour | `atmosphere.ussa1976`; `radiosonde.ussa1976`, a column every 500 m with its layers |
| D02 | Wind and turbulence | point probe; ranging | the atmosphere · velocity | planned |
| D03 | Clouds, rain and precipitation | counter; ranging | the atmosphere · condensate, a measure on drop sizes | planned |
| D04 | Aerosols and air quality | counter; line of sight | the atmosphere · a size distribution | planned |
| D05 | Atmospheric trace gases | point probe; line of sight | the atmosphere · mixing ratios | planned |
| D06 | Ocean thermohaline properties | point probe; estimator (salinity from conductivity) | the ocean · temperature, salinity, pressure | planned: oceanography's seawater |
| D07 | Ocean currents and transport | ranging (Doppler over bins); proprioceptive (drifters) | the ocean · velocity | planned |
| D08 | Sea level, waves and tides | point probe; ranging | the sea surface, an interface · its height | planned: the tides bridge |
| D09 | Ocean chemistry | point probe | the ocean · concentrations | planned |
| D10 | Suspended particles and ocean optics | line of sight; counter | the ocean · attenuation, particles | planned |
| D11 | Cryosphere | ranging | ice · thickness, layers | planned |
| D12 | Hydrothermal and seabed environments | point probe; protocol | the seabed, an interface · pressure, heat, fluxes | planned |

### 3.5 E. Solid Earth, Planetary Surfaces and the Subsurface

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| E01 | Seismology | point probe; event detector | the solid region · ground motion; the earthquakes | `usgs.quakes`, the catalogue's events (physical; criticality 3 at M ≥ 7) |
| E02 | Geodetic deformation | ranging; footprint | the surface · displacement | planned: the Earth Atlas's GNSS velocities |
| E03 | Gravity surveys | point probe | a region · $g$, the 1-form $-dU$ | `gravimeter.body`: WGS 84's normal gravity on the Earth, a rotating point mass elsewhere |
| E04 | Magnetic geophysics | point probe | a region · the crust's $B$ | `magnetometer.moon`, the Moon's crust; `magnetometer.wmm2025` gives the Earth's main field only, not its crust |
| E05 | Electrical geophysics | footprint (an inverse problem) | the subsurface · conductivity | planned |
| E06 | Electromagnetic sounding | footprint; protocol | the subsurface · conductivity | planned |
| E07 | Drilling and boreholes | footprint on a curve (a log) | a borehole, a 1-stratum · rock properties | planned |
| E08 | Soil and porous media | point probe | the soil · moisture, pore pressure | planned |
| E09 | Volcanic and geothermal activity | point probe; line of sight; event detector | a region · gas, heat, deformation, tremor | planned |
| E10 | Surface and regolith science | protocol; point probe | the regolith · mechanical, dielectric, thermal properties | planned: the Moon's terrain is in, its regolith is not |

### 3.6 F. Spacecraft, Plasma Physics and Astrophysics

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| F01 | Space plasma particles | counter (over a window of velocities); estimator (the moments) | phase space · $f(x,v)$ | `swpc.wind`: density and bulk speed at L1, the moments of $f$ (physical) |
| F02 | Plasma waves and fields | point probe at a high rate | a region · fluctuations of $E$ and $B$ | `swpc.imf`, the field's minute means at L1 |
| F03 | Energetic particles and space radiation | counter | phase space · flux by energy | `goes.protons` (physical; a radiation storm is an event) |
| F04 | Dust and impact science | counter; event detector | grains' phase space · impacts | planned |
| F05 | Neutral atmosphere and exosphere | point probe; protocol; line of sight | a region · densities of species | planned |
| F06 | Planetary remote sensing | line of sight; ranging; counter | surfaces and the radiation bundle | the terrain's heights are LOLA's laser altimetry (archive); instruments planned |
| F07 | Astronomy and observatories | line of sight | the sky · positions, fluxes, spectra | `sky.bodies`: the bodies' azimuths, elevations and distances |
| F08 | High-energy astronomy | counter | photons · rates, events | `goes.xray`: the Sun's X-ray flux and its flares as events (physical) |
| F09 | Gravitational waves and precision experiments | point probe of a strain | spacetime · the metric's perturbation | planned: a relativistic carrier (formalism §2.4) |
| F10 | Spacecraft health and environment | proprioceptive; point probe | the agent · its own state | planned: agents |

### 3.7 G. Chemistry, Molecular Science and Materials

Almost all of these are protocols: a sample is taken from the world, prepared (ionised, separated, crystallised, cut) and measured, with stages and latencies, as the encyclopedia notes. Their kernel is the protocol, ending in another kernel applied to the prepared sample.

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| G01 | Gas analysis | protocol; point probe | a sample · composition | planned: the molecular science domain |
| G02 | Liquid chemical analysis | point probe; protocol | a sample · activities, concentrations | planned |
| G03 | Molecular spectroscopy | protocol; line of sight | a sample · spectra | planned |
| G04 | Mass and separation analysis | protocol | a sample · masses, isotopes | planned |
| G05 | Atomic and elemental analysis | protocol; line of sight | a sample · elements | planned |
| G06 | Crystallography and structure | line of sight of scattered radiation; estimator | a sample · a structure, reconstructed | planned |
| G07 | Microscopy and nanoscale geometry | line of sight; point probe in a raster | a sample · surfaces | planned |
| G08 | Mechanical materials testing | protocol | a sample · load against deformation | planned |
| G09 | Thermal and phase characterisation | protocol | a sample · heat flow, transitions | planned |
| G10 | Electronic and magnetic materials | point probe; protocol | a sample · transport, polarisation, magnetisation | planned |

### 3.8 H. Biology, Ecology, Physiology and Medicine

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| H01 | Cellular imaging | line of sight | a sample · images | planned |
| H02 | Single-cell and microbial analysis | counter; protocol | a sample · counts, distributions | planned |
| H03 | Biomolecular sensing | protocol | a sample · reads and sequences | planned: the genomics domain simulates reads with their truth |
| H04 | Biological chemistry | point probe | a region or a sample · metabolites | planned |
| H05 | Ecological and biodiversity monitoring | event detector; counter; line of sight | populations, counting measures · presences | planned |
| H06 | Neurophysiology | footprint (a forward model) | a head · potentials and fields of currents | planned: the neuroscience domain's three-shell forward model is this observation operator |
| H07 | Cardiovascular and respiratory physiology | point probe | a body · pressures, flows, potentials | planned |
| H08 | Clinical and anatomical imaging | footprint; protocol; estimator | a body · images, reconstructed maps | planned |
| H09 | Biomechanics and behaviour | proprioceptive; point probe | a body · motion, muscle activity | planned |
| H10 | Environmental biological hazards | protocol | a sample · indicators | planned |

The encyclopedia's caution holds and is structural: an eDNA instrument detects nucleic acid in a sample (a protocol's reading, physical); that a species is near is an estimate from it under assumptions of transport and decay (an estimator's reading, assimilated).

### 3.9 I. Quantum, Atomic and Fundamental Physics

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| I01 | Quantum magnetometry | quantum; point probe (in its classical limit) | a region · $B$ through a spin's state | planned |
| I02 | Atomic precision sensing | quantum; clock | phases and frequencies of atomic states | planned |
| I03 | Single-photon detection | counter; quantum | photons · counts and their statistics | planned |
| I04 | Spin and condensed-matter measurements | protocol; quantum | a sample · spin-resolved spectra | planned |
| I05 | Cryogenic and ultrasensitive detectors | counter | deposits of energy | planned |
| I06 | Neutrino and rare-event detection | counter; event detector | rare interactions | planned |
| I07 | Particle-physics instrumentation | event detector; estimator (tracks) | events and their topology | planned |
| I08 | Quantum-system characterisation | quantum; estimator (tomography) | a density operator · outcomes; a state reconstructed from many | planned: physis's open two-level system gives $\rho(t)$ for a first one |

As the encyclopedia says, a quantum instrument does not read a pre-existing classical value: its kernel is the Born rule, $P(y\mid\rho,M)=\operatorname{tr}(\rho M_y)$, and the state reconstructed from many outcomes is an estimator's reading.

### 3.10 J. Infrastructure, Safety, Computational and Virtual Sensing

| Code | Family | Kernels | Reads (base · fibre) | In Cosmopoiesis |
|---|---|---|---|---|
| J01 | Electrical infrastructure | point probe on a circuit | a circuit graph · voltages, currents, charge | planned |
| J02 | Actuator and propulsion monitoring | proprioceptive | an agent's actuators | planned: agents |
| J03 | Equipment diagnostics | point probe; estimator | an agent's or a structure's state · indicators | planned |
| J04 | Discrete-event detection | event detector | the jumps | `usgs.quakes` and the flares of `goes.xray` publish events; triggers planned with agents |
| J05 | Communications observation | clock; feed | messages · their timing and quality | the runtime measures its own: every sensor's lateness, every job's start and end |
| J06 | Ideal numerical probes | a provenance, not a family: any kernel on the snapshot, model provenance, no noise | the world's fields | `position.truth` |
| J07 | Derived computational probes | estimator on the snapshot | derived quantities and residuals | planned: the balance residuals of formalism §5.5 are such probes |
| J08 | Synthetic and generative sources | a provenance, not a family: any kernel reading a synthetic field | synthetic fields | the page's synthetic terrain, drawn violet |
| J09 | Data-fusion estimators | estimator, provenance assimilated | other readings · inferred states and their uncertainties | planned: the inference foundation |
| J10 | Simulation validation monitors | estimator on the run | the run's own state · residuals, errors, convergence | planned: the runs of slice 0 (the balance residuals of formalism §5.5) |

J06 to J10 are, as the encyclopedia itself says of them, not physical sensors: their readings are labelled by their provenance (model, synthetic, assimilated), never as measurements.

## 4. A Critique of the Encyclopedia

The encyclopedia is broad and its examples are right; as a registry it needs five changes, which this note makes.

1. **Section J mixes instruments with the provenance of readings.** Ideal numerical probes (J06) and synthetic sources (J08) are not instruments but ways a reading comes to be: any kernel, read on the model's snapshot without noise, or on a synthetic field. Data fusion (J09) and derived probes (J07) are the estimator kernel, whose readings are assimilated whatever their inputs were. Kept as families, they would let a modelled value pass for a measured one; kept as provenance, the console colours them apart (formalism Definition 8.7).
2. **A taxonomy by discipline is a view, not the registry's key.** The same instrument appears under several disciplines: magnetometers in C01, E04, F02, G10 and I01; the SQUID in C01 and I01; thermal cameras in B02 and E09; calorimeters in B03 and G09; spectrometers in C09, F06 and G03. The key is the kernel and the quantity read; the disciplines are tags, and a family carries the encyclopedia's code (`catalogue`) as one.
3. **"Principal observables" mix three things:** quantities of the world ($B$, pressure), an instrument's response ("temperature-dependent instrument responses", a thermocouple's voltage), and products ("inferred salinity", an inferred temperature). The family reads the quantity through its response; products are derived afterwards by an estimator or by the data library, with their own provenance.
4. **Not every instrument samples an instant.** The protocols of sections G and H (a mass spectrum, a sequence) are hybrid automata of stages with latencies; the counters of C11, F03 and I05 integrate over windows; a radiosonde's column is a footprint over a path. The kernels say so, and the runtime's timing of a job is its kernel's.
5. **The makes are parameters.** Within a family the listed instruments differ by noise, range, bandwidth, latency and field of view (§2). They are rows of parameters of one kernel, and no class is written for any of them.

## 5. A Critique of the Axes, the Engines and the Envelope

The user's proposal for a C++ architecture of the catalogue has three parts: six independent axes for the registry (K), ten measurement engines to implement first (L), and an envelope common to every observation (M). Each part is close to the design here, and each has one change to make.

### 5.1 The Six Axes

| Axis | Kept as | Why |
|---|---|---|
| physical domain | a tag (the encyclopedia's code) | the same instrument lies in several domains (§4.2); a key must be a function of the instrument |
| measurement support | the kernel's chain, in every reading's envelope | point, line, surface and volume are chains; ray and beam are a cone of directions (line of sight, ranging); a trajectory is the agent's own state; the time interval belongs to every reading, so it is not one value of the axis among others |
| interaction mechanism | each family's interaction: passive, active, contact, destructive, mixed | it is two axes, not one: whether the instrument emits or touches (active, contact) and whether it consumes what it measures (destructive) are independent of each other, and "non-contact" is the complement of contact, not a value beside passive |
| output type | the fibre, sampled on the support | waveform, image, spectrum and point cloud are a fibre over a sampled support (time, directions, frequencies, ranges in many directions), not types of their own; an event is a process (formalism §3.5) |
| acquisition origin | provenance (formalism Definition 8.7) | hardware is physical, a historical record archive, a simulation model, a generative model synthetic, an estimator assimilated |
| temporal behaviour | a family's natural timing; a sensor's timing when mounted | the same magnetometer may be read periodically or on demand: timing belongs to the mounting (formalism §8.6); a long experiment is the protocol kernel |

The proposal is right that not every combination is valid: acoustic pressure in a vacuum has no value. That is coverage (formalism Definition 8.5): an acoustic family's coverage is the fluid regions of the stratification (§1.2), and outside it a reading is *outside*, never zero.

Its unified model, $Y_s=\mathcal H_s[\mathfrak W|_{\mathcal D_s},\Theta_s,U_s]+\varepsilon_s$, is Definition 8.5's with two arguments made explicit: the configuration $\Theta_s$ is the family's parameters and the mount's settings (`MountState::settings`), and the active input $U_s$ is the port of an active instrument. The additive error is one case among several, as the proposal says: the counter's is Poisson and the quantum kernel's is Born's rule. Its other requirement, that observation may change the world, is taken in full. Formalism §8.5's remark gives it its general form, an instrument in the sense of Davies and Lewis: a joint law of the outcome and the state after it. In the world system an active instrument is a component with a port.

### 5.2 The Ten Engines

The engines are close to the kernels, and one of them is not an observation operator at all:

| Engine | Kernels |
|---|---|
| field sampling | point probe, footprint |
| kinematic measurement | proprioceptive |
| ray and beam propagation | line of sight; ranging for lidar and radar |
| wave propagation | *a model of the world, not an instrument*: a microphone is a point probe of pressure; the propagation of sound is acoustics, which every instrument reading that field shares |
| radiation and particles | counter |
| spectroscopic measurement | line of sight with a spectral response; protocol for chemical spectrometers |
| interaction and contact | point probe or footprint with a contact interaction |
| stochastic events | counter, event detector |
| sample analysis | protocol |
| computed observation | estimator; the synthetic and model provenances |

The change is one of placement: wave, radiation and particle propagation belong to the world's models (the domains, physis's fields), so that two instruments reading the same sound or the same light read one field, computed once. An engine that propagated waves for its own sensors would compute that field once for every instrument that reads it. The proposal's levels of fidelity are kept, as parameters of a family (an ideal probe; one with a response, a noise and a bandwidth). Its priorities are met in this slice: field sampling (the magnetometers, the gravimeter, the barometer, the radiosonde), kinematics (the true position), rays (the Sun sensor, the sky) and events (flares, protons, earthquakes, guards). Waves wait for a model of the world to propagate them.

### 5.3 The Envelope

| Field of `ObservationEnvelope` | In a reading |
|---|---|
| sensor, measurement | `sensor`, `measurement` ($k@n$) |
| observation interval, reception time | `interval`; `start_wall`, `end_wall`, `delivered_wall` |
| reference frame, measurement support | `frame`, `support` |
| quantity, payload | the family's quantities with their units; `values` |
| uncertainty | partly: a declared $\sigma$ where a family has one (GNSS's ranging error, WMM's uncertainty of declination); not yet a law for every value |
| provenance | `provenance`, and `provenance_of_parts` where parts differ (the lunar magnetometer's crust, finer scales and solar wind) |
| quality | `quality`: valid, outside, missing, invalid |
| simulation snapshot | `snapshot`, absent for a physical reading |

Added to it: the `interaction`, and the `reason` of every reading that is not valid. The proposal's three cases of absence are the three qualities that are not valid: a physically undefined quantity is *outside*, a missing value *missing*, an invalid measurement *invalid* (formalism Definition 8.9). Like ROS 2's typed messages, the envelope carries a stamp and a frame, and it adds the support, the provenance and the world's snapshot.

## 6. The Classes and the Declared Families

The user asked for classes for as many families as possible, which developers and users could see but which produce no data until they are implemented. The engine has three layers:

1. **`Instrument`** (`engine/observation.hpp`), the abstract sensor: `info()`, `coverage()`, `measure()`, and `kernel()` and `support()`, which name its operator.
2. **Twelve kernel classes**, abstract, one for each operator of §2: `PointProbe`, `Footprint`, `LineOfSight`, `Ranging`, `Counter`, `EventDetector`, `Proprioceptive`, `ClockReading`, `Protocol`, `QuantumMeasurement`, `Estimator`, `Feed`. Each fixes `kernel()` and the kind of chain its readings pair with.
3. **A family with a model** is a final class deriving from its kernel's: the magnetometer of WMM2025 and the compass derive from `PointProbe`, the radiosonde from `Footprint`, the Sun sensor from `LineOfSight`, the GNSS receiver from `Ranging`, the true position from `Proprioceptive`, the time scales from `ClockReading`. The registry refuses a family whose class's kernel is not the one it declares.

The encyclopedia's 101 families are declared beside them (`engine/declared.hpp`, generated by `engine/tools/make_declared.py` from the encyclopedia and from §3 here). Each row gives the code and title, the kernel class a model would derive from, what the family reads, its instruments, its observables, its interaction, its temporal behaviour and its state; the `instruments` operation lists them, and INSTR shows them by section. A declared family without a model is refused when it is mounted ("the family C06 (Radar sensing) is declared, not implemented: planned"). It yields no reading, so no value appears without a model.

*Rationale.* A family is declared as a row of data rather than as an empty abstract class of its own. An empty class says nothing its row does not say, and 101 of them would be 101 places to keep in step with the encyclopedia by hand. A generated table is checked: there are 101 rows, each is bound to one of the twelve classes, each is refused when mounted. It changes when the encyclopedia changes. A developer who writes a family reads its row, derives from the class it names, and gives its `InstrumentInfo` the row's code; the row then counts as implemented and lists the engine's family.

## 7. Adding an Instrument

- **A new make of an existing family** is a parameter set: no code.
- **A new family on an existing kernel** is a final class deriving from that kernel's class, with its `InstrumentInfo` (its key, its title, its encyclopedia code, its kernel, its provenance, its quantities with units, its cost, its default period, its model, its references), its coverage, and its `measure()`, the function from a snapshot and a mount to a reading, which calls the domain whose model it reads (`engine/instruments.hpp`, `engine/environment.hpp`, `engine/lunar.hpp`). A physical source is an adapter of the server (`runtime.py`). Outside its coverage a reading says why. Where its model's data are absent it is *missing*, and where its operator is ill-posed *invalid*.
- **A new kernel** is warranted only when the observation operator differs from all twelve. It is a decision, recorded.

Every family is checked against its model's reference (the domain's own checks hold the model; Cosmopoiesis's hold the plumbing: instants, units, coverage, determinism; [tests/check_runtime.py](../tests/check_runtime.py)). The Moon's magnetometer is held to pyshtools on the same model ([tests/make_fixtures.py](../tests/make_fixtures.py)).

## 8. Open Questions

- **A sixth provenance.** SWPC's planetary $K$ index is derived from ground magnetometers by a fixed method, without a model of the world: neither a direct measurement nor an assimilation. It is counted as physical; a class *derived* may be needed.
- **Physical instruments of the user's own.** The observation edge's stations (`observation/sensors`) arrive as one adapter; each station's instruments should become sensors of their own families, with their makes' parameters.
- **An uncertainty for every reading.** A declared $\sigma$ is carried where a family has one. The envelope should carry a law (a covariance in the quantity's units, or samples) for every value, and estimators should consume it.
- **Back-action.** No instrument of this slice acts on the world. The first active family (a radar, a laser altimeter) needs the world system's ports (formalism §5.4) and a field to emit into.
- **Where the kernels belong.** The twelve kernels name no object in nature. If a second work needs them (the Earth Atlas's observations, the Brain Atlas's forward models), they belong in a foundation, with the registry in the observation edge.
