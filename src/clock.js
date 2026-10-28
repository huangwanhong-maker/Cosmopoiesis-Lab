// The page's view of the mission clock (runtime.py, MissionClock): the world's instant in TT, held
// by the server so that every page and every sensor reads one clock.
//
// The server answers TT seconds from J2000.0 at a wall instant (Unix seconds), a rate and whether the
// clock runs. The page extrapolates: tt(now) = tt₀ + rate (now + offset − wall₀), with `offset` the
// server's wall less the page's, estimated from each answer's round trip as NTP does (the midpoint
// of the request and the answer; RFC 4330 §5), so that a page on another computer keeps the same
// instant. Commands (set, rate, play, pause, present) go to the server, and every page follows.
// The instant never runs backwards between two frames unless the clock is set or its rate is negative.

import { clockCommand, clockState } from './api.js';

export const RATES = [-86400, -3600, -60, 1, 60, 600, 3600, 21600, 86400, 7 * 86400, 30 * 86400, 365.25 * 86400];

export class MissionClock {
  constructor() {
    this.tt0 = 0;
    this.wall0 = Date.now() / 1000;
    this.rate = 1;
    this.running = true;
    this.offset = 0;       // the server's wall − the page's, s
    this.roundTrip = 0;    // s
    this.present = 0;      // the real present in TT at the last answer, s
    this.synced = false;
    this.listeners = new Set();
  }

  wallNow() { return Date.now() / 1000 + this.offset; }
  now() { return this.tt0 + (this.running ? this.rate * (this.wallNow() - this.wall0) : 0); }
  // How far the world's instant is from the real present (s).
  fromPresent() { return this.now() - (this.present + (this.wallNow() - this.presentWall || 0)); }

  adopt(s, sent, received) {
    const before = { tt: this.now(), rate: this.rate, running: this.running };
    if (sent !== undefined) {
      this.roundTrip = received - sent;
      this.offset = s.wall - (sent + received) / 2;
    }
    this.tt0 = s.tt_s;
    this.wall0 = s.wall;
    this.rate = s.rate;
    this.running = s.running;
    this.present = s.present_tt_s;
    this.presentWall = s.wall;
    this.synced = true;
    const jumped = Math.abs(this.now() - before.tt) > Math.max(2, Math.abs(this.rate) * 0.5);
    if (jumped || before.rate !== this.rate || before.running !== this.running) this.emit(jumped ? 'set' : 'rate');
  }

  async sync() {
    const sent = Date.now() / 1000;
    const s = await clockState();
    this.adopt(s, sent, Date.now() / 1000);
    return s;
  }

  async command(body) {
    const sent = Date.now() / 1000;
    const s = await clockCommand(body);
    this.adopt(s, sent, Date.now() / 1000);
    this.emit(body.action);
    return s;
  }
  set(tt) { return this.command({ action: 'set', tt_s: tt }); }
  setTime(text) { return this.command({ action: 'set', time: text }); }
  setRate(rate) { return this.command({ action: 'rate', rate }); }
  play(on = !this.running) { return this.command({ action: on ? 'play' : 'pause' }); }
  toPresent() { return this.command({ action: 'present' }); }

  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit(what) { for (const f of this.listeners) f(what, this); }
}
