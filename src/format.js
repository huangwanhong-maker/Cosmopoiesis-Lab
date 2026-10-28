// Numbers, angles, lengths, times and text, as the console shows them.

export const DEG = Math.PI / 180;
export const J2000 = 2451545.0;
export const DAY = 86400;
export const AU = 149597870700;
export const PARSEC = (AU * 648000) / Math.PI;

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fmt(x, digits = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (typeof x !== 'number') return esc(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e7 || a < 1e-3)) {
    const [m, e] = x.toExponential(Math.max(1, digits)).split('e');
    return `${m}×10${superscript(e.replace('+', ''))}`;
  }
  return x.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const superscript = (s) => String(s).split('').map((c) => SUP[c] ?? c).join('');

// A length in a unit fitting its size.
export function length(m, digits = 3) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const a = Math.abs(m);
  if (a < 1e4) return `${fmt(m, a < 10 ? 2 : 1)} m`;
  if (a < 1e9) return `${fmt(m / 1e3, a < 1e5 ? 2 : 1)} km`;
  if (a < 0.1 * PARSEC) return `${fmt(m / AU, digits + 1)} au`;
  if (a < 1e3 * PARSEC) return `${fmt(m / PARSEC, digits)} pc`;
  return `${fmt(m / (1e3 * PARSEC), digits)} kpc`;
}

export function hms(rad) {
  let h = ((rad * 12) / Math.PI) % 24;
  if (h < 0) h += 24;
  const H = Math.floor(h), M = Math.floor((h - H) * 60), S = ((h - H) * 60 - M) * 60;
  return `${String(H).padStart(2, '0')}ʰ ${String(M).padStart(2, '0')}ᵐ ${S.toFixed(3).padStart(6, '0')}ˢ`;
}
export function dms(deg, positive = '', negative = '-') {
  const sign = deg < 0 ? negative : positive;
  const a = Math.abs(deg);
  const D = Math.floor(a), M = Math.floor((a - D) * 60), S = ((a - D) * 60 - M) * 60;
  return `${sign}${D}° ${String(M).padStart(2, '0')}′ ${S.toFixed(2).padStart(5, '0')}″`;
}
export const latText = (deg, d = 5) => `${Math.abs(deg).toFixed(d)}° ${deg >= 0 ? 'N' : 'S'}`;
export const lonText = (deg, d = 5) => `${Math.abs(deg).toFixed(d)}° ${deg >= 0 ? 'E' : 'W'}`;

// TT seconds from J2000.0 and the engine's text for them.
export const ttFromJd = (jd) => ((jd[0] - J2000) + jd[1]) * DAY;
export const ttText = (tt) => `JD ${(J2000 + tt / DAY).toFixed(10)} TT`;
export const mjdOfTt = (tt) => J2000 - 2400000.5 + tt / DAY;

// UTC of a TT instant, given TT − UTC (s): ISO text to the second.
export function utcIso(tt, ttMinusUtc = 69.184, seconds = 0) {
  const ms = (tt - ttMinusUtc) * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0);
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '—';
  const s = d.toISOString();
  return seconds ? s.replace('Z', '').replace('T', ' ') : s.slice(0, 19).replace('T', ' ');
}

// A duration in words fitting its size.
export function duration(s) {
  if (!Number.isFinite(s)) return '—';
  const a = Math.abs(s), sign = s < 0 ? '−' : '';
  if (a < 1) return `${sign}${(a * 1e3).toFixed(a < 0.01 ? 2 : 0)} ms`;
  if (a < 120) return `${sign}${a.toFixed(a < 10 ? 1 : 0)} s`;
  if (a < 7200) return `${sign}${(a / 60).toFixed(0)} min`;
  if (a < 3 * 86400) return `${sign}${(a / 3600).toFixed(1)} h`;
  if (a < 3 * 365.25 * 86400) return `${sign}${(a / 86400).toFixed(1)} d`;
  return `${sign}${(a / (365.25 * 86400)).toFixed(1)} yr`;
}

// The world clock's rate in words.
export function rateText(rate, running = true) {
  if (!running) return 'held';
  if (rate === 1) return 'real time';
  const a = Math.abs(rate), sign = rate < 0 ? '−' : '';
  const per = a >= 365.25 * 86400 ? `${fmt(a / (365.25 * 86400), 2)} yr` : a >= 86400 ? `${fmt(a / 86400, 2)} d` : a >= 3600 ? `${fmt(a / 3600, 2)} h`
    : a >= 60 ? `${fmt(a / 60, 2)} min` : `${fmt(a, 2)} s`;
  return `${sign}${per} per second`;
}
