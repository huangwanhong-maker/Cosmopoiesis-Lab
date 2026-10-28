# 0004. Instruments and Their Acquisition: Kernels of Observation, a Mission Clock, and a Runtime with Deadlines

- **Status:** Accepted, provisionally (the timing is measured, not guaranteed: no real-time kernel class is used; agents' instruments wait for agents); §2.1 amended by [0005](0005-fields-known-in-part-and-declared-instruments.md): twelve kernel classes and the encyclopedia's families declared, and the kernel's classes asked for
- **Date:** 2026-10-28
- **Decided by:** the user: "we can abstract a Sensor class, and various data should get from sensors when clock ticks (clock tick period is predefined)", from "physical sensor/device, or simulated algorithm etc (i.e., virtual sensors)", each with "its physical property, and available spacetime range"; with a real-time design, "priority queue, parallel acquisition, batch acquisition, sensor positive events … as some emergent events should not wait for clock ticks", "no confliction, safety", and caution about the starvation (饥饿问题) of a priority queue that lets jobs jump ahead (插队); with "someone's idea, but not necessary fully trust it, be criticalism" (a design of a two-layer scheduler); with a classification of physical phenomena to criticise; and with an encyclopedia of instruments: "They may inherit the sensor class? I not sure, believe yourself." Claude designed and wrote it. The general methods are calx's ([decision 0009](https://github.com/huangwanhong-maker/calx/blob/main/development/decisions/0009-real-time-scheduling.md)); the composition is the infrastructure's [ADR 0050](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0050-instruments-and-their-acquisition.md).

## 1. Context

Formalism §8.2 defined one sensor as an observation operator with a footprint, a latency, a clock and keyed noise. Slice S had no sensors: its panels asked the engine for what they showed. The user asked for the world's data to come from instruments, physical and virtual alike, read at the ticks of a clock and on events, scheduled as real-time systems are, and coloured by where their values come from.

## 2. Decision

### 2.1 Instruments Are Kernels with Parameters

An instrument is a family of one of twelve kernels of observation (formalism §8.5, Table 8.1): point probe, footprint, line of sight, ranging, counter, event detector, proprioceptive, clock, protocol, quantum, estimator and feed. A family binds its kernel to a domain's model, with its quantities and units, a declared cost and a coverage, the part of spacetime where it can read; a sensor is a family mounted on an address, on the observer or on a satellite, with a timing. Outside its coverage a sensor answers why it cannot read, never with a value. Every reading names its provenance: physical, archive, model, assimilated or synthetic (Definition 8.7).

There is no class per instrument. The encyclopedia's hundreds of makes are parameter sets of its ninety families, and its families are mapped onto the twelve kernels in [instruments.md](../../docs/instruments.md), which also criticises it: section J's numerical, synthetic and fused "instruments" are provenances and the estimator kernel, not instruments; a taxonomy by discipline is a view, not a key; observables mix quantities, responses and products. The first families are the engine's nine: the time scales, the true position, a Sun sensor and radiometer, the bodies in the sky, a GNSS receiver, a gravimeter, a magnetometer (WMM2025), a barometer and thermometer, and a radiosonde (the 1976 standard atmosphere). With them come the server's ten physical sources: the host's clock against NTP, the solar wind and the interplanetary field at L1, the $K$ index, GOES's X-rays and protons, USGS's earthquakes, the user's own stations, and the terrain beneath the observer.

### 2.2 Phenomena on Three Axes

The classification the user offered (material domains, continuous fields, distribution functions, discrete objects, interactions and events) is replaced by three independent axes, base, fibre and process (formalism §3.5, Definition 3.9). Its rows answered different questions: a distribution function is a field on phase space, and an event is a morphism, not an object. The axes are what an instrument's kernel pairs with: a point, a weighted chain, a cone of directions, a window of a counting measure, the jumps, a state.

### 2.3 The Mission Clock

The server holds the world's clock (`runtime.py`): TT at a wall instant, a rate (any real; held at 0) and whether it runs. Every page and every virtual instrument reads it; a page extrapolates it and estimates the server's wall from each answer's round trip, as NTP does. Physical sources tick on the wall's clock, virtual instruments on the world's, so that a run at a day a second is sensed at the world's ticks while the feeds are polled at their own pace.

### 2.4 The Runtime

The engine holds an acquisition session (`engine/acquisition.hpp`), and the server steps it every 0.25 s:

- **Releases.** A sensor is released once at the latest tick of its clock; the ticks passed over are counted as skipped, and a newer release supersedes an older one still waiting.
- **Events.** Events (a flare, an earthquake) are published at once and may trigger sensors out of their ticks.
- **Admission and degradation.** The declared set is admitted by EDF's demand test at the clock's rate, and above a target utilisation the less critical sensors' periods are stretched by elastic compression: safety rigid, mission stiff, science and display supple.
- **Dispatch.** Jobs are dispatched without preemption on a pool of workers, in the session's policy: EDF, fixed priorities by criticality with or without aging, or FIFO; within a budget of work per step.
- **Physical sources.** Feeds are planned by the engine and run by the server's I/O workers within a constant bandwidth server, so that a storm of events cannot take the periodic sensing's share.
- **Determinism.** All instruments reading one instant read one snapshot of the world, which computes what they share once, and their noise is keyed by the seed, the sensor and the tick. The readings are therefore the same under any order, any number of threads and any wall clock (formalism Proposition 8.6); the timing is measured, and each sensor's lateness is counted.

The general methods (the task model, the analyses, the servers, elastic compression, the simulation and the dispatcher) are calx's `scheduler/realtime.hpp` (calx decision 0009); the runtime composes them.

### 2.5 The Pages

INSTR lists the mounted sensors, their kernels, coverage and counters, and mounts a family on the observer, the ISS or an address. SCHED shows the policy, the admission, the jobs on each worker as they ran over the last five seconds, the servers, and a deterministic simulation of the declared set under each policy, with a burst of events if asked. BUS and ENV are 0003's.

## 3. Alternatives Considered

The pasted design of a scheduler was read in full; its sound parts are kept, and the rest is answered here.

- **Two layers, the kernel's real-time scheduler beneath a scientific one.** Agreed: the kernel schedules threads and cannot see the jobs inside one. The kernel's classes (`SCHED_DEADLINE`, `SCHED_FIFO`, `PREEMPT_RT`) are not used yet: the development machine runs Windows, and they need privileges. A backend mapping the servers to `SCHED_DEADLINE` reservations is planned in calx.
- **A utility $U_i=w_qQ_i+w_aA_i+w_u\Delta H_i-w_cC_i$, maximised at each step under budgets.** Rejected as the dispatcher's order, for four reasons:
  - Its terms have different units, so the weights are conversions of units in disguise, and the optimum depends on them.
  - Selecting a subset under budgets at each step is a knapsack problem, NP-hard in general, so in practice it would be a greedy rule without a guarantee.
  - It cannot be analysed for deadlines, so what must be met needs a guarantee elsewhere in any case, as the proposal itself concedes for safety.
  - Its terms have principled forms in other theories: the expected information of an observation (Lindley 1956; Chaloner and Verdinelli 1995) and the age of information (Kaul, Yates and Gruteser 2012).

  Choosing what to observe, and how often, is experimental design. It belongs to a planner that declares the sensors' periods and criticalities at the pace of the science; the inference foundation, when it is written, is its place. Kept from it: criticality, and elastic compression, an optimisation with a stated objective and a closed-form solution.
- **Shared evaluation of fields from an immutable snapshot, batched.** Adopted: the snapshot computes what its instruments share once (the Sun's place, a constellation's states). The batch is a step's set of releases, so no job ever waits for a batch to fill; the proposal's own caution, a maximum wait for a batch, is here a wait of zero.
- **A pluggable `SchedulingPolicy::plan(RuntimeState) → SchedulingDecision`.** Narrowed. A policy is an order of the ready jobs, and release, admission and degradation are separate mechanisms, each with a theorem. An interface that may return any decision can be neither checked nor compared; an order can be simulated, and SCHED compares the policies so.
- **Execution backends, among them a deterministic simulation.** Kept as two, calx's `dispatch` on threads and `simulate` in logical time, with a backend on a real-time kernel planned. The determinism of values does not need a deterministic backend: by Proposition 8.6 the readings are a function of the world, the seed, the sensor and the tick under any backend, which is more than deterministic merge rules give.
- **Dependency graphs and work stealing.** Deferred: the present instruments have no dependencies. calx's task graphs (its decision 0006) are there for when they do, as when an estimator reads other readings.
- **A fair-share policy.** Given by the constant bandwidth servers: a share per class of work, guaranteed and bounded.
- **`sched_ext`.** Not pursued, as the proposal also concluded.
- **A class per instrument, inheriting a `Sensor` class.** Rejected (§2.1): the class would follow the device's make, and a hundred classes would share twelve operators.
- **A priority queue that lets urgent jobs jump ahead, without more.** Rejected: under fixed priorities a stream of urgent jobs starves the rest. Aging bounds the wait, and servers bound the stream (formalism Proposition 8.8); calx's checks show both, and show the starvation without them.
- **Polling every sensor at every step.** Rejected for the reason the user gave: delay for the sensors at the end of the queue, and work for sensors whose tick has not come.

## 4. Consequences

- The engine gains `observation.hpp` (kernels, provenance, coverage, snapshots, keyed noise), `instruments.hpp` and `environment.hpp` (the nine families) and `acquisition.hpp` (the session), and the operations `instruments` and `acquire.configure`, `acquire.step`, `acquire.describe` and `acquire.analyse`.
- The server gains `runtime.py`: the mission clock, the bus, the physical sources and the acquisition loop. It also gains the endpoints `/api/clock`, `/api/bus`, `/api/bus/latest`, `/api/acquisition` (with its trace and its analysis) and `/api/instruments`. Changes to the acquisition are refused on a public host.
- The domains gained the models the instruments read (ADR 0050): geophysics' WMM2025, meteorology's 1976 standard atmosphere, geodesy's normal gravity. The data library gained the WMM coefficients and SWPC's feeds.
- The formalism gains §3.5 (the kinds of phenomena), §8.5 (instruments as kernels) and §8.6 (the timing of acquisition), with their checks in §12. `docs/instruments.md` maps the encyclopedia.
- The checks: `tests/check_runtime.py` holds the mission clock's time scales and commands, the bus, a session's releases and skips, the instruments' readings against closed forms, its determinism and its policies; calx's `check_realtime` holds the scheduling.
- Open: a sixth provenance, *derived*, for indices computed from observations without a model, such as the $K$ index; families for each instrument of the user's own stations; and, if a second work needs them, the kernels moved to a foundation, with their registry in the observation edge.
