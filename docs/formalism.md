---
title: The Formalism of Cosmopoiesis
status: draft
date: 2026-10-28
implemented-by: []          # nothing yet; the engine's headers cite the numbered results below as they implement them
references: see §14
---

# The Formalism of Cosmopoiesis

*Status: draft, 2026-10-28.* This note states what a world is, mathematically, for Cosmopoiesis: a work of [The Science Infrastructures](https://github.com/huangwanhong-maker/The-Science-Infrastructures) that constructs heterogeneous physical worlds and simulates them with the agents that inhabit them. It fixes definitions, states the results the engine relies on with their proofs or citations, and names, for each object, the library of the infrastructure that computes it. The architecture that realises it is [architecture.md](architecture.md).

The philosophy is that of theoretical physics and of algebraic geometry, and it is kept from the preliminary design (decision [0001](../development/decisions/0001-the-founding-of-cosmopoiesis.md)): **a world is a field configuration on a space with a geometry; its laws are actions or balance laws; its symmetries are groupoids and groups acting on it; its shapes are given by equations, not by samples; and the space itself may be the sample of a field theory.** What this note adds to the preliminary design is structure: the world is a sheaf on a site of regions, coupling is a fibre product over interfaces, conservation across an interface is a theorem of the discrete construction, mechanisms are real algebraic varieties, and observables are invariants.

## 0. Conventions

The conventions are those of the infrastructure and of physis ([physis glossary](https://github.com/huangwanhong-maker/physis/blob/main/docs/glossary.md)), stated once here and never varied:

- **Units.** SI internally, radians for angles; the physical dimensions form the free abelian group $\mathbb D\cong\mathbb Z^7$ over the SI base units (physis `units`). A quantity at an interface carries its unit; inside the engine every value is in SI.
- **Time.** A time value states its scale (TT, TDB, TAI, UTC, UT1 of the metrology domain; or a synthetic epoch, declared) and its representation (two-part Julian Date, or seconds from the epoch).
- **Frames.** Every coordinate names its frame; transformations are explicit morphisms (§2). Rotations are active and right-handed; longitude is positive eastward; azimuth is measured clockwise from north.
- **Signature** $(-,+,+,+)$ for Lorentzian carriers, $x^0 = ct$ first; the curvature conventions of Misner, Thorne and Wheeler, as physis `geometry` has them.
- **Orientation.** A cell complex is oriented once; the boundary operator $\partial$ and the coboundary $d=\partial^{\mathsf T}$ follow morphe `topology` and physis `discretisation`; the holonomy of a 2-cell is the product of its links along its attaching word; gauge transformations act by $U_e\mapsto g_{\mathrm{tail}}\,U_e\,g_{\mathrm{head}}^{-1}$.
- **Spins** are passed as $2j$ (physis `symmetry`), where a generated carrier (§11) carries them.

## 1. The Carrier of a World

### 1.1 Spaces and Charts

**Definition 1.1 (carrier).** A *carrier* is a pair $(M,g)$: $M$ a smooth manifold with corners, $g$ a metric on it. Two cases are used.

- **Newtonian.** $M$ is a Riemannian manifold of dimension $n\in\{1,2,3\}$ (space), time is an interval $I\subset\mathbb R$ of a declared coordinate time, and the spacetime of the world is the product $M\times I$ with $g$ the spatial metric. Flat space is $g=\delta$ (physis `Euclidean<3>`); the sphere and the ellipsoid carry their induced metrics; a terrain is a graph over a chart.
- **Relativistic.** $M$ is a Lorentzian manifold of dimension $n+1$ with a metric field in a chart from physis `spacetime` (Minkowski, Schwarzschild, Kerr, FLRW, de Sitter), and a time function foliates the region of interest, $M\simeq\bigcup_t\Sigma_t$.

A carrier is presented by an **atlas** $\{(U_\alpha,\varphi_\alpha)\}$ of charts with explicit transition maps, as physis's geometry writes metrics in charts. Coordinates are never a field: a field assigns a value to a point, and the chart assigns coordinates to it.

### 1.2 Regions, Interfaces and the Stratification

**Definition 1.2 (regions and interfaces).** A *decomposition* of $M$ is a finite family of closed regions $\{\Omega_i\}_{i\in R}$ with disjoint interiors whose union is $M$. The *interface* $\Gamma_{ij}=\Omega_i\cap\Omega_j$ is a closed subset of codimension at least one; those of codimension exactly one are where fluxes cross. The interiors of the regions, the interiors of the codimension-one interfaces, and the corners where several meet stratify $M$.

A world may also carry **worldlines**: strata of dimension zero in space (a point moving in time), on which bodies and agents live (§8). Their state is a section over the stratum, not over an open set.

*Remark.* "Heterogeneous" means that different regions carry different fields and different laws: an ocean, the air above it and the sea floor beneath it. The interfaces are where they meet, and §5 says how.

### 1.3 Cellulations

**Definition 1.3 (cellulation).** A *cellulation* of a decomposed carrier is a regular CW complex $K$ (morphe `topology`, `CWComplex`) with a homeomorphism $|K|\to M$ such that every region and every interface is the realisation of a subcomplex, together with a **geometry**: the position of every vertex in a chart (the realisation is then piecewise linear, or curved by the chart), or the squared length of every edge (Regge geometry, physis `spacetime/regge.hpp`), from which volumes, dual volumes and Hodge stars follow (§3.4).

The cellulations used are products of intervals (morphe `product`; a box lattice with boundary), triangulations of the sphere (physis `computational_geometry`, the spherical Delaunay triangulation of points) and of surfaces, prisms over them for shells (a sphere times an interval), terrains over a triangulation of a chart, and the gluing of any of these along a shared subcomplex (§3.3). A cellulation is an approximation of the carrier with a declared error; the carrier is the object.

## 2. Frames and Time

### 2.1 The Frame Groupoid

**Definition 2.1 (frame groupoid).** The *frames* of a Newtonian world are the objects of a groupoid $\mathfrak F$: a frame is an origin and an orthonormal basis of $\mathbb R^3$ (a tetrad, in a Lorentzian carrier). A morphism $f\to f'$ is a smooth map $I\to E(3)$, $t\mapsto(R(t),b(t))$ with $R(t)\in SO(3)$ and $b(t)\in\mathbb R^3$, read as $x'=R\,x+b$ for the coordinates of one point in the two frames; composition is pointwise, and every morphism is invertible. A world declares a **root frame** $f_0$, in which its fields are stored; every other frame is given by its morphism to $f_0$.

The morphisms come from the domains: between the celestial and terrestrial frames (ICRS, GCRS, ITRS) from metrology `frames` and the Earth-orientation data; between a planet's body-fixed frame and the celestial frame from the IAU rotation models of astronomy `rotation`; between a local horizon frame (east, north, up) and a body-fixed frame from geodesy; between a body's frame and its parent's from the dynamics of the body itself (§8). Rotations are elements of $SO(3)$ represented as unit quaternions, physis `symmetry`'s $SU(2)$, through the double cover $R(U)_{ij}=\tfrac12\operatorname{tr}(\sigma_iU\sigma_jU^\dagger)$.

### 2.2 Kinematics of a Frame Change

**Proposition 2.2.** Under the morphism $x'=R(t)x+b(t)$, with $\dot R=[\omega]_\times R$ for the angular velocity $\omega(t)$ of $f$ relative to $f'$ expressed in $f'$, the velocity and acceleration of a point transform as
$$
v' = R\,v+\omega\times(Rx)+\dot b,\qquad
a' = R\,a+2\,\omega\times(Rv)+\dot\omega\times(Rx)+\omega\times(\omega\times Rx)+\ddot b .
$$
*Proof.* Differentiate $x'=Rx+b$ twice, using $\dot R=[\omega]_\times R$ and $\ddot R=[\dot\omega]_\times R+[\omega]_\times^2R$. $\square$

The terms beyond $Rv$ and $Ra$ are the kinematic terms: a vector is not a position, and a frame change acts on velocities by more than the rotation. A frame-covariant quantity transforms by the representation of its type: a position by the affine action, a velocity by Proposition 2.2, a free vector (a force) by $R$ alone, a scalar not at all.

### 2.3 Time Scales and Clocks

Coordinate time $t$ is one scale of the metrology domain, declared by the world, or a synthetic epoch for a constructed world that is mapped to no calendar. A **clock** is a map $c$ from coordinate time to readings, with a rate and an offset and, where modelled, a drift: a reading is not a time, and the agents of §8 stamp their measurements with readings. In a relativistic carrier the proper time along a timelike worldline $x(\lambda)$ is $\tau=\int\sqrt{-g(\dot x,\dot x)}\,d\lambda/c$ (physis `spacetime/minkowski.hpp` for flat space, `geometry/geodesic.hpp` along geodesics), and an ideal clock reads it.

### 2.4 Relativistic Carriers

A world on an exact spacetime of physis (a star's neighbourhood, a cosmological patch) has no absolute time; its frames are tetrads along worldlines, and its "frame morphisms" are the Lorentz transformations of physis `symmetry/lorentz.hpp` between them, composed with parallel transport along the connection of $g$. Fields on it are sections as in §3, with $d$ the exterior derivative on spacetime. The first worlds are Newtonian; the definitions are written so that the relativistic case changes the carrier and not the formalism.

## 3. Fields

### 3.1 Bundles with Units

**Definition 3.1 (quantity-valued bundle).** For a dimension $\delta\in\mathbb D$, let $\mathbb R_\delta$ be the one-dimensional real vector space of quantities of dimension $\delta$; a unit is a basis vector of it, and the SI unit is the one chosen. A *quantity-valued vector bundle* is a vector bundle $E\to M$ together with a dimension $\delta$; its sections take values in $E\otimes\mathbb R_\delta$. Tensor products add dimensions; sums require equal dimensions; a map between bundles (a constitutive relation, §4) has a dimension of its own.

Positions in space, instants in time and absolute temperatures are not vectors but points of torsors; their differences are vectors (displacements, durations, temperature differences). The engine's types keep the distinction, as physis's quantities do at the boundary.

### 3.2 Kinds of Field

A field of the world is a section of a quantity-valued bundle over a stratum, of one of these kinds:

| Kind | Object | Example |
|---|---|---|
| $k$-form | $\omega\in\Omega^k(\Omega_i)\otimes\mathbb R_\delta$ | $k=0$: temperature, pressure, a potential; $k=1$: a circulation, a connection's component; $k=n-1$: a flux; $k=n$: a density (mass, energy, charge per volume) |
| vector, tensor | sections of $TM$, $T^*M$, $\otimes$ | velocity (identified with a 1-form by $g$), stress, strain, conductivity |
| $G$-connection | a connection on a principal $G$-bundle; on $K$, a $G$-valued 1-cochain with its holonomy on 2-cells | the electromagnetic potential ($U(1)$), a lattice gauge field (physis `gauge`) |
| label | a section with values in a finite set $\Lambda$ | material occupancy (rock, water, air, void), phase, land cover |
| worldline state | a section over a 0-dimensional stratum, valued in a configuration manifold $Q$ | a body's pose in $SE(3)$, an agent's joint angles, its memory |

A field is **physically defined** only on the material region it belongs to: salinity on the water, stress on the solid. Its support is that region, and a query elsewhere has no value, as opposed to the value zero.

### 3.3 Fields as a Sheaf; Composition by Gluing

**Definition 3.3 (the sheaf of fields).** For a kind of field and an open set $U\subseteq M$, let $\mathcal F(U)$ be its sections over $U$, with the restriction maps $\mathcal F(U)\to\mathcal F(V)$ for $V\subseteq U$. This is a sheaf on $M$: for every open cover $\{U_\alpha\}$ of $U$ and sections $s_\alpha\in\mathcal F(U_\alpha)$ agreeing on every $U_\alpha\cap U_\beta$ there is exactly one $s\in\mathcal F(U)$ restricting to each $s_\alpha$ (Mac Lane and Moerdijk 1992, ch. II).

The regions of §1.2 are closed and meet in interfaces, not in open overlaps, so the gluing of fields over regions is along **traces**. For a $k$-form $\omega_i$ on $\Omega_i$ the trace on $\Gamma_{ij}$ is the pull-back $\operatorname{tr}\omega_i=\iota^*\omega_i$ along the inclusion $\iota\colon\Gamma_{ij}\to\Omega_i$ (the tangential part).

**Proposition 3.4 (gluing along interfaces).** Let $\omega_i\in H\Omega^k(\Omega_i)$ be forms on the regions of a decomposition whose tangential traces agree on every codimension-one interface. Then the piecewise form $\omega$ equal to $\omega_i$ on each $\Omega_i$ lies in $H\Omega^k(M)=\{\omega\in L^2\Omega^k:\ d\omega\in L^2\}$, and $d\omega$ is the piecewise exterior derivative, with no term on the interfaces.

*Proof.* Arnold, Falk and Winther (2006, §5.1, Theorem 5.3): the tangential trace is the only condition for a piecewise smooth form to belong to $H\Omega^k$. $\square$

This is what "a heterogeneous world is one world" means: the ocean's and the atmosphere's fields are one field on $M$ exactly when their traces match on the sea surface, and matching of tangential traces is the condition. An interface condition that is not continuity (a jump, a flux balance, a Robin law) is stated as a relation $C_{ij}(\operatorname{tr}\omega_i,\operatorname{tr}\omega_j)=0$ and is part of the world's model (§5.4).

### 3.4 Cochains: the Discrete Field

**Definition 3.5 (cochains and the de Rham map).** On a cellulation $K$ with its orientation, a $k$-cochain with values in $\mathbb R_\delta$ is $c\in C^k(K;\mathbb R_\delta)$, one quantity per $k$-cell. The *de Rham map* $\mathcal R\colon\Omega^k\to C^k$ integrates a form over each cell, $(\mathcal R\omega)(\sigma)=\int_\sigma\omega$. The coboundary is $d=\partial^{\mathsf T}$: $(d_0\phi)(e)=\phi(\mathrm{head})-\phi(\mathrm{tail})$, $(d_1\alpha)(f)=\sum_{e\in\partial f}\pm\alpha(e)$ along the attaching word, and so on (physis `discretisation/cochains.hpp`).

**Proposition 3.6 (exactness of the discrete calculus).** $d\circ d=0$, and $\mathcal R\,d=d\,\mathcal R$ (Stokes's theorem), both exactly, on every CW complex.

*Proof.* $\partial\circ\partial=0$ for the cellular boundary (morphe `validate` checks it on each complex), so $d\circ d=(\partial\partial)^{\mathsf T}=0$; and $\int_\sigma d\omega=\int_{\partial\sigma}\omega$ is Stokes's theorem on each cell (Desbrun, Hirani, Leok and Marsden 2005, §3). $\square$

The *Whitney map* $\mathcal W\colon C^k\to\Omega^k$ interpolates a cochain by piecewise-linear forms on a simplicial $K$, with $\mathcal R\mathcal W=\mathrm{id}$ and $d\mathcal W=\mathcal W d$ (Whitney 1957; Arnold, Falk and Winther 2006, §3); it is how a cochain is sampled at a point (§8.2) and transferred to another cellulation (§6.3).

**Definition 3.7 (Hodge star and Laplacian).** A *Hodge star* $\star\colon C^k(K)\to C^{n-k}(K^\star)$ onto the dual complex is a positive diagonal operator in the first instance (the ratio of dual to primal volumes; physis `Weights`), and the circumcentric star of a well-centred simplicial complex when it is written (physis's open question). It gives the inner product $\langle a,b\rangle=a^{\mathsf T}\star b$, the codifferential $\delta=\pm\star^{-1}d\star$ and the Laplacian $\Delta=d\delta+\delta d$.

**Proposition 3.8 (Hodge decomposition).** $C^1(K)=d\,C^0\oplus\delta\,C^2\oplus\mathcal H^1$, orthogonally, with $\dim\mathcal H^1=b_1(K;\mathbb R)$ (Eckmann 1944; Lim 2020); physis `discretisation/hodge.hpp` computes it, dense or by conjugate gradients, and the same decomposition of a flow with conductances (`flow_decomposition`).

*Remark (incompressible flow).* A velocity whose flux cochain $F\in C^{n-1}$ satisfies $dF=0$ (no divergence) is $\delta\gamma+h$: the projection of a velocity onto the divergence-free fields, the Helmholtz projection of every incompressible fluid solver, is this decomposition; the harmonic part carries the circulation round the holes of the region, the islands of an ocean basin ([the idea of meshes as cell complexes](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/ideas/2026-10-21-meshes-as-cell-complexes.md)).

## 4. Matter and Constitution

**Definition 4.1 (occupancy and constitution).** The *occupancy* of a world is a label field $\lambda$ with values in its finite set of materials; the material region of $m$ is $\Omega_m=\lambda^{-1}(m)$, and the regions of §1.2 are unions of material regions. A *constitutive relation* of a material is a map of quantity-valued bundles, with parameters $\theta\in\Theta$:
$$
J=\mathcal C_\theta(u,\,du,\,\ldots),\qquad\text{e.g.}\quad J=-k\star dT,\quad \sigma=\mathbb C:\varepsilon,\quad \rho=\rho(p,T,S).
$$
The general relations (Fourier, Hooke, Newtonian viscosity, ideal and real gases) are physis's (`thermodynamics`, `continuum`, planned); the equation of state of seawater is the oceanography domain's (TEOS-10, planned), of moist air the meteorology domain's. A world's materials name their relations and their parameters; the parameters belong to the **scenario** (§9), the relations to the model.

Occupancy may be uncertain: a sea floor that was never sounded, a lunar subsurface. Then $\lambda$ is a *hypothesis* $\lambda_\gamma$ selected by the scenario from an admissible family $\{\lambda_\gamma\}_{\gamma\in\mathcal G}$, and the family is as much a part of the world as any one member.

## 5. Dynamics

### 5.1 Variational Models

**Definition 5.1 (action).** A *variational model* on a region is an action
$$
S[\varphi]=\int_{\Omega\times I}L(\varphi,\,d\varphi,\,g)\,\mathrm{vol}_g ,
$$
whose stationary points $\delta S=0$ are the Euler–Lagrange equations. **Noether's theorem**: a one-parameter group of transformations leaving $L$ invariant gives a current $J$ with $dJ=0$ on solutions, so that its charge over a region changes only by the flux through the region's boundary (Olver 1993, ch. 4). Energy, momentum and angular momentum are the charges of time translation, translation and rotation; they are the **invariants** the runtime watches (§6.1).

The variational models of the first worlds are mechanical: $n$ bodies under gravity, rigid bodies on $SE(3)$, articulated mechanisms (§7.4). Their discrete counterparts are variational integrators (Marsden and West 2001) and Lie-group integrators (Hairer, Lubich and Wanner 2006, ch. IV), which conserve the discrete momenta exactly and the energy to a bounded error; they are planned in physis `discretisation` and calx `integrators`, and the worlds are where they are needed first.

### 5.2 Balance Laws

**Definition 5.2 (balance law).** A *balance law* on a region $\Omega$ for a density $u$ (an $n$-form), a flux $J$ (an $(n-1)$-form) and a source $s$ (an $n$-form) is
$$
\partial_tu+dJ=s,\qquad\text{equivalently}\qquad \frac{d}{dt}\int_Vu=-\int_{\partial V}J+\int_Vs\quad\text{for every }V\subseteq\Omega ,
$$
closed by a constitutive relation $J=\mathcal C_\theta(u,du,\ldots)$. When the boundary of $V$ moves with velocity $w$, the flux through it is the relative flux $J-\iota_w u$.

Heat ($u=\rho cT\,\mathrm{vol}$, $J=-k\star dT$), mass ($u=\rho\,\mathrm{vol}$, $J=\star(\rho v^\flat)$), momentum (the Navier–Stokes equations as the balance of momentum density with the stress as flux) and the shallow-water equations are balance laws; the meteorology domain has the last two of our own models on the sphere already, spectrally, and physis `continuum` will hold them generally.

**Proposition 5.3 (exact discrete balance).** On a cellulation $K$ of $\Omega$, with $u\in C^n(K)$, $J\in C^{n-1}(K)$ and $s\in C^n(K)$, the semi-discrete law $\partial_tu+dJ=s$ gives
$$
\frac{d}{dt}\sum_{\sigma\in K_n}u(\sigma)=-\sum_{\tau\in\partial K}J(\tau)+\sum_{\sigma}s(\sigma),
$$
exactly: the total changes only by the flux through the boundary of $K$ and the sources.

*Proof.* Sum $dJ=\partial^{\mathsf T}J$ over the top cells: every interior face appears twice with opposite signs and cancels; only the boundary faces remain. $\square$

### 5.3 Hybrid and Stochastic Models

**Definition 5.4 (hybrid model).** A *hybrid model* is a system $(X,F,G,R)$: a flow $\dot x=F(x)$ off the guard set $G$, a jump $x^+=R(x^-)$ when the state enters $G$, and components held still for a dwell after a jump (Goebel, Sanfelice and Teel 2012); physis `dynamics/hybrid.hpp` is its implementation, with the events found on the time grid and a silent settling jump for hysteresis. Contact and impact, the switching of an actuator, the sampling of a sensor and a change of phase are its jumps. A minimum dwell excludes Zeno behaviour.

A *stochastic model* adds a noise law to a flow: $dx=F(x)\,dt+\Sigma(x)\,dW$, with its interpretation (Itô) and its scheme (Euler–Maruyama, Milstein, planned in calx `integrators`); the noise is drawn from calx `random`'s counter-based streams keyed by what they are for, so that a run is reproducible for any number of threads, and its statistics are tyche's.

### 5.4 The World System as a Fibre Product

**Definition 5.5 (ports and the world system).** Each region's model is a dynamical system $\Sigma_i$ on a state space $X_i$ with *ports* $P_i\colon X_i\to\Pi_i$, the traces, fluxes and other interface variables it exposes; each interface carries a relation $C_{ij}\subseteq\Pi_i\times\Pi_j$ between the ports of its two sides (continuity of traces, equality and opposition of fluxes, a jump law). The *world's state space* is
$$
X=\{(x_i)_{i\in R}:\ (P_i(x_i),P_j(x_j))\in C_{ij}\ \text{for every interface}\},
$$
the limit of the diagram of the $X_i$ over the interface spaces; when every $C_{ij}$ is an equality of port values it is the fibre product $X_1\times_{\Pi}X_2\times_\Pi\cdots$. The world's dynamics is the restriction of the product of the flows to $X$: a differential-algebraic system whose algebraic part is the interface relations.

This is Willems's interconnection as the sharing of variables (Willems 2007) and the compositional frameworks of open systems (Baez and Pollard 2017; Fong and Spivak 2019): a region with ports is an open system, an interface is a shared port, and a world is the composite. Two worlds are **composed** along a common interface by the pushout of their carriers and cellulations (gluing $K_1\cup_\Gamma K_2$ along the shared subcomplex) and the fibre product of their state spaces. The index of the resulting differential-algebraic system is a property of the ports (equal fluxes give index one; equal states, higher), which the preparation classifies before an integrator is chosen.

### 5.5 Conservation across Interfaces, Exactly

**Proposition 5.6 (exact interface conservation).** Let regions $\Omega_i$ and $\Omega_j$ of a cellulated world share the interface subcomplex $\Gamma$, and let the flux of a balance law be a single cochain $J\in C^{n-1}(K)$ on the whole of $K$, so that each face of $\Gamma$ carries one value with one orientation. Then over any interval the amount of $u$ leaving $\Omega_i$ through $\Gamma$ equals the amount entering $\Omega_j$, exactly in exact arithmetic, and the global balance of Proposition 5.3 has no interface term.

*Proof.* The face $\tau\subset\Gamma$ lies in the boundary of exactly one top cell of $\Omega_i$ and one of $\Omega_j$, with opposite incidence signs, since $K$ is oriented once; in the sum of $dJ$ over $\Omega_i$'s cells it contributes $+J(\tau)$ and over $\Omega_j$'s $-J(\tau)$. $\square$

In floating point the residual is the rounding of the sum, $O(\epsilon)$ per face: the conservation of the preliminary design's "balance residual" is here a property of the construction, not a tolerance to be met. The residual becomes nonzero only when the two sides use *different* cellulations of $\Gamma$ and a transfer operator between them (§6.3); then it is bounded by the quadrature error of the transfer, and the runtime reports it.

### 5.6 Multirate Integration and Common-Interval Accounting

**Definition 5.7 (schedule and macro step).** Each region advances with its own step $\Delta t_i$; a *macro step* $H$ is a common multiple (or a declared schedule) over which the world is advanced together. The amount transferred through $\Gamma$ over $[t,t+H]$ is $Q_\Gamma=\sum_{\text{micro steps}}J_\Gamma\,\Delta t$, computed from the same flux cochain on both sides, with the storage $B_\Gamma$ and the production $Q_{\Gamma,\mathrm{src}}$ of an interface with its own state; the *residual* $r_\Gamma=\Delta B_\Gamma-Q_{i\to\Gamma}-Q_{j\to\Gamma}-Q_{\Gamma,\mathrm{src}}$ is reported for every macro step, zero to rounding by Proposition 5.6 when the flux is shared. The schedule is a task graph: nodes are (region, micro step), edges the dependencies through interfaces, Jacobi (the sides exchange at the macro step) or Gauss–Seidel (one side uses the other's new traces); calx `scheduler`'s task graphs run it on the threads of the machine.

A macro step is a **trial**: the regions' states, the hybrid events and the agents' deliveries are committed together when the step's checks pass (admissibility, residuals, the integrators' error estimates), and discarded together when they do not, so that no consumer sees a world half advanced. A **checkpoint** holds what a restart needs beyond the fields: the integrators' histories, the event queues, the controllers' memories and the counters of the random streams (Philox's counters make a stream restartable at a position).

## 6. Transformations: Passive, Physical and Gauge

### 6.1 Three Kinds

Three kinds of transformation act on a world, and the formalism keeps them apart because they have different obligations:

1. **Passive.** A change of chart (components transform by the Jacobian, $V'^\mu=\partial x'^\mu/\partial x^\nu\,V^\nu$, scalars not at all), a change of frame (Proposition 2.2), a change of unit (a change of basis of $\mathbb R_\delta$), a change of cellulation (§6.3). The world is unchanged; its description is.
2. **Physical.** The isometries of $(M,g)$ and the symmetries of the laws (Galilei's group for Newtonian worlds, the Poincaré group for Minkowski space) act on the fields; the laws are invariant, and Noether's charges are conserved. These charges are the **invariants of a run**: their drift is the measure of an integrator's error, reported at every macro step, and a method that conserves one exactly (a symplectic integrator's momentum, a discrete exterior calculus's mass) is checked to do so to rounding.
3. **Internal gauge.** Where a field is a $G$-connection, the gauge group $\mathcal G=\mathrm{Map}(K_0,G)$ acts by $U_e\mapsto g_{\mathrm{tail}}U_eg_{\mathrm{head}}^{-1}$ and conjugates holonomies; the invariants are the traces of closed transports (Wilson loops) and the conjugacy classes of holonomies (physis `gauge`). Only a model that declares a structure group carries this redundancy; a lunar world's temperature does not.

Coordinate covariance is not a gauge symmetry; a frame change is not a physical motion; a remeshing changes an approximation and not a world. A change of *model* (another constitutive law, another occupancy hypothesis, another set of regions) changes the scientific question and needs a declared transfer of state and a new provenance.

### 6.2 Observables Are Invariants

**Proposition 6.1 (observables).** A sensor's reading $y=H[\varphi,q]$ (§8.2) is a functional of the fields and of the agent's configuration such that (i) $H$ is invariant under every passive transformation of the description, being defined on the sections of the sheaf and not on their components; (ii) under a change of frame it transforms by the representation of its output type (a scalar is unchanged, a measured velocity by Proposition 2.2); (iii) it is invariant under the internal gauge group of every connection it reads. Consequently a controller that acts on readings alone cannot distinguish two descriptions of one world, nor two gauge-equivalent configurations.

*Proof.* (i) and (iii) are the definition of a well-formed observable; (ii) is the covariance of the output type. The consequence is immediate. $\square$

This is the sense in which "the controller does not see the simulator's ground truth": what it sees is an invariant, with its noise and latency, and nothing else. The economics domain's loop deficits and the history domain's Wilson loops are observables in the same sense.

### 6.3 Remeshing Commutes with d

**Proposition 6.2 (conservative transfer).** Let $K'$ refine $K$ (every cell of $K$ a union of cells of $K'$) and let the transfer $T=\mathcal R'\circ\mathcal W\colon C^k(K)\to C^k(K')$ be the de Rham map of the Whitney interpolant. Then $Td=dT$, and for top cochains ($k=n$) $T$ preserves the total, $\sum_{K'_n}Tu=\sum_{K_n}u$.

*Proof.* $d\mathcal W=\mathcal Wd$ and $\mathcal R'd=d\mathcal R'$ (Proposition 3.6 and Whitney 1957); for $k=n$, $\mathcal W u$ is a density whose integral over a cell of $K$ equals $u$ of that cell, and the integrals over its subcells sum to it. $\square$

So a conserved amount stays conserved across a refinement, and a flux transferred between two cellulations of an interface by $T$ loses nothing; what it does change is the *distribution* within the cells, which is the approximation. A transfer that is not of this form (a point interpolation of a temperature) conserves the quantity it interpolates and not the energy it stands for, and the world states which quantity each interface transfers.

## 7. The Algebraic Geometry of Bodies and Mechanisms

Geometry in Cosmopoiesis is given by equations where it can be, and sampled data are evidence about those equations.

### 7.1 Bodies as Semi-Algebraic Sets

**Definition 7.1.** A *semi-algebraic set* is a finite Boolean combination of sets $\{x\in\mathbb R^n: p(x)=0\}$ and $\{x: q(x)>0\}$ for polynomials $p,q$ (Bochnak, Coste and Roy 1998, ch. 2). The *bodies* of a world are semi-algebraic: balls, ellipsoids, boxes, cylinders, tori, polyhedra, and their unions, intersections and differences (constructive solid geometry), together with *terrains*, graphs $z=h(x,y)$ of piecewise polynomial $h$ (splines over a triangulation, whose pieces are algebraic).

Membership is a sign test; the outward normal is $\nabla p/|\nabla p|$; the distance from a point to a surface, which contact needs (§8.1), is the solution of a polynomial system. Over the rationals the coefficients are exact (morphe `arithmetic`), and the intersection of two quadrics, the implicit equation of a parametric surface and the critical points of a distance are computed by Gröbner bases (Cox, Little and O'Shea 2015), morphe `algebraic_geometry`, planned, with Cosmopoiesis as its first client; in floating point the same questions are physis `computational_geometry`'s, with exact predicates its open question.

### 7.2 Figures, Harmonic Polynomials and Gravity

The figure of a planet is a quadric: the reference ellipsoid $x^2/a^2+y^2/a^2+z^2/b^2=1$ with $a,b$ from the geodesy domain (WGS 84, GRS 80) or, for the Moon, a sphere of its mean radius with the figure's harmonics as corrections (the planetary-science domain, to be founded).

**Proposition 7.2 (harmonic polynomials and the gravity field).** The homogeneous harmonic polynomials of degree $\ell$ on $\mathbb R^3$ form a space $\mathcal H_\ell$ of dimension $2\ell+1$, the irreducible representation of $SO(3)$ of spin $\ell$; their restrictions to the sphere are the spherical harmonics $Y_{\ell m}$. The exterior gravitational potential of a body of mass $M$ and reference radius $R$ is
$$
V(r,\varphi,\lambda)=\frac{GM}{r}\sum_{\ell\ge0}\Big(\frac Rr\Big)^{\ell}\sum_{m=0}^{\ell}\big(C_{\ell m}\cos m\lambda+S_{\ell m}\sin m\lambda\big)P_{\ell m}(\sin\varphi),
$$
an expansion in those representations; truncation at degree $L$ is the orthogonal projection onto $\bigoplus_{\ell\le L}\mathcal H_\ell$, and the gravity $g=-\nabla V$ and the tidal tensor $\nabla\nabla V$ follow by differentiation.

*Proof.* Stein and Weiss (1971, ch. IV) for $\mathcal H_\ell$ and its irreducibility; Heiskanen and Moritz (1967, ch. 1–2) for the expansion of the exterior potential. $\square$

The coefficients are datasets of the library: GRGM1200A for the Moon (GRAIL), EGM2008 for the Earth, each to the degree a world asks; the evaluation is physis `gravitation` (planned) on physis `symmetry`'s $SO(3)$. A level set of a truncated potential, multiplied by $r^{L+1}$, is a real algebraic surface: the selenoid and the geoid are algebraic at every truncation.

### 7.3 Mechanisms as Varieties

**Definition 7.3 (configuration variety).** A rigid body's pose is $(q,b)$ with $q\in S^3=\{q\in\mathbb R^4:|q|^2=1\}$ a unit quaternion (physis `symmetry/su2.hpp`) and $b\in\mathbb R^3$; a mechanism of $n$ bodies joined by joints has coordinates in $\mathbb R^{7n}$, and each joint is a set of polynomial equations in them (a revolute joint fixes a point and an axis: five equations; a spherical joint a point: three; a prismatic joint an axis and an orientation). Let $I$ be the ideal generated by the $n$ norm equations and the joint equations. The *configuration space* of the mechanism is the real algebraic variety $Q=V(I)\subset\mathbb R^{7n}$.

**Proposition 7.4 (degrees of freedom and singularities).** Let $J(x)$ be the Jacobian of a generating set of $I$ at $x\in Q$ and $r=\max_{x\in Q}\operatorname{rank}J(x)$. At every point where the rank is $r$, $Q$ is a smooth manifold of dimension $7n-r$, the mechanism's degrees of freedom; the *singular locus* $\Sigma=\{x\in Q:\operatorname{rank}J(x)<r\}$, the zero set of the $r\times r$ minors, is where the mechanism gains instantaneous mobility: its kinematic singularities.

*Proof.* The implicit function theorem at the regular points; the minors define $\Sigma$ as a subvariety (Bochnak, Coste and Roy 1998, §3.3; Sommese and Wampler 2005, ch. 12). $\square$

With rational parameters, $\dim Q$ and the ideal of $\Sigma$ are computed exactly by Gröbner bases (morphe `algebraic_geometry`, planned); numerically, Newton's method on the generators projects a drifting state back onto $Q$, and the rank of $J$ along a trajectory warns of a singularity before the controller reaches it.

### 7.4 Constrained Dynamics on a Variety

**Proposition 7.5 (constrained mechanics).** The Lagrangian dynamics of a mechanism with kinetic energy $\tfrac12\dot x^{\mathsf T}M(x)\dot x$, forces $f$ and the constraints $C(x)=0$ generating $I$ is the index-three differential-algebraic system
$$
M(x)\ddot x=f(x,\dot x,t)-J(x)^{\mathsf T}\lambda,\qquad C(x)=0,
$$
with $\lambda$ the constraint forces. Differentiating the constraint twice gives an index-one system; a step of an integrator followed by the projection onto $Q$ (and of the velocity onto $TQ$) keeps $C=0$ to rounding, and the symplectic Euler or RATTLE scheme does so while conserving the discrete momenta.

*Proof.* Hairer, Lubich and Wanner (2006, ch. VII.1); for the projection methods, ch. IV.4. $\square$

These are the dynamics of the bodies and agents of §8; the rigid-body part on $SE(3)$ is physis `mechanics` (planned), the integrators calx's and physis `discretisation`'s, the contact a hybrid model (§5.3) whose guard is the distance of §7.1 reaching zero.

*Remark (orbits).* In the two-body problem the orbit is a conic, the zero set of a quadratic in the orbital plane; the energy, the angular momentum and the Laplace–Runge–Lenz vector are first integrals whose level sets are varieties in phase space. An $n$-body integrator is checked by the drift of the osculating conic's elements against the JPL ephemeris (astronomy `ephemerides`), which the Celestial Atlas already evaluates.

## 8. Agents

### 8.1 An Agent as a Hybrid System with Ports

**Definition 8.1 (agent).** An *agent* is a tuple $A=(Q,\Sigma,\mathcal P,\mathcal S,\mathcal U,c,\Pi)$: a configuration variety $Q$ (§7.3) and a hybrid model $\Sigma$ on $TQ$ (its body and mechanism, with contact as guards and jumps or as compliant ports); *ports* $\mathcal P$ through which it exchanges momentum (forces and torques), heat, mass (fuel, regolith moved) and *geometry* (an actuator that changes a field of the world: a wheel's rut in the terrain height field, an excavation in the occupancy) with the region it is in; sensors $\mathcal S$ (§8.2); actuators $\mathcal U$, port sources driven by commands; a clock $c$ (§2.3); and a controller $\Pi$ (§8.3). It lives on a worldline stratum of the carrier, and its ports are interfaces in the sense of §5.4 between that stratum and the region: momentum exchanged through a shared port variable is conserved exactly, by Proposition 5.6 applied to the port.

### 8.2 Sensors as Observation Operators

**Definition 8.2 (sensor).** A sensor $k$ measures at coordinate times $t^m_k$ on a *footprint* $D_k$, a region of the carrier attached to the agent (a point, a cone of view, a volume), and delivers at $t^d_k=t^m_k+\ell_k$ after its latency, stamped by the agent's clock reading $c(t^m_k)$:
$$
y_k=H_k\big[\varphi|_{D_k},\,q\big]+\varepsilon_k ,
$$
with $H_k$ an observable in the sense of Proposition 6.1, evaluated from the committed snapshot by the Whitney interpolant of the fields on $D_k$ (and the agent's own configuration for proprioception), and $\varepsilon_k$ noise drawn from a random stream keyed by (sensor, $k$), so that the same world and seed give the same readings on any machine and any number of threads. A footprint may lie across an interface or outside the sensor's material region; the reading then carries what is undefined, never a value of zero.

### 8.3 Controllers, Memory and Beliefs

**Definition 8.3 (controller).** A controller is a discrete-time or hybrid system on a memory $\xi$, with parameters $\hat\vartheta$ (its beliefs and estimates), stepped at the ticks of the agent's clock, reading only the readings delivered by then and writing commands:
$$
\xi_{k+1}=\Pi\big(\xi_k,\{y_j: t^d_j\le t_k\};\hat\vartheta\big),\qquad u_k=\kappa(\xi_k).
$$
The estimates $\hat\vartheta$ are updated by the controller from delivered readings (the estimation, filtering and learning of tyche: `assimilation`, `uncertainty`, `learning`, planned); they are distinct from the scenario's parameters $\theta$ (§4, §9), and an experiment that changes $\theta$ in the light of data is a calibration that produces a new scenario, recorded as such. A controller is an open system with one input port (readings) and one output port (commands); the closed loop is the fibre product of §5.4 over those ports.

**Proposition 8.4 (causality).** With deliveries queued by delivery time, the controller stepped at its clock's ticks, and the deliveries of a rejected trial discarded with it, the command $u(t)$ is a function of $\{y_j: t^d_j\le t\}$ and the controller's initial memory alone.

*Proof.* By construction of the queue and of the trial-and-commit step of §5.6. $\square$

An experiment that gives a controller the truth (a perfect sensor without latency, or the fields themselves) declares it as such; it is a legitimate control, not a default.

### 8.4 Many Agents and Real Agents

Several agents communicate over a network (a graph of morphe `combinatorics`) whose messages are readings with the channel's latency, delivered as sensors deliver; their cooperation is the closed loop of all of them with the world. A **real agent** is one whose readings come from the observation edge of the infrastructure (`observation/sensors`, posted and streamed by the API) and whose commands drive hardware: the same contract, the world then stepped against the wall clock. Nothing in the engine knows the difference; the server does.

## 9. Scenario, Evidence, Experiment and Run

**Definition 9.1.** A *world definition* $W$ is the carrier with its decomposition and cellulation families, its frames, its fields with their kinds and supports, its materials with their relations, its models and interface relations, and its agents' definitions (§§1–8). A *scenario* $\mathcal S=(W,\gamma,\theta,\varphi_0,\beta,f,\mathcal B)$ selects a geometry hypothesis $\gamma$ (an occupancy, a terrain, a figure), parameters $\theta$, initial fields $\varphi_0$, boundary data $\beta$, forcing $f$, and the *bindings* $\mathcal B$ of these to evidence (which dataset, which product, which version). An *experiment* $\mathcal E=(\mathcal S,\mathcal N,\mathcal K)$ adds the numerical plan $\mathcal N$ (cellulations, methods, steps and schedule, tolerances, seeds, threads) and the evaluation $\mathcal K$ (observables, references, tolerances, what is to be claimed). A *run* is the record of an experiment's execution: its manifest (with the commit of every library and the version of every dataset used), its committed snapshots, its invariants and interface residuals at every macro step, its events, the readings delivered, its checkpoints.

**Evidence** is the data library's: datasets with their manifests, licences and `retrieval.json`, products with their `source` blocks and coverage. Four channels are kept apart and answered separately: *observed* (the evidence, with its coverage: no value outside it), *reconstructed* (a product built from evidence by a declared method, with its held-out error and its provenance), *modelled* (a run's snapshot), and *displayed* (what the page draws, at its own resolution). Loading, drawing or zooming never moves a value from one channel to another; a reconstruction never changes an observation; a model value exists where the evidence is absent and says so.

**Claims** carry their status. Code is `planned`, `seed`, `draft`, `stable` or `deprecated`, as everywhere in the infrastructure. A model is **verified** when its implementation agrees with a closed form, a manufactured solution or an independent implementation within a declared tolerance and at the expected order; it is **validated** when its results agree with independent evidence in a stated regime. Verification is the engine's duty for every model it runs; validation is a research result, world by world.

## 10. Scales: the Chain of Worlds

**Definition 10.1 (embedding).** An *embedding* of a world $W_1$ into a world $W_0$ is a morphism of frames $f_1\to f_0$ in $\mathfrak F$ (time-dependent: a lunar patch into the Moon's body-fixed frame, the Moon into the barycentric frame of DE440), together with either the restriction of $W_0$'s fields to $W_1$'s carrier as boundary data and forcing (one-way nesting) or the fibre product of the two (two-way, §5.4). A *chain* $W_k\to\cdots\to W_1\to W_0$ runs from the smallest world to the largest: a rover's patch, the Moon, the Solar System, the Local Volume of galaxies.

Every world stores positions in its own frame. The reason is arithmetic: double precision has $\epsilon=2^{-53}\approx1.1\times10^{-16}$, and a position stored in a frame of extent $L$ carries an absolute error of order $\epsilon L$:

| Frame | Extent $L$ | $\epsilon L$ |
|---|---|---|
| the Local Volume of galaxies | $10^{24}$ m | $10^{8}$ m |
| the Solar System | $10^{13}$ m | $10^{-3}$ m |
| a planet, body-fixed | $10^{7}$ m | $10^{-9}$ m |
| a patch | $10^{3}$ m | $10^{-13}$ m |

A rover's position kept in the barycentric frame would be known to a millimetre and lose its wheels' contact; kept in the patch's frame, with the chain of morphisms carrying the offsets, it is exact to a fraction of an atom. The visualization layer realises the same chain as floating origins for graphics precision (architecture §5 of the infrastructure, after OpenSpace).

## 11. Generated Carriers

A carrier need not be given. The theories of physis `quantum_gravity` and `field_theory` generate discrete spacetimes: the Feynman graphs of a group field theory and their 2-complexes, random planar quadrangulations (the surfaces of two-dimensional quantum gravity), melonic graphs (the branched polymers of tensor models), spin foams with their Regge geometries (edge lengths $j+\tfrac12$), and causal sets sprinkled into the exact spacetimes of physis `spacetime` ([ADR 0040](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0040-the-generation-of-spacetime.md)).

**Definition 11.1 (generated world).** A *generated world* is a world whose cellulation $K$ is a sample of a declared theory at a declared seed, with the geometry that the sample carries (a spin foam's lengths, a causal set's order), and whose fields and dynamics are then as in §§3–5: a scalar field on $K$ is a 0-cochain (physis `field_theory/scalar.hpp`), a balance law on it is Proposition 5.3, a connection on it is physis `gauge`'s. Its carrier's own diagnostics are the spectral and Hausdorff dimensions of physis `spacetime/dimensions.hpp`.

This is where the field-theoretic philosophy of the preliminary design becomes an instrument: the space in which a world is simulated can itself be the outcome of a field theory, and the question of what dynamics a field on a random geometry supports (diffusion on a melonic graph with spectral dimension $4/3$; waves on a quadrangulation of dimension $4$) is one of Cosmopoiesis's research questions. The Complex Atlas draws these carriers; Cosmopoiesis puts worlds on them.

## 12. The Propositions and Their Checks

Every result above that can be checked numerically is checked, by a program on calx `verification` in the engine's checks, as each slice of the architecture reaches it:

| Result | Check | Slice |
|---|---|---|
| 2.2 kinematics of a frame change | a point in a rotating frame: velocity and acceleration against the closed form; the round trip of a chain of three frames to $10^{-12}$ m at 10 m | 0 |
| 3.6 $dd=0$, Stokes | on every cellulation the engine builds (boxes, spheres, shells, terrains, glued complexes) | 0 |
| 3.8 Hodge decomposition | the Helmholtz projection of a flow on a basin with islands: the harmonic part's dimension equals the number of islands | 3 |
| 5.3 exact discrete balance | heat in a box: the total energy's change equals the boundary flux to rounding; the sine mode against $T_b+Ae^{-\lambda t}\sin(\pi x/L)$ at second order in $h$ | 0 |
| 5.6 exact interface conservation | two boxes glued on a face: the interface residual zero to rounding at every macro step, with unequal micro steps | 1 |
| 6.2 conservative transfer | a density transferred to a refinement keeps its total; the flux through an interface cellulated twice differs by the quadrature error alone | 1 |
| 7.2 harmonic expansion | the Moon's gravity from GRGM1200A at degree 2 against the closed form of $J_2$; Laplace's equation of the evaluated potential to rounding | 2 |
| 7.4 configuration variety | a four-bar linkage: one degree of freedom; its singular configurations found by the rank of $J$ | 2 |
| 7.5 constrained dynamics | a pendulum as a constrained particle: the constraint kept to $10^{-12}$ over $10^5$ steps by projection; the energy's drift bounded | 2 |
| 8.4 causality | a controller's commands unchanged when readings not yet delivered are altered; a rejected trial leaves the memory as it was | 2 |
| 10.1 the chain of worlds | a position carried through patch → Moon → barycentre and back, to $10^{-9}$ m | 2 |
| 11.1 generated carriers | diffusion on a melonic graph: the return probability's exponent against the spectral dimension $4/3$ | 5 |

## 13. Notation

| Symbol | Meaning | Units | Code (provisional) |
|---|---|---|---|
| $(M,g)$ | the carrier and its metric | — | `Carrier`, physis `MetricField` |
| $\Omega_i$, $\Gamma_{ij}$ | regions and interfaces | — | `Region`, `Interface` |
| $K$, $K^\star$ | cellulation and its dual | — | morphe `CWComplex`; the dual from physis `Weights` |
| $\mathfrak F$, $f_0$ | the frame groupoid, the root frame | — | `Frame`, `FrameMorphism` |
| $(R(t),b(t))$, $\omega$ | a frame morphism, its angular velocity | rad, m, rad s⁻¹ | `FrameMorphism` on physis `SU2` |
| $\mathbb D$, $\mathbb R_\delta$ | dimensions; quantities of dimension $\delta$ | — | physis `Dimension`, `Quantity` |
| $\omega\in\Omega^k$, $c\in C^k$ | a $k$-form; a $k$-cochain | the field's | `Field`, physis `Cochain` |
| $\mathcal R$, $\mathcal W$ | the de Rham and Whitney maps | — | `de_rham`, `whitney` |
| $d$, $\delta$, $\star$, $\Delta$ | coboundary, codifferential, Hodge star, Laplacian | — | physis `d0`, `d1`, `Weights`, `hodge_decomposition` |
| $\lambda$, $\Omega_m$ | occupancy; the region of material $m$ | — | `Occupancy` |
| $\mathcal C_\theta$, $\theta$ | a constitutive relation and its parameters | the relation's | `Material`, `Scenario::parameters` |
| $S$, $L$ | action, Lagrangian density | J s, J m⁻³ | `VariationalModel` |
| $u$, $J$, $s$ | density, flux, source of a balance law | per volume, per area per time | `BalanceLaw` |
| $(X,F,G,R)$ | a hybrid model | — | physis `Hybrid` |
| $P_i$, $\Pi_i$, $C_{ij}$ | ports, port spaces, interface relations | — | `Port`, `InterfaceLaw` |
| $H$, $Q_\Gamma$, $r_\Gamma$ | macro step; transfer through, and residual at, an interface | s; the quantity's | `Schedule`, `Balance` |
| $y_k$, $t^m_k$, $t^d_k$, $\ell_k$, $D_k$ | a reading, its measurement and delivery times, latency, footprint | the sensor's | `Sensor`, `Reading` |
| $\xi$, $\hat\vartheta$, $u_k$ | controller memory, estimates, commands | — | `Controller` |
| $Q=V(I)$, $\Sigma$ | configuration variety, singular locus | — | `Mechanism` |
| $\mathcal S$, $\mathcal E$ | scenario, experiment | — | `Scenario`, `Experiment` |
| $\mathcal H_\ell$, $C_{\ell m},S_{\ell m}$ | harmonic polynomials of degree $\ell$; gravity coefficients | — | physis `gravitation` (planned) |

## 14. References

- Arnold, D. N., Falk, R. S. and Winther, R. (2006), Finite element exterior calculus, homological techniques, and applications, *Acta Numerica* 15, 1–155.
- Baez, J. C. and Pollard, B. S. (2017), A compositional framework for reaction networks, *Reviews in Mathematical Physics* 29, 1750028.
- Bochnak, J., Coste, M. and Roy, M.-F. (1998), *Real Algebraic Geometry*, Springer.
- Cox, D. A., Little, J. and O'Shea, D. (2015), *Ideals, Varieties, and Algorithms*, 4th ed., Springer.
- Desbrun, M., Hirani, A. N., Leok, M. and Marsden, J. E. (2005), Discrete exterior calculus, arXiv:math/0508341.
- Eckmann, B. (1944), Harmonische Funktionen und Randwertaufgaben in einem Komplex, *Commentarii Mathematici Helvetici* 17, 240–255.
- Fong, B. and Spivak, D. I. (2019), *An Invitation to Applied Category Theory: Seven Sketches in Compositionality*, Cambridge University Press.
- Goebel, R., Sanfelice, R. G. and Teel, A. R. (2012), *Hybrid Dynamical Systems*, Princeton University Press.
- Hairer, E., Lubich, C. and Wanner, G. (2006), *Geometric Numerical Integration*, 2nd ed., Springer.
- Heiskanen, W. A. and Moritz, H. (1967), *Physical Geodesy*, Freeman.
- Lim, L.-H. (2020), Hodge Laplacians on graphs, *SIAM Review* 62, 685–715.
- Mac Lane, S. and Moerdijk, I. (1992), *Sheaves in Geometry and Logic*, Springer.
- Marsden, J. E. and West, M. (2001), Discrete mechanics and variational integrators, *Acta Numerica* 10, 357–514.
- Misner, C. W., Thorne, K. S. and Wheeler, J. A. (1973), *Gravitation*, Freeman.
- Olver, P. J. (1993), *Applications of Lie Groups to Differential Equations*, 2nd ed., Springer.
- Sommese, A. J. and Wampler, C. W. (2005), *The Numerical Solution of Systems of Polynomials Arising in Engineering and Science*, World Scientific.
- Stein, E. M. and Weiss, G. (1971), *Introduction to Fourier Analysis on Euclidean Spaces*, Princeton University Press.
- Whitney, H. (1957), *Geometric Integration Theory*, Princeton University Press.
- Willems, J. C. (2007), The behavioral approach to open and interconnected systems, *IEEE Control Systems Magazine* 27, 46–99.
- Archinal, B. A. et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015, *Celestial Mechanics and Dynamical Astronomy* 130, 22.
- Lemoine, F. G. et al. (2014), GRGM900C: a degree-900 lunar gravity model from GRAIL, *Geophysical Research Letters* 41, 3382–3389; Goossens, S. et al. (2020), High-resolution gravity field models from GRAIL, *Journal of Geophysical Research: Planets* 125, e2019JE006086 (GRGM1200A).
- Pavlis, N. K., Holmes, S. A., Kenyon, S. C. and Factor, J. K. (2012), The development and evaluation of the Earth Gravitational Model 2008 (EGM2008), *Journal of Geophysical Research* 117, B04406.
- Bombelli, L., Lee, J., Meyer, D. and Sorkin, R. D. (1987), Space-time as a causal set, *Physical Review Letters* 59, 521–524; Gurau, R. (2011), Colored group field theory, *Communications in Mathematical Physics* 304, 69–93.
