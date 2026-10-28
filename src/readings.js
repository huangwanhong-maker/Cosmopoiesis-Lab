// A reading as one reads it first (decision 0006): its main value with its unit, a few parts beside it,
// and where it was read. The instruments' displays (INSTR), the bus (BUS) and the environment (ENV)
// show the same reading the same way, so that a value found on one is recognised on the others. The
// machinery (the kernel, the family's key, the counters) is the inspector's, below the reading.
//
// Each family names its main quantity; a family not named here shows its first numeric quantities.

import { esc, fmt, latText, lonText, length, duration } from './format.js';

const nT = (t) => t * 1e9;

// family → (values) → { value, unit, parts: [[label, text]] }
const FAMILIES = {
  'magnetometer.wmm2025': (v) => ({ value: fmt(nT(v.total_T), 0), unit: 'nT', label: '|B|',
    parts: [['N', `${fmt(nT(v.north_T), 0)}`], ['E', `${fmt(nT(v.east_T), 0)}`], ['D', `${fmt(nT(v.down_T), 0)} nT`], ['decl.', `${fmt(v.declination_deg, 2)}°`], ['incl.', `${fmt(v.inclination_deg, 2)}°`]] }),
  'magnetometer.moon': (v) => ({ value: fmt(nT(v.total_T), 2), unit: 'nT', label: '|B|',
    parts: [['crust', `${fmt(nT(v.crustal_T), 2)} nT`], ...(v.small_scales_T !== undefined ? [['finer scales', `${fmt(nT(v.small_scales_T), 2)} nT`]] : []),
      ...(v.external_T !== undefined ? [['solar wind', `${fmt(nT(v.external_T), 2)} nT`]] : []), ['N, E, D', `${fmt(nT(v.north_T), 1)}, ${fmt(nT(v.east_T), 1)}, ${fmt(nT(v.down_T), 1)} nT`]] }),
  'compass.magnetic': (v) => ({ value: fmt(v.magnetic_north_deg, 2), unit: '° from true north', label: 'magnetic north',
    parts: [['dip', `${fmt(v.dip_deg, 2)}°`], ['H', `${fmt(nT(v.horizontal_T), 0)} nT`], ['zone', v.zone]] }),
  'atmosphere.ussa1976': (v) => ({ value: fmt(v.pressure_Pa / 100, 2), unit: 'hPa', label: 'pressure',
    parts: [['T', `${fmt(v.temperature_K, 2)} K`], ['ρ', `${fmt(v.density_kg_m3, 4)} kg/m³`], ['layer', v.layer]] }),
  'radiosonde.ussa1976': (v) => ({ value: fmt((v.levels?.height_m || []).length, 0), unit: 'levels', label: 'column',
    parts: [['from', `${fmt(v.ground_msl_m, 0)} m`], ['to', '86 km']] }),
  'gravimeter.body': (v) => ({ value: fmt(v.gravity_m_s2, 5), unit: 'm/s²', label: 'g',
    parts: [['deflection', `${fmt(v.deflection_deg * 3600, 2)}″`], ['model', v.model]] }),
  'sun.sensor': (v) => ({ value: v.elevation_deg !== undefined ? fmt(v.elevation_deg, 2) : fmt(v.disc_visible * 100, 1), unit: v.elevation_deg !== undefined ? '° elevation' : '% of the disc',
    label: 'Sun', parts: [['irradiance', `${fmt(v.irradiance_w_m2, 1)} W/m²`], ...(v.azimuth_deg !== undefined ? [['az', `${fmt(v.azimuth_deg, 1)}°`]] : []),
      ...(v.disc_visible < 0.999 ? [['seen', `${fmt(v.disc_visible * 100, 1)}%`]] : [])] }),
  'sky.bodies': (v) => {
    const up = (v.bodies || []).filter((b) => b.elevation_deg > 0);
    return { value: fmt(up.length, 0), unit: 'bodies above the horizon', label: 'sky', parts: up.slice(0, 4).map((b) => [b.body, `${fmt(b.elevation_deg, 0)}°`]) };
  },
  'gnss.receiver': (v) => {
    const n = Object.values(v.in_view || {}).reduce((a, b) => a + b, 0);
    return { value: fmt(n, 0), unit: 'satellites in view', label: 'GNSS',
      parts: v.fix ? [['PDOP', fmt(v.pdop, 2)], ['HDOP', fmt(v.hdop, 2)], ['fix error', `${fmt(Math.hypot(...(v.error_m || [0, 0])), 1)} m`]] : [['fix', v.reason || 'none']] };
  },
  'clock.scales': (v) => ({ value: String(v.utc || '').slice(11, 19), unit: 'UTC', label: 'time', text: true,
    parts: [['TAI − UTC', `${fmt(v.tai_minus_utc_s, 0)} s`], ['UT1 − UTC', `${fmt(v.ut1_minus_utc_s * 1e3, 1)} ms`], ['GPS week', fmt(v.gps_week, 0)]] }),
  'position.truth': (v) => (v.latitude_deg !== undefined
    ? { value: `${latText(v.latitude_deg, 4)}, ${lonText(v.longitude_deg, 4)}`, unit: '', label: 'place', text: true, parts: [['height', length(v.height_m)], ['on', v.body]] }
    : { value: length(Math.hypot(...(v.icrs_m || [0, 0, 0]))), unit: 'from the barycentre', label: 'place', parts: [] }),
  'clock.ntp': (v) => ({ value: fmt(v.offset_s * 1e3, 1), unit: 'ms from UTC', label: 'offset', parts: [['round trip', `${fmt(v.delay_s * 1e3, 1)} ms`], ['stratum', fmt(v.stratum, 0)]] }),
  'feed.swpc.wind': (v) => ({ value: fmt(v.speed_m_s / 1e3, 0), unit: 'km/s', label: 'speed', parts: [['density', `${fmt(v.density_m3 / 1e6, 1)} cm⁻³`]] }),
  'feed.swpc.imf': (v) => ({ value: fmt(nT(v.bz_gsm_T), 2), unit: 'nT Bz (GSM)', label: 'Bz', parts: [['|B|', `${fmt(nT(v.total_T), 2)} nT`]] }),
  'feed.swpc.kp': (v) => ({ value: fmt(v.kp, 2), unit: 'Kp', label: 'K index', parts: [['storm', v.storm === 'none' ? 'quiet' : v.storm]] }),
  'feed.goes.xray': (v) => ({ value: String(v.class || '—'), unit: 'class', label: 'X-rays', text: true, parts: [['flux', `${fmt(v.flux_w_m2, 2)} W/m²`]] }),
  'feed.goes.protons': (v) => ({ value: fmt(v.flux_pfu, 2), unit: 'pfu', label: 'protons > 10 MeV', parts: [['storm', v.radiation_storm === 'none' ? 'none' : v.radiation_storm]] }),
  'feed.usgs.earthquakes': (v) => ({ value: fmt(v.count_24h, 0), unit: 'in 24 h', label: 'earthquakes', parts: v.largest_magnitude ? [['largest', `M ${fmt(v.largest_magnitude, 1)}`], ['', String(v.largest_place || '')]] : [] }),
  'terrain.dem': (v) => ({ value: fmt(v.height_m, 1), unit: 'm', label: 'ground', parts: [['datum', v.datum], ['resolution', `${fmt(v.resolution_m, 0)} m`]] }),
};

