---
title: The Formalism of Cosmopoiesis
status: draft
date: 2026-10-28
implemented-by: [engine/spacetime.hpp, engine/observation.hpp, engine/acquisition.hpp]   # and the domains' and foundations' modules each section names
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

### 2.5 Events and Their Addresses

The worlds of Cosmopoiesis share one space of events, from a point on the Moon's regolith to the Galaxy's centre, and one language in which any of them is written, read back and answered in any frame. The language is the navigation domain's (`frames/address.hpp`); this section states what it denotes.

**Definition 2.3 (events).** Let $T\subset\mathfrak F$ be the catalogue's tree: its frames, each with one morphism $\phi_{f}(t)$ to its parent, from the Earth's terrestrial frame and a place's horizon up to the barycentric ICRS and the galactocentric frame. Since a tree is simply connected, the composite $\phi_{f'f}(t)$ along the unique path from $f$ to $f'$ is well defined, and the *events* of the world are the quotient
$$
\mathcal E=\Big(\coprod_{f\in T}\mathbb R^3_f\times\mathbb T\Big)\Big/\!\sim,\qquad (x,f,t)\sim\big(\phi_{f'f}(t)\,x,\ f',\ t\big),
$$
with $\mathbb T$ the line of TT (§2.3). A *direction* is the same quotient on the sphere $S^2_f$ with the rotations alone; the edges outside the tree are §2.6's.

**Definition 2.4 (charts and steps).** A *chart* on a frame $f$ is an injective map $\psi\colon U_\psi\subseteq\mathbb R^3\to\mathbb R^3_f$: cartesian; spherical, called equatorial, ecliptic or galactic after the frame's axes, as (longitude, latitude, distance); cylindrical; on a body's fixed frame, geodetic (WGS 84 in the ITRS) or planetocentric (the body's mean sphere: selenographic on the Moon); and in the ITRS the grids UTM and MGRS of geodesy `projection`. A *step* at a point $p$ above a body's figure is the chart $\ell_p(y)=p+E(p)\,y$ of the local horizon, with $E(p)$ the east, north and up vectors of the figure's normal at $p$ (geodesy `local`), in the forms enu, ned and aer (azimuth clockwise from north, elevation, range). Steps compose, each at the point the previous one reached: an address with steps names a path in the groupoid of local horizons.

**Definition 2.5 (the address language).** The words
$$
\begin{aligned}
\textit{address}&::=\textit{point}\ [\ \texttt{@}\ \textit{instant}\ ] &\qquad \textit{step}&::=(\texttt{enu}\mid\texttt{ned}\mid\texttt{aer})\ \texttt{(}\ \textit{coords}\ \texttt{)}\\
\textit{point}&::=\textit{base}\ \{\ \texttt{/}\ \textit{step}\ \} &\qquad \textit{coords}&::=\textit{coord}\ \{\ \texttt{,}\ \textit{coord}\ \}\\
\textit{base}&::=\mathrm{BODY}\ [\ \texttt{(}\ \textit{coords}\ \texttt{)}\ ]\ \mid\ \mathrm{FRAME}\ [\ \texttt{:}\ \mathrm{CHART}\ ]\ [\ \texttt{(}\ \textit{coords}\ \texttt{)}\ ] &\qquad \textit{coord}&::=\mathrm{STRING}\mid\mathrm{NUMBER}\ [\ \mathrm{UNIT}\mid\mathrm{DMS}\mid\mathrm{HMS}\ ]\ [\ \mathrm{HEMISPHERE}\ ]
\end{aligned}
$$
with the instant in metrology's language of times (a scale is always named) or `now`. BODY is a body's key (the Sun, the planets, Pluto, the Moon, `ssb` the barycentre, `galaxy` its centre); FRAME any other identifier, read as a frame of the catalogue. Examples: `earth(48.8583701 N, 2.2944813 E, 330 m)`, `moon(43.31 S, 11.36 W)`, `earth(35.36 N, 138.73 E)/aer(45°, 30°, 10 km)`, `ICRS:equatorial(266.4051°, 28.936175° S, 8.122 kpc) @ 2026-10-28T12:00:00Z`.

**Proposition 2.6 (one parse, one canonical text).** The grammar is LL(1), so every address has exactly one parse. The canonical printing $\pi$, which writes each number as the shortest decimal that reads back to the same double, satisfies $\mathrm{parse}\circ\pi=\mathrm{id}$ on syntax trees and $\pi\circ\mathrm{parse}=\mathrm{id}$ on canonical words.

*Proof.* The alternatives of every production begin with distinct terminals (BODY and FRAME are distinct lexical classes; the optional parts begin with `(`, `:`, `/`, `@` and `,`, none of which can follow the part they extend), so one token of lookahead chooses each production (Aho, Lam, Sethi and Ullman 2006, §4.4). The shortest round-trip decimal of a double exists and reads back to it (Steele and White 1990; `std::to_chars`, C++17 [charconv]); $\pi$ is a function of the tree, so it inverts parse on its image, the canonical words. $\square$

Resolution carries a parsed address to an event, $\rho=[\phi_{f_0f}\circ\psi]$, and expression carries an event to coordinates in any frame and chart, $\eta_{f,\psi}=\psi^{-1}\circ\phi_{ff_e}$: both are passive transformations (§6.1), positions geometric, without light time or aberration.

**Proposition 2.7 (every answer is an address of the same event).** For every event $e$ and every frame and chart $(f,\psi)$, $\rho\big(\mathrm{parse}(\pi(\eta_{f,\psi}(e)))\big)=e$ up to the rounding of $\phi_{ff_e}$: an error of order $\epsilon\,(|x|+|b|)$, with $b$ the translation of the morphism and $\epsilon=2^{-53}$.

*Proof.* $\rho\circ\eta_{f,\psi}=\phi_{f_ef}\circ\psi\circ\psi^{-1}\circ\phi_{ff_e}=\mathrm{id}$ in exact arithmetic; $\pi$ loses nothing (Proposition 2.6); the rotations preserve norms, and the translations add $\epsilon|b|$ each. $\square$

So a point written in the ITRS reads back from the barycentric ICRS to a micrometre, and from the galactocentric frame, whose origin is $|b|=8.122$ kpc $=2.5\times10^{20}$ m away, to $\epsilon|b|\approx5\times10^{4}$ m: the precision budget of §10, which is why each world keeps its positions in its own frame.

*Remark (extension).* A new body is a key with a figure; a new frame is a new object of the tree with one morphism to its parent; a new chart is a map on a frame. None changes the grammar. The Galaxy entered so: the galactocentric frame of astropy (Gravity Collaboration 2018 for the Sun's distance from the centre, Bennett and Bovy 2019 for its height above the plane, Drimmel and Poggio 2018 for its velocity) under the ICRS, held to astropy's transformation to $10^{-15}$ (navigation `check_address`).

### 2.6 Frames as a Connection, Standards as Gauge

The catalogue holds more transformations than its tree. The Earth's terrestrial frame is reached from the GCRS both by the CIO (IAU 2006/2000A, through the CIRS) and by the equinox (through TOD); the Moon's frame is given by DE440's librations and by the IAU's rotation model; SGP4's TEME is hung from the ITRS by GMST 1982 and reached from TOD by the equation of the equinoxes. Each pair is two realisations of one standard, and the question of whether conversions depend on the route is one of gauge theory.

**Definition 2.8 (the frame connection).** Let $\Gamma$ be the catalogue's graph: its frames as vertices, each defined transformation an edge $e$ carrying its *transport* $U_e(t)\in E(3)=SO(3)\ltimes\mathbb R^3$, with $U_{\bar e}=U_e^{-1}$ on the reversed edge. This is a discrete $E(3)$-connection on $\Gamma$, a group-valued 1-cochain as a lattice gauge field is (physis `gauge`; physis `geometry/frame_graph.hpp` computes it). The *holonomy* of a closed path $\gamma=e_1\cdots e_k$ at its base frame is $\mathrm{hol}(\gamma)=U_{e_k}\cdots U_{e_1}$.

A *re-description* of the frames, another realisation of each (another origin and axes for the same name: another catalogue of reference sources, another determination of the pole), is a choice $g\colon\Gamma_0\to E(3)$, and it acts by $U_e\mapsto g_{\mathrm{tail}(e)}\,U_e\,g_{\mathrm{head}(e)}^{-1}$, the convention of §0.

**Proposition 2.9.** (a) The conjugacy class of $\mathrm{hol}(\gamma)$ is invariant under re-description; in particular so is its angle $\theta(\gamma)=\arccos\big(\tfrac12(\operatorname{tr}R_\gamma-1)\big)$. (b) On a connected graph the transports are a pure gauge, $U_e=h_{\mathrm{tail}(e)}h_{\mathrm{head}(e)}^{-1}$ for some $h\colon\Gamma_0\to E(3)$, exactly when every holonomy is the identity; then, and only then, a conversion does not depend on its route.

*Proof.* (a) A re-description conjugates the holonomy at the base, $\mathrm{hol}(\gamma)\mapsto g_v\,\mathrm{hol}(\gamma)\,g_v^{-1}$, since the inner factors cancel along the path; the trace of the rotation part is a class function. (b) If $U$ is a pure gauge, every product along a closed path telescopes to the identity. Conversely, fix a base $v_0$ and let $h_v$ be the transport along any path from $v$ to $v_0$; trivial holonomy makes it independent of the path, and $U_e=h_{\mathrm{tail}}h_{\mathrm{head}}^{-1}$ (Kogut 1979, §III, for lattice gauge fields). $\square$

The angles are the catalogue's measurements of its own standards: the two routes to the ITRS agree within a milliarcsecond (Wallace and Capitaine 2006 give the consistency of IAU 2006/2000A's two forms), DE440's Moon and the IAU's differ by some arcseconds, and GMST 1982 departs from IAU 2006's by tens of milliarcseconds; the FRAMES page and the engine's `holonomy` report them. The structure is that of the economics domain, whose prices exist exactly when every loop deficit vanishes ([ADR 0044](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0044-value-in-space-and-time.md)): a potential exists exactly when the connection is flat, there of value and here of frames.

*Remark (the relativistic connection).* The catalogue translates the BCRS to the geocentre with ICRS axes and says so: IAU 2000 Resolution B1.3 relates the two by a transformation that is not in $E(3)$, mixing TCB and TCG, scaling lengths by $1-L_G$ and turning the GCRS's axes against the BCRS's by the geodesic precession, 1.92″ a century (Soffel et al. 2003). On a Lorentzian carrier (§2.4) the frames become tetrads along worldlines, the transports parallel transports of the Levi-Civita connection in the Poincaré group, and the holonomy of a loop is physical: the curvature of spacetime, as the geodesic precession of a gyroscope round the Earth (Everitt et al. 2011). The algebra is the same, a group-valued 1-cochain and the conjugacy classes of its holonomies; in the Newtonian catalogue its curvature is the disagreement of standards, in the relativistic one it is gravitation. Frames beyond the Galaxy, the Local Group's barycentre and the rest frame of the cosmic microwave background (369.8 km/s from the Sun; Planck Collaboration 2020), differ from the ICRS by velocities, so their morphisms are boosts: Galilean to $(v/c)^2\approx10^{-6}$, and Lorentzian on the relativistic carrier.

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

### 3.5 The Kinds of Phenomena

A tempting classification of what a world contains has five kinds: geometry and material domains (rock, an ocean region, an atmosphere, a spacecraft's hull); continuous fields (temperature, pressure, velocity, the electromagnetic field); distribution functions (a particle energy spectrum, a velocity distribution, a radiation spectrum); discrete objects (grains, spacecraft, satellites, robots); interactions and events (collisions, combustion, phase changes, chemical reactions). The examples are right and the classification is not: its rows answer three different questions. The first row says *where* something is defined; the second and the third say *what values* it takes, and differ only in where: a velocity distribution is a continuous field on phase space, $f(x,v,t)$ on $TM$, and a radiation spectrum is the radiance $L(x,\hat n,\nu)$ on $M\times S^2\times\mathbb R_{>0}$; the fourth is a field over points that move, and a population of many is a counting measure, $\sum_i\delta_{(x_i,v_i)}$, whose kinetic limit is the third row's distribution; the fifth names no object at all but the morphisms between states: an interaction is a term that couples fields (in an action, or as a port, §5.4), an event is a jump of a hybrid system (§5.3), and combustion and reactions are a reaction network (Baez and Pollard 2017). A phenomenon is therefore classified on three axes, which are independent:

**Definition 3.9 (a phenomenon's kind).** The kind of a phenomenon is a triple (base, fibre, process):

| Axis | Values | Examples |
|---|---|---|
| **base**, where it is defined | a worldline (a 0-stratum in time); a curve or a surface (an interface, a crust, the sea surface); a region (a volume of §1.2); phase space ($TM$, or $M\times$ velocities); $M\times S^2\times$ frequencies (a radiation field); time alone; an abstract carrier (a network, a generated complex of §11) | a satellite's path; the sea surface; the atmosphere; the solar wind's distribution; sunlight; the planetary $K$ index; a transport network |
| **fibre**, the values | a quantity of a dimension $\delta$ (§3.1), a vector or a tensor, a $k$-form; a $G$-connection; a label in a finite set; a configuration in a manifold $Q$; a measure (a counting measure for a population, a probability measure for a belief); a density operator | temperature, stress, a flux; the electromagnetic potential; rock, water, air; a body's pose in $SE(3)$; grains, a posterior; a qubit |
| **process**, how it changes | an action or a balance law; a constitutive relation; an interface relation; a jump (a guard and a reset, or a point process in time); a reaction network (stoichiometry and rates) | the equations of motion; Fourier's law; continuity of traces; a collision, an earthquake, a flare; combustion, a phase change |

The five kinds above are points in this product: material domains are labels on regions with the stratification (§1.2, §4); continuous fields are quantities and forms on regions; distribution functions are densities on phase space or on the radiation bundle; discrete objects are configurations on worldlines or counting measures; interactions and events are processes. Nothing is lost, and what the old rows kept apart only by name (a radiation spectrum and a temperature field) is now apart by a property that matters to the computation: the base on which the field must be stored and integrated.

*Rationale.* The axes are those an instrument pairs with (§8.5). A point probe evaluates a section at a point, the de Rham pairing of a 0-chain with a 0-form; a footprint pairs a weighted $k$-chain with a $k$-form (§3.4); a line of sight integrates the radiance over a cone of directions at the aperture, a point of the base and a solid angle of the fibre; a counter evaluates a counting measure on a window $A\times[t,t+\Delta t]$; an event detector observes the jumps; a quantum measurement applies the Born rule to the state in the fibre. A classification of phenomena that did not say what chain an instrument can pair with would not tell an observation operator what to compute.

The first slice's phenomena are, in these terms: the standard atmosphere (pressure, temperature and density, 0-forms on the region above the geoid, functions of geopotential height alone; meteorology `atmosphere`); gravity (the 1-form $-dU$: WGS 84's normal gravity on the Earth, geodesy `gravity`, a rotating point mass elsewhere); the geomagnetic field (WMM2025, $B=-\nabla V$ on the region from 1 km below to 850 km above the ellipsoid; geophysics `geomagnetism`); sunlight (the radiance of the solar disc, integrated over it at an aperture); the solar wind (density and bulk speed, the first moments of its distribution on phase space, observed at L1 by SWPC); the planetary $K$ index (a quantity on time alone); earthquakes and solar flares (marked point processes on $M\times\mathbb T$ and on $\mathbb T$, marked by magnitude and class); satellites (configurations on worldlines, by SGP4).

### 3.6 The Visual Expression of Phenomena

A second classification offers itself for how phenomena are drawn: surfaces (the ground, terrain, boundaries), volumes (fluids, the distribution of a component, volume data), fields (colour maps, vectors, tensors, streamlines), waves and signals (amplitude, wavefronts, phase, spectra), and particles and objects (entities and their trajectories). Its premise is right and is kept: one phenomenon has several drawings. Its rows, like those of §3.5, answer different questions. "Surface" and "volume" name the base a drawing lies on; "field" names the channels of a fibre (a colour, an arrow, an ellipsoid, a curve); "particle and object" names a base (worldlines) together with a fibre (a pose, a counting measure); "wave and signal" names a process (a wavefront is a level set of a phase that moves in time) and a base (a signal is a field on time alone, a spectrum a field on frequencies). The magnetic field shows why the rows cannot be kinds: this slice draws it as curves through the volume about the Earth, as a colour on the Moon's surface and as a needle at a point, and it belongs to none of the rows more than to the others.

A drawing is therefore not a kind of phenomenon but a composite map from the phenomenon to marks.

**Definition 3.10 (a visual expression).** A visual expression of a phenomenon of kind (base $B$, fibre $F$, process) is a composite $\mathsf V=\mathsf M\circ\rho\circ r$ of:

1. a *restriction* $r$ of the section to a sub-base $B'\to B$ on which it is drawn: the trace on a surface (the crust's field on the Moon's sphere, the temperature of the sea surface), a slice, a curve, a point, a worldline, or $B$ itself;
2. a *reduction* $\rho\colon F\to F'$ of the fibre to what is shown: a norm ($\lvert B\rvert$), a component in a named frame ($B_r$; north, east and down), a moment or a marginal of a distribution (the solar wind's density and bulk speed from its distribution on phase space), an integral over the fibre's directions (the irradiance from the radiance), or the identity;
3. a *mark* $\mathsf M$, whose geometry is decided by $B'$ and whose channels by $F'$.

| Sub-base $B'$ | Geometry of the mark |
|---|---|
| a point, at an instant | a glyph, a gauge, a needle on a rose |
| a worldline | a moving glyph and its trail; the path |
| time alone | a strip (a time series); a lamp where a threshold is crossed |
| a curve | a line, coloured along its length |
| a surface (a 2-stratum: the ground, an interface) | a drape on the surface, or a displacement of it (relief) |
| a region | slices and their drapes; isosurfaces; integral curves through it; volume rendering |
| the radiation bundle at an aperture | an image (the sky, a camera's frame): the directions of the fibre become the picture's pixels |
| phase space, frequencies | a reduction first (a moment, onto the region), or a chart of their own (a spectrum's plot) |
| an abstract carrier (§11) | a drawing of the complex: its cells, nodes and edges |

| Fibre $F'$ | Channels |
|---|---|
| a scalar | colour: sequential, one hue from light to dark; diverging about a natural zero, two hues and a clear or neutral middle; logarithmic where the values span decades |
| a vector | integral curves (field lines, streamlines), arrows, or the line-integral convolution of a texture along the field |
| a symmetric tensor | its principal axes: ellipsoids, or the integral curves of its largest eigenvector |
| a label | a categorical hue or a texture, never ordered |
| a configuration ($SE(3)$) | the body's shape, posed |
| a counting measure | points; in its kinetic limit, a density |
| a density operator | a point of the Bloch ball for a qubit; the moduli and phases of a matrix otherwise |

| Process | Expression |
|---|---|
| a law of motion | the world's instant, moved by the mission clock; trails |
| a jump (a point process) | a mark at the event's place and instant, a lamp, a line among the messages: never a frame of animation alone, which a reader would miss |
| a propagation (a wave) | the level sets of a phase, moving (wavefronts); at a point, its signal; on frequencies, its spectrum |
| a reaction network | its graph, with the flux on its edges |

*Remark (invariance).* A drawing is the same in every frame exactly when its reduction is an invariant ($\lvert B\rvert$, a temperature) or names its frame (a component), and its restriction is carried by the frame change: this is §6.2's "observables are invariants" for pictures. A component is never drawn without its frame.

*Rationale.* The split is the representation layer's (the infrastructure's [visualization](https://github.com/huangwanhong-maker/The-Science-Infrastructures/tree/main/visualization): a device-neutral scene, and a renderer for each technique): the restriction and the reduction are computation, the engine's, and travel as data with their units and frames (the field map restricts $B$ to the sphere and reduces it to $\lvert B\rvert$ or $B_r$; the field lines integrate $B/\lvert B\rvert$); the mark is a renderer's. A new renderer changes the marks, not the expressions.

*Remark (hue and provenance).* The console reserves three families of hue for provenance (Definition 8.7). Where a field is drawn in colour its hue may be its provenance's and its magnitude carried by lightness and opacity: the Earth's field lines are modelled and drawn in the modelled blue; the Moon's crust is assimilated and drawn in gold, logarithmic from 1 nT, clear where the crust is weakly magnetised. Its diverging radial component takes orchid for the inward half, which is no provenance's hue.

The slice's expressions, in these terms: the Earth's field lines ($B'$ the region from 100 km above the ground to six Earth radii, $F'=B$, integral curves); the Moon's crust ($B'$ the sphere of 1737.4 km, $F'=\lvert B\rvert$ or $B_r$, a drape); the compass ($B'$ a point, $F'$ the bearing of the horizontal field, a needle on a rose, and outside its coverage no needle but the reason); the body's north at the centre of the view (a point, the meridian's direction, projected: a needle); the space weather ($B'$ time alone, gauges) and its events (lamps and messages).

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

### 8.5 Instruments as Kernels: Coverage and Provenance

Definition 8.2 says what one sensor measures. A world has many, of hundreds of makes, and it needs their common structure: what kind of operator each is, where and when it can measure, and what kind of evidence its readings are.

**Definition 8.5 (family, sensor, reading).** An *instrument family* is $\mathsf F=(\mathsf H,m,\mathcal Q,C,\mathcal A)$: a kernel $\mathsf H$ of Table 8.1, the observation operator's form; a model $m$ of the world that it reads (a domain's: WMM2025, the 1976 standard atmosphere, WGS 84's normal gravity, DE440, SGP4); its quantities $\mathcal Q$ with their units; a declared cost $C$, in seconds of the wall per reading; and its *coverage* $\mathcal A\subseteq\mathcal E$, the events at which $m$ is valid and its data exist (WMM2025: on the Earth, from 1 km below to 850 km above the ellipsoid, from 2025.0 to 2030.0). A *sensor* is a family mounted, $k=(\mathsf F,\mu,\tau)$: a mount $\mu$, an address of §2.5 or a worldline (the observer's place, a satellite by its NORAD number through SGP4), and a timing $\tau$: a clock (the world's or the wall's), a period $T_k$, a relative deadline $D_k$, a criticality $\chi_k\in\{0,1,2,3\}$ (display, science, mission, safety) and optionally a server (§8.6). Its reading at its $n$-th tick $t_n$ is
$$
y_{k,n}=\begin{cases}\mathsf H_m\big(\Sigma(t_n),\ \mu(t_n),\ \varepsilon_{k,n}\big)&\text{if }(\mu(t_n),t_n)\in\mathcal A,\\[2pt] \bot_{r}&\text{otherwise,}\end{cases}
$$
with $\Sigma(t)$ the world's committed snapshot at $t$ (§8.2), $\mu(t)$ the mount's place, $\varepsilon_{k,n}$ its noise, and $\bot_r$ no reading, with the reason $r$ ("WMM works on or near the Earth, not the Moon"): never a zero (§3.2).

**Table 8.1. The kernels of observation.**

| Kernel | Observation operator | Instruments |
|---|---|---|
| point probe | $y=\varphi(x(t))+\varepsilon$ | thermometers, barometers, magnetometers, gravimeters; an ideal numerical probe |
| footprint | $y=\int_D w\,\varphi\,d\mu+\varepsilon$ | a pixel's footprint, a sampler's volume, a conductivity cell, a radiosonde's column |
| line of sight | $y=\int_{\text{aperture}}\int_{\text{cone}}L(x,\hat n,\nu)\,R(\hat n,\nu)\,d\Omega\,d\nu$ | Sun sensors, star trackers, cameras, radiometers, spectrometers, telescopes |
| ranging | $y=\lvert x-x_e\rvert+c\,\delta t+\text{delays}+\varepsilon$ | GNSS, laser and radio ranging, radar, lidar, sonar, Doppler |
| counter | $N\sim\mathrm{Poisson}\big(\int A\,\eta\,\Phi\,dt\big)$ | Geiger counters, photon counters, particle detectors, rain gauges |
| event detector | an event when a guard $g(\text{state})=0$ is crossed | threshold alarms, impact switches, seismic triggers |
| proprioceptive | $y=h(q,\dot q,a)$ of the agent's own state | inertial units, encoders, the true position |
| clock | $c(t)=t+b+d\,(t-t_0)+\varepsilon$ | atomic clocks, a host's clock against NTP, the time scales |
| protocol | a hybrid automaton of stages with latencies, ending in a result | mass spectrometers, sequencers, a laboratory analysis |
| quantum | $P(y)=\operatorname{tr}(\rho\,M_y)$ for a POVM $\{M_y\}$ | qubit readout, photon statistics, state tomography |
| estimator | $\hat y$, an estimate from other readings and a model | a Kalman filter, a fused navigation solution, an analysis |
| feed | readings delivered by another system; only their timing and coverage are modelled | space-weather services, seismic catalogues, a station's logger |

*Remark (no class per instrument).* An instrument is not a subclass of a sensor class. A fluxgate, a SQUID and an NV-centre magnetometer are one point probe of $B$ with different noise spectra, bandwidths and ranges: parameters of a family, which is data in a registry. A class is warranted where the observation operator differs, twelve times, and not where the device's make differs, some hundreds of times; inheritance by make would multiply the classes by the encyclopedia's rows and tie every operator to a device. The encyclopedia of instruments is mapped onto the kernels in [instruments.md](instruments.md). The kernels are what Definition 3.9 says an instrument can pair with: a point, a weighted chain, a cone of directions, a window of a counting measure, the jumps, a state.

**Proposition 8.6 (determinism of the readings).** Let the snapshot $\Sigma(t)$ be a function of $t$ alone, the mount's place $\mu(t)$ a function of the mount and $t$, and the noise $\varepsilon_{k,n}$ the output of a counter-based generator at the counter $(\text{seed},\kappa(k),n)$, with $\kappa(k)$ a hash of the sensor's name. Then $y_{k,n}$ is a function of the world, the seed, $k$ and $n$: it does not depend on the order in which the jobs run, on the number of threads, or on the wall clock.

*Proof.* $\mathsf H_m$ is a pure function of its arguments. What instruments share within a snapshot (the Sun's place, a constellation's states) is computed once, under a lock, and never changed, so its value does not depend on which job computed it; mounts are resolved before the jobs are dispatched, and nothing writes them during dispatch; and a counter-based generator's output at a counter does not depend on any other draw (Philox4×32-10, Salmon, Moraes, Dror and Shaw 2011; calx `random`). $\square$

This is the property the timing of §8.6 is built on: timing is measured on the host's operating system and may vary from run to run, while values do not.

**Definition 8.7 (provenance).** Every reading carries one of five provenances, which refine the channels of §9: *physical* (an instrument of the world, read now) and *archive* (a measurement recorded in a dataset) are observed; *model* is modelled; *assimilated* is reconstructed (an estimate joining observations and a model); *synthetic* is modelled by statistics without a physical law (a procedural terrain, a stochastic generator). A reading's provenance never changes by its being drawn, combined or zoomed; an estimator's reading is assimilated whatever its inputs were. The console draws the three channels in three hues, validated for the colour-vision deficiencies, and the subclasses by glyph (archive, synthetic), so that colour is never the only cue.

**Definition 8.9 (the envelope of a reading).** Besides its values and their units, every reading carries: its *measurement*, $k@n$, the sensor and its tick; its *interval*, the instant $t_n$ or the window it integrates over; its *frame*, the frame its components are given in, where they are components; its *support*, the chain it pairs with (a point, a region, a cone, the paths of a ranging, a window, a guard, the agent's own state, an instant, a sample, a state, other readings: one for each kernel); its *snapshot*, the key of $\Sigma(t_n)$, absent for a physical reading; its *interaction*; its provenance; and its *quality* $q\in\{\text{valid},\text{outside},\text{missing},\text{invalid}\}$:

- *outside*: $(\mu(t_n),t_n)\notin\mathcal A$; the quantity has no value there for the model (WMM on the Moon, salinity in the air), as opposed to the value zero (§3.2);
- *missing*: inside the coverage, but the model's data are not on this computer;
- *invalid*: inside the coverage, but the operator is ill-posed there. A compass reads the direction of the horizontal field $H$, and an error $\delta H_\perp$ across it turns the needle by $\delta D\approx\delta H_\perp/H$, without bound as $H\to0$; WMM declares a compass unreliable where $H<2000$ nT, the blackout zones about the magnetic poles, and to be used with caution below 6000 nT (Chulliat et al. 2025, §1.8). The compass answers *invalid* in the first, and reads with a caution in the second.

*Remark (observation may change the world).* A kernel of Table 8.1 maps the world to a reading and leaves the world as it was. An active or invasive instrument changes it: radar and sonar emit, a probe loads what it touches, an assay consumes its sample, a measurement changes a quantum state. The general form is an *instrument* in the sense of Davies and Lewis (1970): a map from the world's state to a joint law of an outcome and a state after the measurement. Classically it is a Markov kernel $K(dy,dx'\mid x)$, with $x'=x$ for a passive instrument; quantum mechanically it is a completely positive instrument $\{\mathcal I_y\}$, with $P(y)=\operatorname{tr}\mathcal I_y(\rho)$ and the state $\mathcal I_y(\rho)/P(y)$ after it (Ozawa 1984). In the world system of §5.4 such an instrument is a component with a port (§8.1), coupled to the fields it emits into or touches. Every family declares its interaction (passive, active, contact, destructive, or mixed where its makes differ), and no instrument of this slice acts back on the world.

**The encyclopedia's families, declared.** The engine writes a class for each kernel, from which each family with a model derives, and declares every family of the encyclopedia beside them: its kernel class, what it reads (base · fibre), its observables, its interaction and its temporal behaviour, generated from [the encyclopedia](encyclopedia-of-instruments.md) and [instruments.md](instruments.md). A declared family without a model is refused when it is mounted, and says so; it yields no reading, so that no value appears without a model behind it.

### 8.6 The Timing of Acquisition

**Two clocks.** The *world's clock* reads TT, $t=t_0+r\,(w-w_0)$ in wall time $w$, at any real rate $r$: real time, faster, backwards, or held ($r=0$); the server keeps it, and every page and every instrument reads the same one. The *wall's clock* is the host's UTC, disciplined by NTP. A sensor ticks on one of them: a virtual instrument on the world's ($t_n=nT_k$), a physical feed on the wall's ($w_n=nT_k$).

**Release.** At each step of the runtime (every $\Delta=0.25$ s of the wall) a sensor whose tick index $n=\lfloor x/T_k\rfloor$ has changed since its last release is released once, at the latest tick; the ticks passed over are counted as *skipped*, since a reading of a past tick would be stale when it was made, and a newer release of a sensor supersedes an older one still waiting. A job is $J=(r_J,\ d_J=r_J+D_k,\ C_k,\ \chi_k)$, its release $r_J$ the wall instant at which the world reached $t_n$ (or the step's instant, if later).

**Events.** What happens by itself (a flare's class crossing a threshold, a new earthquake) is published at once as an event: it is not a job and takes nothing from the workers. An event may *trigger* sensors, which are released at once, at the event's instant, without waiting for their tick; their deadlines are counted from then.

**Admission and degradation.** At rate $r$ a world-clock sensor's period on the wall is $T_k/|r|$, and the declared set's demand is tested by the processor-demand criterion (Baruah, Rosier and Howell 1990), $\mathrm{dbf}(L)\le mL$ for all $L$ up to the busy period, on one processor $m$ times as fast as a worker. *Caveat.* For $m$ workers scheduled globally this test is necessary and not sufficient (Dhall and Liu 1978), so the declared utilisation is held below a target of $0.8\,m$ as a margin. Above the target, the periods are stretched by elastic compression (Buttazzo, Lipari, Caccamo and Abeni 2002): each sensor's utilisation gives up its share of the excess in proportion to an elasticity, which is 0 for safety (rigid), 0.25 for mission, 1 for science and 4 for display. A compressed period is rounded up to a whole number of ticks, so that a degraded sensor still reads on its clock's ticks, every $d$-th.

**Dispatch.** Released jobs wait in a backlog ordered by the session's policy: EDF, earliest absolute deadline first, which is optimal for feasibility on one processor (Dertouzos 1974); fixed priorities by criticality, optionally with aging; or FIFO. They run without preemption on the pool's workers (calx `dispatch`), at most $\beta m\Delta$ of declared work per step ($\beta=0.6$), the rest waiting for the next step. Jobs that wait on the network (the feeds, NTP, the terrain) are run by the server's I/O workers within a constant bandwidth server ($Q=2$ s every $T=10$ s; Abeni and Buttazzo 1998).

**Proposition 8.8 (no starvation).** (a) Under fixed priorities with aging of step $a$, a job's effective priority is $\chi_J+\lfloor(w-r_J)/a\rfloor$; a job of criticality $\chi$ reaches the highest level after $(\chi_{\max}-\chi)\,a$, after which it waits only for the jobs ahead of it at that level, which are finitely many when that level's load is below capacity. (b) A class of jobs given to a constant bandwidth server $(Q,T)$ receives at most $Q$ of a worker in every $T$, whatever it asks for, so a storm of events cannot take the periodic sensors' share: on one processor under EDF they meet their deadlines if $\sum_iC_i/T_i+\sum_sQ_s/T_s\le1$.

*Proof.* (a) The effective priority is unbounded in the waiting time, and ties at a level are broken by release. (b) Abeni and Buttazzo (1998), Lemma 1 and Theorem 1: a server's jobs are given deadlines that are postponed by $T$ each time its budget $Q$ is spent, so its demand in any interval of length $L$ is at most $\lceil L/T\rceil Q$. $\square$

calx's checks hold both against the simulation: a low job beside a full stream runs, with aging of step 1, when its level has risen to the stream's; a server's stream receives at most $Uh+Q$ of the processor in $h$, and without the server the same stream makes the hard tasks miss.

**What is not guaranteed.** The runtime runs on a general-purpose operating system (Windows on the development machine, Linux on the server). The dispatcher's order is exact in logical time, but whether another process takes a worker's processor is the kernel's decision. The session therefore asks the kernel which real-time classes it would grant (Linux's SCHED_FIFO and SCHED_DEADLINE, each tried on a thread of its own and given back), reports the answer and the reason for a refusal, and, if the policy asks for it, raises its workers to SCHED_FIFO (calx `scheduler/kernel.hpp`). WSL 2 refuses both: the process lacks CAP_SYS_NICE and its RLIMIT_RTPRIO is 0, and the Linux kernel there is itself scheduled by Windows. Without a real-time class on a preemptible kernel the timing is measured, not bounded: each sensor's lateness is counted, and every job's start and end are kept and drawn. The values do not depend on the timing (Proposition 8.6). A deterministic simulation of the declared set (calx `simulate`) gives each policy's schedule in logical time, which is what the policies are compared on.

*Remark (utility).* Choosing *which* observations are worth making (by their information about a quantity, the age of what is known of it, their cost) is a question of experimental design, with an answer in expected information gain (Lindley 1956; Chaloner and Verdinelli 1995) and in the age of information (Kaul, Yates and Gruteser 2012). It belongs to the planner that declares the sensors' periods and criticalities, at the pace of the science; the dispatcher's order is kept to policies that can be analysed. Decision [0004](../development/decisions/0004-instruments-and-their-acquisition.md) gives the reasons, against the design of a scheduler driven by a weighted utility.

### 8.7 A Field Known in Part: Unresolved Scales and External Forcing

The Moon's magnetometer is the slice's reading of a field known only in part. The Moon has no dynamo; the field at its surface is $B=B_{\text{crust}}+B_{\text{ext}}$, the remanence of its crust and the field the solar wind carries past it.

The model of this section is the planetary-science domain's (its module `magnetism` and [its theory note](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/domains/planetary-science/theory/magnetism.md)); the methods are physis's; the reading is the work's.

**The crust.** T2015_449 is the crust's internal potential to degree 449 on a sphere of 1737.4 km: Tsunakawa et al. (2015)'s surface vector mapping of the magnetometers of Kaguya and Lunar Prospector, expanded by Wieczorek (2018). It is an assimilated model, the best estimate of the potential to its degree, and resolves scales of about $\pi a/449\approx12$ km; the field at the surface also has finer ones. The expansion holds outside the sources, and continued downward it would amplify the scales it cannot resolve by $(a/r)^{n+2}$: a mount on low ground below the sphere (the maria lie kilometres below it) reads the model's field at the sphere above it, and its reading says so.

**Definition 8.10 (the spectral law).** The Lowes–Mauersberger spectrum of an internal potential at radius $a$ is $R_n=(n+1)\sum_{m=0}^n(g_{nm}^2+h_{nm}^2)$ (Lowes 1966). Its *spectral law* on a band $[n_1,n_2]$ is $\hat R_n=A\,n^{\beta}\rho^{2n}$, fitted by least squares to $\log R_n=\log A+\beta\log n+2n\log\rho$. A field continued upward by a depth $d$ is attenuated by $((a-d)/a)^{2n}$ at degree $n$, so for sources at a depth $d$ below the sphere the factor $\rho^{2n}$ gives $d=a(1-\rho)$ (Voorhies, Sabaka and Purucker 2002, whose law for a random layer of dipoles has this form). On $[30,250]$, T2015_449 gives $\beta=2.04$, $\rho=0.99621$ and $d=6.6$ km: an effective depth, of the sources and of the model's regularisation together, not a measured one.

**Definition 8.11 (the unresolved part).** Let the prior of the coefficients be isotropic and Gaussian with the law's power: $g_{nm},h_{nm}\sim\mathcal N(0,s_n^2)$ independently ($h_{n0}=0$), with $(n+1)(2n+1)s_n^2=\hat R_n$. The model is the posterior mean given the data, $\bar g=\mathbb E[g\mid\text{data}]$, and by the law of total variance the power it leaves to the residual $g-\bar g$ is, on average over the data, $\hat R_n-\mathbb E[R_n^{\text{model}}]$. The unresolved part is drawn as
$$
u_{nm}\sim\mathcal N\big(0,\sigma_n^2\big),\qquad \sigma_n^2=\frac{\max\big(0,\hat R_n-R_n^{\text{model}}\big)}{(n+1)(2n+1)},\qquad 1\le n\le N,
$$
with $R_n^{\text{model}}=0$ above the model's degree, from a counter-based stream at the key (seed, Moon) (physis `analysis/random_field.hpp`). By default $N=720$; it adds at the model's highest degrees the power their regularisation removed, and above them the law's whole power.

**Proposition 8.12.** The drawn part's expected spectrum is $\mathbb E[R_n(u)]=\max(0,\hat R_n-R_n^{\text{model}})$ at every degree, and a draw is a function of the seed alone.

*Proof.* $\mathbb E[R_n(u)]=(n+1)\big(\mathbb E u_{n0}^2+\sum_{m=1}^n(\mathbb E u_{nm}^2+\mathbb E v_{nm}^2)\big)=(n+1)(1+2n)\sigma_n^2$. The stream's output at a counter does not depend on any other draw (Proposition 8.6). $\square$

*Caveat.* The prior is stationary and isotropic. The Moon's crust is neither: its anomalies cluster (about the South Pole–Aitken basin, at the swirls). The drawn part therefore says how much finer structure there is and of what spectrum, not where it is. Its provenance is *synthetic*, and every reading says so.

**The solar wind.** The external part is the interplanetary field measured at L1 (SWPC's real-time magnetometer, one-minute values in GSE axes), carried ballistically to the Moon at the solar wind's speed. By Taylor's frozen-in hypothesis the field is advected unchanged: $B_{\text{ext}}(x,t)=B_{L1}\big(t-(x_{L1}-x_\parallel)/v\big)$, with $x_\parallel$ the Moon's place along the Sun–Earth line and $x_{L1}=1.5\times10^9$ m, a travel of about an hour. Inside the Earth's magnetotail, taken as a cylinder of 25 Earth radii on the night side, there is no solar wind and the part is left out, with the reason. *Caveat.* Ballistic propagation ignores the tilt of the field's phase fronts, which moves the arrival by minutes (Mailyan, Munteanu and Haaland 2008). The Moon's wake and the plasma's interaction with the strongest anomalies, whose fields stand off the solar wind above Reiner Gamma (Lue et al. 2011), are not modelled. The magnetotail's shape is a cylinder only to first order. This part's provenance is *physical*, the crust's is *assimilated*, and the reading lists the provenance of each.

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
| 2.6 one parse, one canonical text | addresses of every form read and printed canonically; a syntax error located at its column with what was expected | S |
| 2.7 every answer is an address of the event | the Eiffel Tower answered in the ICRS, galactic, ecliptic, Earth–Moon rotating, TEME and galactocentric frames and read back, within 1 mm (within $10^5$ m from the Galaxy's centre); a step by azimuth, elevation and range from the Louvre reaching the tower within 1 mm; galactocentric coordinates against astropy to $10^{-15}$ | S |
| 2.9 holonomy | the CIO and equinox routes to the ITRS within 1 mas; DE440's Moon and the IAU's within arcseconds; GMST 1982 against IAU 2006 by tens of mas | S |
| 2.2 kinematics of a frame change | a point in a rotating frame: velocity and acceleration against the closed form; the round trip of a chain of three frames to $10^{-12}$ m at 10 m | 0 |
| 3.6 $dd=0$, Stokes | on every cellulation the engine builds (boxes, spheres, shells, terrains, glued complexes) | 0 |
| 3.8 Hodge decomposition | the Helmholtz projection of a flow on a basin with islands: the harmonic part's dimension equals the number of islands | 3 |
| 5.3 exact discrete balance | heat in a box: the total energy's change equals the boundary flux to rounding; the sine mode against $T_b+Ae^{-\lambda t}\sin(\pi x/L)$ at second order in $h$ | 0 |
| 5.6 exact interface conservation | two boxes glued on a face: the interface residual zero to rounding at every macro step, with unequal micro steps | 1 |
| 6.2 conservative transfer | a density transferred to a refinement keeps its total; the flux through an interface cellulated twice differs by the quadrature error alone | 1 |
| 7.2 harmonic expansion | the Moon's gravity from GRGM1200A at degree 2 against the closed form of $J_2$; Laplace's equation of the evaluated potential to rounding | 2 |
| 7.4 configuration variety | a four-bar linkage: one degree of freedom; its singular configurations found by the rank of $J$ | 2 |
| 7.5 constrained dynamics | a pendulum as a constrained particle: the constraint kept to $10^{-12}$ over $10^5$ steps by projection; the energy's drift bounded | 2 |
| 8.6 determinism of the readings | two sessions with one seed give the same GNSS solution at a tick, and a third with another seed another | S |
| 8.12 the unresolved part | T2015_449's field at five mounts on and above the Moon against pyshtools to $10^{-7}$ of $\lvert B\rvert$; the finer scales a function of the seed; the spectral law recovered from a synthetic spectrum exactly, and from a random field within four standard errors (physis `check_analysis`) | S |
| 8.9 the envelope | every reading names its measurement, interval, frame, support, snapshot and interaction; a reading outside its coverage is *outside*; a compass in the blackout zone is *invalid*, with its reason; a declared family without a model is refused | S |
| 8.8 no starvation | aging lets a low job run beside a full stream at the predicted instant; a constant bandwidth server gives a stream at most $Uh+Q$, and without it the stream makes the hard tasks miss (calx `check_realtime`) | S |
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
| $\mathcal E$, $\psi$, $\ell_p$ | events; a chart; a step from the horizon at $p$ | — | navigation `Address`, `Event`, `resolve`, `express` |
| $U_e$, $\mathrm{hol}(\gamma)$, $\theta(\gamma)$ | a frame transport; a loop's holonomy and its angle | —, —, rad | physis `FrameGraph`; navigation `Catalogue::holonomies` |
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
| $\mathsf F=(\mathsf H,m,\mathcal Q,C,\mathcal A)$ | an instrument family: kernel, model, quantities, cost, coverage | —, —, —, s, — | `InstrumentInfo`, `Kernel`, `Coverage` |
| $(T_k,D_k,\chi_k)$, $r_J$, $d_J$ | a sensor's period, deadline and criticality; a job's release and absolute deadline | s, s, —; s, s | `SensorSpec`; calx `Job`, `PeriodicTask` |
| $(Q,T)$ | a constant bandwidth server's budget and period | s, s | calx `ConstantBandwidthServer` |
| $q$ | a reading's quality: valid, outside, missing, invalid | — | `Quality` |
| $R_n$, $\hat R_n=A\,n^\beta\rho^{2n}$, $d$ | the Lowes–Mauersberger spectrum, its law, the sources' depth | T², T², m | physis `lowes_spectrum`, `SpectralLaw`, `SpectralLaw::depth` |
| $\sigma_n^2$, $u_{nm}$ | the unresolved part's variance and coefficients | T² | physis `unresolved_spectrum`, `unresolved_part` |
| $\mathsf V=\mathsf M\circ\rho\circ r$ | a visual expression: mark, reduction, restriction | — | the page's layers (`fields.js`) |
| $\xi$, $\hat\vartheta$, $u_k$ | controller memory, estimates, commands | — | `Controller` |
| $Q=V(I)$, $\Sigma$ | configuration variety, singular locus | — | `Mechanism` |
| $\mathcal S$, $\mathcal E$ | scenario, experiment | — | `Scenario`, `Experiment` |
| $\mathcal H_\ell$, $C_{\ell m},S_{\ell m}$ | harmonic polynomials of degree $\ell$; gravity coefficients | — | physis `gravitation` (planned) |

## 14. References

- Abeni, L. and Buttazzo, G. (1998), Integrating multimedia applications in hard real-time systems, *Proceedings of the 19th IEEE Real-Time Systems Symposium*, 4–13.
- Aho, A. V., Lam, M. S., Sethi, R. and Ullman, J. D. (2006), *Compilers: Principles, Techniques, and Tools*, 2nd ed., Addison-Wesley.
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
- Baruah, S. K., Rosier, L. E. and Howell, R. R. (1990), Algorithms and complexity concerning the preemptive scheduling of periodic, real-time tasks on one processor, *Real-Time Systems* 2, 301–324.
- Bennett, M. and Bovy, J. (2019), Vertical waves in the solar neighbourhood in Gaia DR2, *Monthly Notices of the Royal Astronomical Society* 482, 1417–1425.
- Buttazzo, G. C., Lipari, G., Caccamo, M. and Abeni, L. (2002), Elastic scheduling for flexible workload management, *IEEE Transactions on Computers* 51, 289–302.
- Chaloner, K. and Verdinelli, I. (1995), Bayesian experimental design: a review, *Statistical Science* 10, 273–304.
- Dertouzos, M. L. (1974), Control robotics: the procedural control of physical processes, *Information Processing 74*, North-Holland, 807–813.
- Dhall, S. K. and Liu, C. L. (1978), On a real-time scheduling problem, *Operations Research* 26, 127–140.
- Drimmel, R. and Poggio, E. (2018), On the solar velocity, *Research Notes of the AAS* 2, 210.
- Everitt, C. W. F. et al. (2011), Gravity Probe B: final results of a space experiment to test general relativity, *Physical Review Letters* 106, 221101.
- Gravity Collaboration (2018), Detection of the gravitational redshift in the orbit of the star S2 near the Galactic centre massive black hole, *Astronomy and Astrophysics* 615, L15.
- Kaul, S., Yates, R. and Gruteser, M. (2012), Real-time status: how often should one update?, *Proceedings of IEEE INFOCOM 2012*, 2731–2735.
- Kogut, J. B. (1979), An introduction to lattice gauge theory and spin systems, *Reviews of Modern Physics* 51, 659–713.
- Lindley, D. V. (1956), On a measure of the information provided by an experiment, *Annals of Mathematical Statistics* 27, 986–1005.
- Liu, C. L. and Layland, J. W. (1973), Scheduling algorithms for multiprogramming in a hard-real-time environment, *Journal of the ACM* 20, 46–61.
- Chulliat, A. et al. (2025), *The US/UK World Magnetic Model for 2025–2030: Technical Report*, NOAA National Centers for Environmental Information.
- Davies, E. B. and Lewis, J. T. (1970), An operational approach to quantum probability, *Communications in Mathematical Physics* 17, 239–260.
- Lowes, F. J. (1966), Mean-square values on sphere of spherical harmonic vector fields, *Journal of Geophysical Research* 71, 2179.
- Lue, C., Futaana, Y., Barabash, S., Wieser, M., Holmström, M., Bhardwaj, A., Dhanya, M. B. and Wurz, P. (2011), Strong influence of lunar crustal fields on the solar wind flow, *Geophysical Research Letters* 38, L03202.
- Mailyan, B., Munteanu, C. and Haaland, S. (2008), What is the best method to calculate the solar wind propagation delay?, *Annales Geophysicae* 26, 2383–2394.
- Ozawa, M. (1984), Quantum measuring processes of continuous observables, *Journal of Mathematical Physics* 25, 79–87.
- Tsunakawa, H., Takahashi, F., Shimizu, H., Shibuya, H. and Matsushima, M. (2015), Surface vector mapping of magnetic anomalies over the Moon using Kaguya and Lunar Prospector observations, *Journal of Geophysical Research: Planets* 120, 1160–1185.
- Voorhies, C. V., Sabaka, T. J. and Purucker, M. (2002), On magnetic spectra of Earth and Mars, *Journal of Geophysical Research* 107, 5034.
- Wieczorek, M. A. (2018), Strength, depth, and geometry of magnetic sources in the crust of the Moon from localized power spectrum analysis, *Journal of Geophysical Research: Planets* 123, 291–316; the expansion T2015_449, Zenodo, doi:10.5281/zenodo.3873648 (CC BY 4.0).
- Planck Collaboration (2020), Planck 2018 results. I. Overview and the cosmological legacy of Planck, *Astronomy and Astrophysics* 641, A1.
- Rots, A. H. (2007), Space-Time Coordinate Metadata for the Virtual Observatory, version 1.33, IVOA Recommendation.
- Salmon, J. K., Moraes, M. A., Dror, R. O. and Shaw, D. E. (2011), Parallel random numbers: as easy as 1, 2, 3, *Proceedings of SC11*, 16:1–16:12.
- Soffel, M. et al. (2003), The IAU 2000 resolutions for astrometry, celestial mechanics, and metrology in the relativistic framework: explanatory supplement, *Astronomical Journal* 126, 2687–2706.
- Steele, G. L. and White, J. L. (1990), How to print floating-point numbers accurately, *Proceedings of PLDI '90*, 112–126.
- Wallace, P. T. and Capitaine, N. (2006), Precession-nutation procedures consistent with IAU 2006 resolutions, *Astronomy and Astrophysics* 459, 981–985.
