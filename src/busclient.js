// The page's end of the bus of readings (runtime.py, Bus): the latest reading of every sensor and the
// events, followed by long polling (the server answers as soon as a reading arrives, or after ten
// seconds), so that a reading reaches the page within a round trip of its delivery.

import { bus, busLatest } from './api.js';

export class BusClient {
  constructor() {
    this.seq = 0;
    this.latest = new Map();
    this.events = [];
    this.listeners = new Set();
    this.ok = false;
    this.error = null;
    this.received = 0;
  }

  async start() {
    try {
      const snap = await busLatest();
      for (const [k, r] of Object.entries(snap.latest)) this.latest.set(k, r);
      this.events = snap.events || [];
      this.seq = snap.seq;
      this.ok = true;
      this.emit([...this.latest.values()]);
    } catch (e) {
      this.error = e.message;
    }
    this.loop();
  }

  async loop() {
    for (;;) {
      try {
        const a = await bus(this.seq, 10);
        const fresh = [];
        for (const r of a.readings) {
          if (r.event) { this.events.push(r); if (this.events.length > 200) this.events.shift(); }
          else this.latest.set(r.sensor, r);
          fresh.push(r);
        }
        this.received += fresh.length;
        this.seq = a.seq;
        this.ok = true;
        this.error = null;
        if (fresh.length) this.emit(fresh);
      } catch (e) {
        this.ok = false;
        this.error = e.message;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  get(sensor) { return this.latest.get(sensor) || null; }
  values(sensor) { return this.latest.get(sensor)?.values || null; }
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit(readings) { for (const f of this.listeners) f(readings); }
}

// The class of a reading's provenance as the console draws it: observed (a physical instrument now),
// archive (a recorded measurement), model, synthetic (made up, of a model's kind), assimilated.
export function provenanceClass(p) {
  return { physical: 'observed', archive: 'archive', model: 'model', synthetic: 'synthetic', assimilated: 'assimilated' }[p] || 'model';
}
export const PROVENANCE_WORDS = {
  observed: 'observed', archive: 'archive', model: 'model', synthetic: 'synthetic', assimilated: 'assimilated',
};
export function provenanceTag(p) {
  const c = provenanceClass(p);
  return `<span class="prov ${c}" title="${PROVENANCE_ABOUT[c]}"><i></i>${PROVENANCE_WORDS[c]}</span>`;
}
export const PROVENANCE_ABOUT = {
  observed: 'read now by a physical instrument (a device, a spacecraft, a network of stations)',
  archive: 'a measurement recorded in a dataset (terrain, Earth orientation)',
  model: 'computed by a model of the world (an ephemeris, SGP4, the standard atmosphere, WMM)',
  synthetic: 'made up with the right statistics, not measured nor modelled physically',
  assimilated: 'an estimate joining observations and a model',
};
