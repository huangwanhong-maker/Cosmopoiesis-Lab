# 0008. A Body That Senses, and a Mission That Learns

- **Status:** Accepted, provisionally (one rover on the Moon's reference sphere, one instrument, a Gaussian knowledge; no terrain, no estimation of the rover's own pose)
- **Date:** 2026-10-29
- **Decided by:** the user. After the unified fields, they asked for "physical agent(s) building and rendering, simulation", agents not distinguished "from other physical objects". Each robot has "its local spacetime coordination", with its own dynamics and field representation coupled at the global coordinate system. The world is "gaussed/assimilated" while "robot can provide us new info": "We like a god!", a "triple-relation". They also asked whether dynamics should come from an action, whether a path integral is needed, and for "different dynamics system, and even can translate between them". A discussion with another assistant was read critically. Its embodied agents, triple relation, rover experiment with a hidden synthetic field, and fidelities with their translation were kept. Its symbolic variation of actions, its general solver framework, and its seven-slice reordering were not. The user then added "you may add a domain robotics, if needed". Claude wrote this and the work it records. The infrastructure's record is [ADR 0054](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0054-bodies-dynamics-and-knowledge.md).

## 1. Context

The formalism already held agents (Definition 8.1): a configuration, a hybrid model, ports, sensors, actuators, a clock and a controller, with no physical privilege. It also held a field known in part (§8.7). It did not yet say three things:
- what an agent knows, and how a reading changes it;
- how the truth of a world, a body in it and the knowledge of a mission stand to one another;
- how one body is modelled at more than one fidelity.

The engine had instruments that read the world, but no body that moved through it and learnt.

## 2. Decision

### 2.1 The Triple Relation (Formalism §8.8)

A world, the bodies in it, and what is known of the world are three things, kept apart:
- **the world** holds the truth;
- **a body** reads it only through its instruments, at the places its motion brings it to;
- **the knowledge** is a field of distributions, held by an agent or a mission, changed only by delivered readings.

A god's view, the page's *Reveal*, shows the truth beside the knowledge. The knowledge never reads it. When the truth is a draw from the knowledge's prior, the posterior is calibrated by construction (Proposition 8.14). That is the test of an inference engine without real data: a hidden synthetic truth, then discovery by the body.

### 2.2 The First Mission (`engine/mission.hpp`)

- **The world.** The Moon's crust is T2015_449 and a hidden realisation of its unresolved part to degree 1440, from the law of its spectrum and a seed. It is the planetary-science domain's draw, the same as the synthetic layer's.
- **The body.** A rover of the robotics domain on the Moon's reference sphere, kinematic or dynamic. Its controller is the waypoint follower. Its plan is a lawnmower, or adaptive: each next place is chosen where the field is least known. Its magnetometer sits on a mast, reading the truth in its own axes with white noise drawn by index.
- **The knowledge.** Gaussian. Its prior is the truth's own law: mean T2015_449, covariance physis's `PotentialCovariance` of the unresolved spectrum, tabulated at the mast's height. It is conditioned by tyche's `spatial`, three scalar observations a reading, extended by a row of the Cholesky factor each.
- **The ops.**
  - `mission.start`, `mission.step`, `mission.state`, `mission.map` and `mission.stop`: a mission kept by the serving engine and stepped by its own clock;
  - `mission.run`: a whole mission in one request;
  - `mission.calibrate`: one mission run over many truths, its posterior's z pooled.

### 2.3 Two Fidelities and Their Translation

The rover is the robotics domain's vehicle at either fidelity under one command interface:
- the kinematic unicycle, exact for a constant speed;
- the dynamic mass held to the sphere by RATTLE, with its wheels' speed loop and the ground's Coulomb friction solved exactly.

Its state translates exactly between them, and the dynamic vehicle lags the kinematic one by its loop's $v^*(\tau - h)$. The mission chooses the fidelity, and the readings, the knowledge and the plan are the same code for both. This is the first case of the user's "translate between them". A framework of fidelities waits for a second case.

### 2.4 The Page: ROVER

A page of the science deck shows the three parts apart:
- the body: where it is, its plan, its track and its readings, with its motion's numbers;
- the knowledge: the posterior's mean or its uncertainty, with the prior on the same scale, and its whitened innovations against their band;
- the world, revealed: the truth, the error, the z, and their calibration.

A key runs the calibration over twenty truths. The map is the engine's grid read bilinearly (`src/mission.js`).

### 2.5 Dynamics from an Action

How a body moves is stated as a Lagrangian and integrated as the stationary path of a discrete action (physis decision 0013). A path integral is the same action, its time imaginary. It is not needed for the classical motion, and it is there, in physis `field_theory`, for the quantum statistics. Rigid bodies move by physis's Lie group variational integrator. The rover's chassis will, when its terrain and contact are written.

## 3. Alternatives Considered

- **The discussion's seven-slice reordering, and its package layout.** Not taken: the architecture's slices stand (§9), and this mission is a slice of its own, R, placed where its foundations were ready first.
- **A rover drawn in the three-dimensional world.** Not yet. It drives on the reference sphere, which on the maria lies a kilometre or two above the terrain. Drawn there it would float. It is drawn on the mission's map until it follows the terrain.
- **Particles or ensembles for the knowledge.** Unnecessary for a Gaussian field observed linearly: the conditioning is exact. They wait for a nonlinear instrument or a non-Gaussian law (tyche's planned `assimilation`).
- **A knowledge model in a foundation.** Not yet. The composition of a field's covariance, the conditioning, and a body's readings is written once, here. It moves down when a second work needs it.

## 4. Consequences

- 26 checks in `tests/run-tests.mjs`:
  - the page's arithmetic;
  - a survey at both fidelities and by both plans: its readings, its innovations within their band, the truth hidden until revealed, the posterior's error below the prior's, the ground's force;
  - an unknown plan and a mission never started refused;
  - over 24 truths, the posterior's z with rms 0.98 and coverage 96%.
- Findings:
  - The law fitted to T2015 puts the sources at an effective 6.6 km, and its unresolved power peaks at degree 450 (24 km).
  - A kilometre's survey therefore sees a smooth field and its gradients, which T2015's regularisation lost. At Reiner Gamma T2015 alone misses $|B|$ by about 4 nT rms over the survey, and the mission by 0.3 nT.
  - Scales of a rover's own need shallower sources than the law gives. This is an open question.
- Open:
  - terrain following;
  - the rover's estimation of its own pose;
  - the solar wind's field in the readings;
  - a non-stationary prior (the anomalies cluster);
  - several bodies sharing one knowledge;
  - the agent loop moved to the robotics domain.
