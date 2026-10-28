// ENV: the environment of the observer, as its instruments read it (decisions 0004 and 0006).
//
// The page says first which place its readings describe (the observer, drawn in orchid in the world,
// and whether it is the point chosen), then shows each reading as a value to be read at a glance, with
// its unit, its provenance and its age, its parts and profiles beneath. Every value is a reading on
// the bus: the standard atmosphere's column and the World Magnetic Model's field are models, the Sun's
// place a model of the ephemeris, the terrain beneath an archive's measurement, the space weather the
// present's physical instruments (DSCOVR or IMAP at L1, GOES, the ground's magnetometers). Nothing is
// filled in where an instrument cannot read: it says why.

import { compassRose, gauge, profile, skyplot } from '../charts.js';
import { provenanceTag } from '../busclient.js';
import { duration, esc, fmt, latText, length, lonText } from '../format.js';
import { OBSERVER_GLYPH } from './point.js';

const nT = (t) => t * 1e9;

// A tile: what, the value and its unit, a line beneath, the provenance.
function tile(what, value, unit, { sub = '', prov = '', wide = false, big = false, text = false } = {}) {
  return `<div class="reading${wide ? ' wide' : ''}${big ? ' big' : ''}"><div class="what">${what}${prov ? ` ${prov}` : ''}</div>
    <div class="v${text ? ' text' : ''}">${value}${unit ? `<span class="u">${unit}</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
const off = (what, why) => `<div class="reading off wide"><div class="what">${what}</div><div class="v">${esc(why)}</div></div>`;

export function envPage(app) {
  let el, last = 0;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <div id="env-where"></div>
        <h3>Air <span class="aside" id="env-air-prov"></span></h3>
        <div id="env-air"></div>
        <div class="charts-2"><div id="env-temperature"></div><div id="env-pressure"></div></div>
        <h3>Ground and gravity</h3>
        <div id="env-ground"></div>
        <h3>Magnetic field <span class="aside"><button type="button" class="link" id="env-field-cube">the field about the observer</button></span></h3>
        <div id="env-field"></div>
        <div class="charts-2"><div id="env-compass"></div><div id="env-field-note"></div></div>
        <h3>Sun and sky <span class="aside" id="env-sky-prov"></span></h3>
        <div id="env-sun"></div>
        <div class="skyplot-box" id="env-skyplot"></div>
        <h3>Space weather <span class="aside">the present, observed</span></h3>
        <div id="env-weather"></div>
        <h3>Navigation</h3>
        <div id="env-nav"></div>
        <h3>Other mounts <span class="aside">read elsewhere</span></h3>
        <div id="env-elsewhere"></div>`;
      el.addEventListener('click', (e) => {
        if (e.target.id === 'env-observe-picked' && app.picked) app.setObserver(app.picked.canonical || app.picked.address);
        if (e.target.id === 'env-field-cube') app.openField?.('observer');
        if (e.target.id === 'env-go-observer' && app.observer) app.goTo(app.observer);
      });
    },
    show() { page.render(true); },
    onReadings() { if (app.isShown('ENV')) page.render(false); },
    render(force) {
      const now = performance.now();
      if (!force && now - last < 900) return;
      last = now;
      const bus = app.bus;
      const r = (id) => bus.get(id);
      const v = (id) => bus.values(id);
      const age = (x) => (x?.measured_unix ? `${duration(Date.now() / 1000 - x.measured_unix)} ago` : x?.tt_s !== undefined ? 'at the world\'s instant' : '');

      // Which place these readings describe.
      const place = r('observer.position')?.place, pos = v('observer.position');
      const terrain = r('terrain.probe');
      const picked = app.picked, chosen = picked?.canonical || picked?.address;
      const same = chosen && chosen === app.observer;
      const bodyName = pos?.body ? (app.scene.bodies[pos.body]?.name || pos.body) : '';
      el.querySelector('#env-where').innerHTML = `<div class="where">${OBSERVER_GLYPH}<div>
          <div class="what">These readings describe the observer${bodyName ? `, on ${esc(bodyName)}` : ''}</div>
          <div class="place">${place ? `${latText(place.latitude_deg, 4)}, ${lonText(place.longitude_deg, 4)}` : esc(app.observer || '—')}</div></div>
          <div class="more">${[place ? `${fmt(place.height_m, 1)} m above the figure${terrain?.available ? `, the ground ${fmt(terrain.values.height_m, 1)} m (${esc(terrain.values.datum)})` : ''}` : '',
            same ? 'the point chosen' : chosen ? `not the point chosen: <button type="button" class="link" id="env-observe-picked">observe from the point</button>` : '',
            '<button type="button" class="link" id="env-go-observer">go there</button>'].filter(Boolean).join(' · ')}</div></div>`;

      // The air.
      const atm = r('observer.atmosphere'), sonde = r('observer.radiosonde');
      el.querySelector('#env-air-prov').innerHTML = atm ? `${provenanceTag(atm.provenance)} <small>${esc(age(atm))}</small>` : '';
      if (atm?.available) {
        const a = atm.values;
        el.querySelector('#env-air').innerHTML = `<div class="readings">
          ${tile('Pressure', fmt(a.pressure_Pa / 100, 2), 'hPa', { sub: `scale height ${fmt(a.pressure_scale_height_m / 1e3, 2)} km` })}
          ${tile('Temperature', fmt(a.temperature_K, 2), 'K', { sub: `${fmt(a.temperature_K - 273.15, 2)} °C` })}
          ${tile('Density', fmt(a.density_kg_m3, 4), 'kg/m³', { sub: `speed of sound ${fmt(a.speed_of_sound_m_s, 1)} m/s` })}
          ${tile('Layer', esc(a.layer), '', { text: true, sub: `at ${fmt(a.height_msl_m, 0)} m above mean sea level (${esc(a.height_datum)})` })}
          </div><p class="note">The U.S. Standard Atmosphere 1976: the idealised mean of the mid-latitudes, not today's weather.</p>`;
      } else {
        el.querySelector('#env-air').innerHTML = `<div class="readings">${off('The barometer and thermometer', atm ? atm.reason || 'no reading' : 'waiting for the barometer')}</div>`;
      }
      if (sonde?.available) {
        const L = sonde.values.levels, layers = sonde.values.layers || [];
        const bands = layers.map((l, i) => ({ from: l.base_m, to: layers[i + 1]?.base_m ?? 86000, label: l.name }));
        const marks = [{ y: sonde.values.ground_msl_m, label: 'here' }];
        profile(el.querySelector('#env-temperature'), { title: 'Temperature', x: L.temperature_K, y: L.height_m, unit: 'K', bands, marks, format: (x) => `${fmt(x, 1)} K` });
        profile(el.querySelector('#env-pressure'), { title: 'Pressure', x: L.pressure_Pa, y: L.height_m, unit: 'Pa', log: true, bands, marks,
          tick: (t) => `10${String(Math.round(Math.log10(t))).replace(/\d|-/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? '⁻')}`, format: (x) => `${fmt(x / 100, 3)} hPa` });
      } else {
        el.querySelector('#env-temperature').innerHTML = '';
        el.querySelector('#env-pressure').innerHTML = '';
      }

      // The ground and gravity.
      const g = r('observer.gravity');
      el.querySelector('#env-ground').innerHTML = `<div class="readings">
        ${terrain?.available ? tile(`Ground beneath`, fmt(terrain.values.height_m, 1), 'm', { prov: provenanceTag(terrain.provenance), sub: `${esc(terrain.values.datum)}; ${fmt(terrain.values.resolution_m, 0)} m data` }) : terrain ? off('Ground beneath', terrain.reason || '') : ''}
        ${g?.available ? tile('Gravity', fmt(g.values.gravity_m_s2, 5), 'm/s²', { prov: provenanceTag(g.provenance), sub: `deflection ${fmt(g.values.deflection_deg * 3600, 2)}″ · ${esc(g.values.model)}` }) : off('Gravity', g?.reason || 'waiting for the gravimeter')}
        </div>`;

      // The magnetic field: the Earth's (WMM2025) or the Moon's (its crust and the solar wind).
      const m = r('observer.magnetometer'), compass = r('observer.compass'), lunar = r('observer.moon_magnetometer');
      const field = el.querySelector('#env-field'), note = el.querySelector('#env-field-note');
      if (lunar?.available) {
        const f = lunar.values;
        field.innerHTML = `<div class="readings">
          ${tile('|B|', fmt(nT(f.total_T), 2), 'nT', { big: true, prov: provenanceTag(lunar.provenance), sub: `the crust ${fmt(nT(f.crustal_T), 2)} nT (T2015_449, to degree 449)` })}
          ${tile('North, east, down', `${fmt(nT(f.north_T), 1)}, ${fmt(nT(f.east_T), 1)}, ${fmt(nT(f.down_T), 1)}`, 'nT', { sub: `inclination ${fmt(f.inclination_deg, 1)}°, declination ${fmt(f.declination_deg, 1)}°` })}
          ${f.small_scales_T !== undefined ? tile('Finer scales', fmt(nT(f.small_scales_T), 2), 'nT', { sub: `synthetic, from the crust's spectral law to degree ${f.small_scales_degree}` }) : ''}
          ${tile('The solar wind\'s', f.external_T !== undefined ? fmt(nT(f.external_T), 2) : '—', f.external_T !== undefined ? 'nT' : '', { sub: f.external_T !== undefined ? `measured at L1 by ${esc(f.external_spacecraft || 'SWPC')} ${duration(f.delay_s)} before` : esc(f.external_note || 'not included') })}
          </div>${f.note ? `<p class="note">${esc(f.note)}.</p>` : ''}`;
        note.innerHTML = '<p class="note">The Moon has no global field: a magnetometer there reads the remanence of its crust and the field the solar wind carries past it.</p>';
      } else if (m?.available) {
        const f = m.values;
        field.innerHTML = `<div class="readings">
          ${tile('|B|, the total field F', fmt(nT(f.total_T), 0), 'nT', { big: true, wide: true, prov: provenanceTag(m.provenance), sub: `change ${fmt(nT(f.total_T_per_year), 1)} nT a year · WMM2025, the core's field` })}
          ${tile('North X, east Y', `${fmt(nT(f.north_T), 0)}, ${fmt(nT(f.east_T), 0)}`, 'nT')}
          ${tile('Down Z', fmt(nT(f.down_T), 0), 'nT', { sub: `horizontal H ${fmt(nT(f.horizontal_T), 0)} nT` })}
          ${tile('Declination D', fmt(f.declination_deg, 2), '°', { sub: `± ${fmt(f.declination_uncertainty_deg, 2)}° (the model's error)` })}
          ${tile('Inclination I', fmt(f.inclination_deg, 2), '°', { sub: `dipole latitude ${fmt(f.geomagnetic_latitude_deg, 1)}°, L ${fmt(f.l_shell, 2)}` })}
          </div>`;
        note.innerHTML = `<p class="note">A compass here: <span class="status ${f.zone === 'reliable' ? 'good' : f.zone === 'caution' ? 'warning' : 'critical'}">${esc(f.zone)}</span>. The crust's, the ionosphere's and the magnetosphere's fields are not in the model.</p>`;
      } else {
        const reasons = [m, lunar].filter(Boolean).map((x) => off(esc(x.title || x.family), x.reason || ''));
        field.innerHTML = `<div class="readings">${reasons.join('') || off('The magnetometers', 'waiting for them')}</div>`;
        note.innerHTML = '';
      }
      if (compass?.available) {
        const c = compass.values;
        compassRose(el.querySelector('#env-compass'), { declination: c.magnetic_north_deg, inclination: c.dip_deg, zone: c.zone });
      } else {
        el.querySelector('#env-compass').innerHTML = compass && !lunar?.available ? `<p class="note">The compass ${compass.quality === 'invalid' ? 'does not settle' : 'does not read here'}: ${esc(compass.reason || '')}</p>` : '';
      }

      // The Sun and the sky: the bodies and the GNSS satellites.
      const sky = v('observer.sky'), gnss = r('observer.gnss'), sun = r('observer.sun');
      el.querySelector('#env-sky-prov').innerHTML = sun ? provenanceTag(sun.provenance) : '';
      el.querySelector('#env-sun').innerHTML = sun?.available ? `<div class="readings">
        ${sun.values.elevation_deg !== undefined ? tile('Sun\'s elevation', fmt(sun.values.elevation_deg, 2), '°', { sub: `azimuth ${fmt(sun.values.azimuth_deg, 2)}°` }) : ''}
        ${tile('Irradiance', fmt(sun.values.irradiance_w_m2, 1), 'W/m²', { sub: sun.values.horizontal_irradiance_w_m2 !== undefined ? `on the level ${fmt(sun.values.horizontal_irradiance_w_m2, 1)} W/m², above the air` : 'facing the Sun, above any air' })}
        ${tile('Disc seen', fmt(sun.values.disc_visible * 100, 1), '%', { sub: Object.keys(sun.values.hidden_by || {}).length ? `hidden by ${esc(Object.keys(sun.values.hidden_by).join(', '))}: an eclipse` : 'nothing hides it' })}
        ${tile('Distance', fmt(sun.values.distance_m / 1.495978707e11, 6), 'au')}
        </div>` : `<div class="readings">${off('The Sun sensor', sun?.reason || 'waiting for it')}</div>`;
      const items = [];
      for (const b of sky?.bodies || []) {
        const colour = b.body === 'sun' ? 'var(--status-warning)' : b.body === 'moon' ? 'var(--ink-2)' : b.body === 'earth' ? 'var(--prov-model)' : 'var(--orchid)';
        items.push({ az: b.azimuth_deg, el: b.elevation_deg, name: b.body, label: ['sun', 'moon', 'earth', 'venus', 'mars', 'jupiter', 'saturn'].includes(b.body) ? b.body : '', colour,
          size: b.body === 'sun' ? 6 : b.body === 'moon' || b.body === 'earth' ? 5 : 3, note: `${length(b.distance_m)} away` });
      }
      for (const s of gnss?.values?.sky || []) {
        items.push({ az: s.azimuth_deg, el: s.elevation_deg, name: s.name, colour: s.constellation === 'gps-ops' ? 'var(--gnss-gps)' : 'var(--gnss-galileo)', size: 3,
          shape: s.constellation === 'galileo' ? 'triangle' : 'circle' });
      }
      skyplot(el.querySelector('#env-skyplot'), items, { title: 'The sky', legend: gnss?.available ? [{ colour: 'var(--gnss-gps)', label: 'GPS' }, { colour: 'var(--gnss-galileo)', label: 'Galileo' }] : [] });

      // Space weather: the present's physical instruments.
      const wind = r('swpc.wind'), imf = r('swpc.imf'), kp = r('swpc.kp'), xr = r('goes.xray'), pr = r('goes.protons');
      const head = (x) => (x ? `${provenanceTag(x.provenance)} <small>${esc(age(x))}</small>` : '');
      const parts = [];
      if (wind?.available) parts.push(gauge({ what: 'Solar wind speed', value: wind.values.speed_m_s / 1e3, text: `${fmt(wind.values.speed_m_s / 1e3, 0)} km/s · ${fmt(wind.values.density_m3 / 1e6, 1)} cm⁻³`, min: 200, max: 900, colour: 'var(--prov-observed)', scale: ['200', 'slow', '500', 'fast', '900 km/s'] }) + `<p class="note">${head(wind)} ${esc(wind.values.spacecraft || '')} at L1</p>`);
      if (imf?.available) parts.push(gauge({ what: 'Interplanetary field Bz (GSM)', value: imf.values.bz_gsm_T * 1e9, centre: 0, text: `${fmt(imf.values.bz_gsm_T * 1e9, 2)} nT · |B| ${fmt(imf.values.total_T * 1e9, 2)} nT`, min: -20, max: 20, colour: 'var(--prov-observed)', thresholds: [{ at: 0, label: '0 nT' }], scale: ['−20', 'southward', '0', 'northward', '+20 nT'] }) + `<p class="note">${head(imf)} southward Bz opens the magnetosphere to the wind</p>`);
      if (kp?.available) parts.push(gauge({ what: 'Planetary K index', value: kp.values.kp, text: `Kp ${fmt(kp.values.kp, 2)} · ${kp.values.storm === 'none' ? 'quiet' : esc(kp.values.storm)}`, min: 0, max: 9, colour: kp.values.kp >= 5 ? 'var(--status-warning)' : 'var(--prov-observed)', thresholds: [5, 6, 7, 8, 9].map((k, i) => ({ at: k, label: `G${i + 1}` })), scale: ['0', '', 'G1 5', '', '9'] }) + `<p class="note">${head(kp)}</p>`);
      if (xr?.available) parts.push(gauge({ what: 'Solar X-rays, 0.1–0.8 nm', value: xr.values.flux_w_m2, text: `class ${esc(xr.values.class)} · ${fmt(xr.values.flux_w_m2, 2)} W/m²`, min: -8, max: -3, log: true, colour: 'var(--prov-observed)', thresholds: [1e-7, 1e-6, 1e-5, 1e-4].map((t, i) => ({ at: t, label: 'BCMX'[i] })), scale: ['A', 'B', 'C', 'M', 'X'] }) + `<p class="note">${head(xr)} GOES-${esc(xr.values.satellite)}</p>`);
      if (pr?.available) parts.push(gauge({ what: 'Protons above 10 MeV', value: pr.values.flux_pfu, text: `${fmt(pr.values.flux_pfu, 2)} pfu · ${pr.values.radiation_storm === 'none' ? 'no storm' : esc(pr.values.radiation_storm)}`, min: -1, max: 5, log: true, colour: 'var(--prov-observed)', thresholds: [10, 100, 1e3, 1e4, 1e5].map((t, i) => ({ at: t, label: `S${i + 1}` })), scale: ['0.1', '', 'S1 10', '', '10⁵'] }) + `<p class="note">${head(pr)}</p>`);
      const offline = [wind, imf, kp, xr, pr].filter((x) => x && x.available === false).map((x) => `${esc(x.title)}: ${esc(x.reason)}`);
      el.querySelector('#env-weather').innerHTML = (parts.join('') || '<p class="note">waiting for NOAA SWPC\'s feeds</p>') + (offline.length ? `<p class="note">${offline.join('<br>')}</p>` : '')
        + (app.clock && Math.abs(app.clock.fromPresent()) > 3600 ? '<p class="note">The world\'s instant is not the present: these are the present\'s readings, shown beside it.</p>' : '');

      // Navigation: the GNSS receiver and the clock.
      const ntp = r('ntp');
      const nav = [];
      if (gnss?.available) {
        const gv = gnss.values;
        nav.push(tile('GNSS in view', fmt((gv.in_view?.['gps-ops'] ?? 0) + (gv.in_view?.galileo ?? 0), 0), 'satellites', { prov: provenanceTag(gnss.provenance), sub: `${fmt(gv.in_view?.['gps-ops'] ?? 0, 0)} GPS, ${fmt(gv.in_view?.galileo ?? 0, 0)} Galileo above ${fmt(gv.mask_deg, 0)}°` }));
        if (gv.fix) nav.push(tile('Simulated fix', fmt(Math.hypot(gv.error_m[0], gv.error_m[1]), 2), 'm across', { sub: `${fmt(gv.error_m[2], 2)} m up · PDOP ${fmt(gv.pdop, 2)}, from σ = ${fmt(gv.sigma_uere_m, 1)} m times the dilution` }));
        else nav.push(off('Fix', gv.reason || 'none'));
      } else if (gnss) nav.push(off('GNSS', gnss.reason || ''));
      if (ntp) nav.push(ntp.available ? tile('This computer\'s clock', fmt(ntp.values.offset_s * 1e3, 1), `ms ${ntp.values.offset_s >= 0 ? 'ahead of' : 'behind'} UTC`, { prov: provenanceTag(ntp.provenance), sub: `NTP stratum ${ntp.values.stratum}, round trip ${fmt(ntp.values.delay_s * 1e3, 1)} ms, ${esc(age(ntp))}`, wide: true })
        : off('This computer\'s clock', ntp.reason));
      el.querySelector('#env-nav').innerHTML = `<div class="readings">${nav.join('')}</div>`;

      // Elsewhere: the ISS, Tranquility Base and Reiner Gamma.
      const iss = r('iss.sun'), issPos = r('iss.position'), issMag = r('iss.magnetometer');
      const tq = r('tranquility.sun'), tqSky = v('tranquility.sky'), tqG = r('tranquility.gravity');
      const earthThere = tqSky?.bodies?.find((b) => b.body === 'earth');
      const tqB = r('tranquility.magnetometer'), rg = r('reiner_gamma.magnetometer'), rg30 = r('reiner_gamma.30km');
      const lunarRow = (x, place) => (x?.available ? `<tr><th>${place}<small>magnetometer</small></th><td class="num">${fmt(nT(x.values.total_T), 2)} nT ${provenanceTag(x.provenance)}<small>the crust ${fmt(nT(x.values.crustal_T), 2)} nT${x.values.small_scales_T !== undefined ? `, finer scales ${fmt(nT(x.values.small_scales_T), 2)} nT (synthetic)` : ''}${x.values.external_T !== undefined ? `, the solar wind ${fmt(nT(x.values.external_T), 2)} nT` : x.values.in_magnetotail ? ', in the Earth\'s magnetotail' : ''}</small></td></tr>` : '');
      el.querySelector('#env-elsewhere').innerHTML = `<table><tbody>
        ${iss?.available ? `<tr><th>The ISS<small>${issPos?.available ? `${fmt(issPos.values.height_m / 1e3, 1)} km up` : ''}</small></th><td class="num">${iss.values.disc_visible > 0.999 ? 'in sunlight' : iss.values.disc_visible < 0.001 ? 'in the Earth\'s shadow' : `${fmt(iss.values.disc_visible * 100, 0)}% of the Sun`}${issMag?.available ? `<small>|B| ${fmt(nT(issMag.values.total_T), 0)} nT, L ${fmt(issMag.values.l_shell, 2)}</small>` : ''}</td></tr>` : ''}
        ${lunarRow(tqB, 'Tranquility Base')}${lunarRow(rg, 'Reiner Gamma')}${lunarRow(rg30, '30 km over Reiner Gamma')}
        ${tq?.available ? `<tr><th>Tranquility Base<small>the Moon</small></th><td class="num">the Sun at ${fmt(tq.values.elevation_deg, 1)}°${earthThere ? `<small>the Earth at az ${fmt(earthThere.azimuth_deg, 1)}°, el ${fmt(earthThere.elevation_deg, 1)}°</small>` : ''}${tqG?.available ? `<small>g ${fmt(tqG.values.gravity_m_s2, 4)} m/s²</small>` : ''}</td></tr>` : ''}
        </tbody></table>`;
    },
  };
  return page;
}