// A reading's first numeric quantities, for a family not named above.
function generic(r) {
  const out = [];
  for (const [k, x] of Object.entries(r.values || {})) {
    if (typeof x !== 'number') continue;
    const unit = r.units?.[k] || '';
    const name = k.replace(/_(m|s|deg|T|Pa|K|w_m2|m_s|m_s2|kg_m3|m3|pfu)$/g, '').replace(/_/g, ' ');
    out.push([name, unit === 'T' ? `${fmt(nT(x), 1)} nT` : `${fmt(x, Math.abs(x) < 10 ? 3 : 1)}${unit ? ` ${unit}` : ''}`]);
    if (out.length >= 4) break;
  }
  if (!out.length) return null;
  const [[label, first], ...rest] = out;
  const [value, ...unit] = first.split(' ');
  return { value, unit: unit.join(' '), label, parts: rest };
}

export function primary(r) {
  if (!r || r.available === false || !r.values) return null;
  try {
    const f = FAMILIES[r.family];
    return (f ? f(r.values, r) : generic(r)) || null;
  } catch {
    return generic(r);
  }
}

// Where a reading was read, in words: on the observer, on a satellite, at an address, or a feed.
export function mountText(r, observer = '') {
  const a = r.mount?.address || '';
  if (!a) return r.kernel === 'feed' || r.provenance === 'physical' ? 'a feed of the present' : 'no mount';
  if (a.startsWith('satellite ')) return `on ${a.slice(10).trim()}`;
  if (observer && a === observer) return 'on the observer';
  return `at ${a}`;
}

// The group a sensor belongs to in the displays: the observer, a satellite, a fixed place, a feed.
export function mountGroup(id, mount, external) {
  if (external) return 'feeds';
  if (mount === 'observer' || String(id).startsWith('observer.')) return 'observer';
  if (String(mount).startsWith('satellite:')) return 'satellites';
  if (!mount) return 'feeds';
  return 'places';
}
export const GROUP_TITLES = {
  observer: 'On the observer', satellites: 'On satellites', places: 'At fixed places', feeds: 'Feeds of the present',
};

// The age of a reading in words: when it was measured, or that it reads the world's instant.
export function ageText(r) {
  if (r?.measured_unix) return `${duration(Date.now() / 1000 - r.measured_unix)} ago`;
  if (r?.tt_s !== undefined) return 'at the world\'s instant';
  return '';
}

// The reading's main value as HTML: the number large, its unit small.
export function valueHtml(p) {
  return p ? `${esc(p.value)}${p.unit ? `<span class="u">${esc(p.unit)}</span>` : ''}` : '—';
}
export function partsHtml(p) {
  return p?.parts?.length ? `<div class="parts">${p.parts.filter(([, t]) => t !== undefined && t !== '').map(([l, t]) => `<span>${l ? `${esc(l)} ` : ''}<b>${esc(t)}</b></span>`).join('')}</div>` : '';
}
