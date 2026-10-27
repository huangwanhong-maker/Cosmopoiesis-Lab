---
title: Worlds on Generated Spacetimes
status: seed
date: 2026-10-28
related: [docs/formalism.md §11, physis quantum_gravity, physis spacetime, the Complex Atlas, ADR 0040]
---

# Worlds on Generated Spacetimes

## 1. Idea

The carrier of a world need not be given: physis generates discrete spacetimes from field theories (the 2-complexes of group field theories' Feynman graphs, random quadrangulations, melonic graphs, spin foams with Regge geometries, causal sets sprinkled into exact spacetimes), and the formalism puts fields, balance laws, connections and even agents on any cellulation. A *generated world* is a world whose space is a sample of a theory at a seed.

## 2. Questions

- **Dynamics on random geometry.** Diffusion on a melonic graph has the spectral dimension 4/3 of branched polymers, on a random quadrangulation 2 (the Brownian map's Hausdorff dimension is 4): what does a balance law conserve on them, what does a wave do, and what does an agent walking on one measure of its geometry through its sensors alone (formalism Proposition 6.1)?
- **The continuum limit as a chain of worlds.** A sequence of generated carriers of growing size is a chain of embeddings (formalism §10) only if there is a map between samples; the Cori–Vauquelin–Schaeffer bijection gives one for quadrangulations through their trees. Is there a refinement in the sense of Proposition 6.2 that commutes with d along it?
- **Matter and geometry together.** On a spin foam the lengths are the spins; a field whose action couples to them changes the amplitude: a world in which the geometry responds to its matter, the Einstein equations in their discrete form, summed by the Metropolis sampler physis already has.

## 3. Where It Would Go

The generated carriers are physis's as they are; the world on them is Cosmopoiesis's (`engine/carrier.hpp`, kind `generated`, and the page's Generation view); a result about the dynamics would be a research experiment under `experiments/`, and any general method it needs (a refinement of random geometries) physis `quantum_gravity`'s.
