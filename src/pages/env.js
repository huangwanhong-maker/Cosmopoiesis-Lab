// ENV: the environment of the observer, as its instruments read it (decision 0004).
//
// Every value here is a reading on the bus, and says what it is: the standard atmosphere's column and
// the World Magnetic Model's field are models, the Sun's place a model of the ephemeris, the terrain
// beneath an archive's measurement, the space weather the present's physical instruments (DSCOVR or
// IMAP at L1, GOES, the ground's magnetometers), each with its age. Nothing is filled in where an
// instrument cannot read: it says why.

import { compassRose, gauge, profile, skyplot } from '../charts.js';
import { provenanceTag } from '../busclient.js';
import { duration, esc, fmt, latText, length, lonText } from '../format.js';

export function envPage(app) {
  let el, last = 0;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The observer <span class="aside" id="env-where"></span></h3>
        <div id="env-observer"></div>
        <div class="row"><label class="switch"><input type="checkbox" id="env-follow" ${app.observerFollows ? 'checked' : ''}><span>Follows the point chosen <small>a click on any body moves the observer and its instruments there</small></span></label></div>
        <div id="env-picked"></div>
        <h3>The air <span class="aside" id="env-air-prov"></span></h3>
        <div id="env-air"></div>
        <div class="charts-2"><div id="env-temperature"></div><div id="env-pressure"></div></div>
        <h3>The ground and gravity</h3>
        <div id="env-ground"></div>
        <h3>The magnetic field <span class="aside" id="env-field-prov"></span></h3>
        <div class="charts-2"><div id="env-compass"></div><div id="env-field"></div></div>
        <h3>The Sun and the sky <span class="aside" id="env-sky-prov"></span></h3>
        <div class="skyplot-box" id="env-skyplot"></div><div id="env-sun"></div>
        <h3>Radiation and space weather <span class="aside">the present, physical</span></h3>
        <div id="env-weather"></div>
        <h3>Navigation</h3>
        <div id="env-nav"></div>
        <h3>Elsewhere <span class="aside">other mounts</span></h3>
        <div id="env-elsewhere"></div>`;
      page.bind();
    },
    show() { page.render(true); },
    bind() {
      el.addEventListener('change', (e) => {
        if (e.target.id !== 'env-follow') return;
        app.setObserverFollows(e.target.checked);
        if (e.target.checked && app.picked && app.picked.address !== app.observer) app.setObserver(app.picked.canonical || app.picked.address);
        page.render(true);
      });
      el.addEventListener('click', (e) => {
        if (e.target.id === 'env-observe-picked' && app.picked) app.setObserver(app.picked.canonical || app.picked.address);
      });
    },
    onReadings() { if (app.isShown('ENV')) page.render(false); },
    render(force) {
      const now = performance.now();
      if (!force && now - last < 900) return;
      last = now;
      const bus = app.bus;
      const r = (id) => bus.get(id);
      const v = (id) => bus.values(id);
      const age = (x) => (x?.measured_unix ? `${duration(Date.now() / 1000 - x.measured_unix)} ago` : x?.tt_s !== undefined ? 'at the world\'s instant' : '');
      const why = (x) => (x && x.available === false ? `<p class="note">${esc(x.title || x.sensor)}: ${esc(x.reason)}</p>` : '');

      // The observer.
      const pos = v('observer.position'), place = r('observer.position')?.place;
      const terrain = r('terrain.probe');
      el.querySelector('#env-where').textContent = pos?.body ? `on ${pos.body}` : '';
      // A point chosen elsewhere, when the observer does not follow it.
      const picked = app.picked, chosen = picked?.canonical || picked?.address;
      el.querySelector('#env-picked').innerHTML = !app.observerFollows && chosen && chosen !== app.observer
        ? `<p class="note">The point chosen, <span class="address" data-text="${esc(chosen)}">${esc(chosen)}</span>, is not the observer. <button type="button" class="key small" id="env-observe-picked">Observe from it</button></p>` : '';
      el.querySelector('#env-observer').innerHTML = `<div class="address" data-text="${esc(app.observer)}">${esc(app.observer || '—')}</div>
        <table><tbody>
        ${place ? `<tr><th>Place</th><td class="num">${latText(place.latitude_deg, 5)}, ${lonText(place.longitude_deg, 5)}<small>${fmt(place.height_m, 1)} m above the figure</small></td></tr>` : ''}
        ${terrain?.available ? `<tr><th>Ground beneath ${provenanceTag(terrain.provenance)}</th><td class="num">${fmt(terrain.values.height_m, 1)} m<small>${esc(terrain.values.datum)}, ${fmt(terrain.values.resolution_m, 0)} m data; ${esc((terrain.values.sources || []).join(', ')).slice(0, 120)}</small></td></tr>` : ''}
        </tbody></table>${why(terrain)}`;

      // The air.
      const atm = r('observer.atmosphere'), sonde = r('observer.radiosonde');
      el.querySelector('#env-air-prov').innerHTML = atm ? provenanceTag(atm.provenance) : '';
      if (atm?.available) {
        const a = atm.values;
        el.querySelector('#env-air').innerHTML = `<table><tbody>
          <tr><th>Pressure</th><td class="num">${fmt(a.pressure_Pa / 100, 2)} hPa</td></tr>
          <tr><th>Temperature</th><td class="num">${fmt(a.temperature_K, 2)} K <small>${fmt(a.temperature_K - 273.15, 2)} °C</small></td></tr>
          <tr><th>Density</th><td class="num">${fmt(a.density_kg_m3, 4)} kg/m³</td></tr>
          <tr><th>Speed of sound</th><td class="num">${fmt(a.speed_of_sound_m_s, 1)} m/s</td></tr>
          <tr><th>Layer</th><td>${esc(a.layer)} <small>at ${fmt(a.height_msl_m, 1)} m above mean sea level (${esc(a.height_datum)})</small></td></tr>
          </tbody></table><p class="note">The U.S. Standard Atmosphere 1976: the idealised mean of the mid-latitudes, not today's weather.</p>`;
      } else {
        el.querySelector('#env-air').innerHTML = atm ? `<p class="note">${esc(atm.reason || 'no reading')}</p>` : '<p class="note">waiting for the barometer</p>';
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
        el.querySelector('#env-pressure').innerHTML = sonde && sonde.available === false ? `<p class="note">${esc(sonde.reason)}</p>` : '';
      }

      // The ground and gravity.
      const g = r('observer.gravity');
      el.querySelector('#env-ground').innerHTML = g?.available ? `<table><tbody>
        <tr><th>Gravity ${provenanceTag(g.provenance)}</th><td class="num">${fmt(g.values.gravity_m_s2, 6)} m/s²<small>${esc(g.values.model)}</small></td></tr>
        <tr><th>Its deflection</th><td class="num">${fmt(g.values.deflection_deg * 3600, 3)}″ from the figure's normal</td></tr></tbody></table>` : why(g) || '<p class="note">waiting for the gravimeter</p>';

      // The magnetic field: the compass is an instrument of its own, reading only near the Earth's
      // ground and outside the blackout zones; the magnetometers read wherever their models hold.
      const m = r('observer.magnetometer'), compass = r('observer.compass'), lunar = r('observer.moon_magnetometer');
      el.querySelector('#env-field-prov').innerHTML = m?.available ? provenanceTag(m.provenance) : lunar?.available ? provenanceTag(lunar.provenance) : '';
      if (compass?.available) {
        const c = compass.values;
        compassRose(el.querySelector('#env-compass'), { declination: c.magnetic_north_deg, inclination: c.dip_deg, zone: c.zone });
      } else {
        el.querySelector('#env-compass').innerHTML = compass ? `<p class="note">The compass ${compass.quality === 'invalid' ? 'does not settle' : 'does not read here'}: ${esc(compass.reason || '')}</p>`
          : '<p class="note">waiting for the compass</p>';
      }
      if (lunar?.available) {
        const f = lunar.values, nT = 1e9;
        el.querySelector('#env-field').innerHTML = `<table><tbody>
          <tr><th>F</th><td class="num">${fmt(f.total_T * nT, 2)} nT<small>the crust's ${fmt(f.crustal_T * nT, 2)} nT (T2015_449, to degree 449)</small></td></tr>
          ${f.small_scales_T !== undefined ? `<tr><th>Finer scales</th><td class="num">${fmt(f.small_scales_T * nT, 2)} nT<small>synthetic: the power the model lacks below the crust's spectral law, to degree ${f.small_scales_degree}</small></td></tr>` : ''}
          <tr><th>N, E, D</th><td class="num">${fmt(f.north_T * nT, 2)}, ${fmt(f.east_T * nT, 2)}, ${fmt(f.down_T * nT, 2)} nT</td></tr>
          <tr><th>The solar wind's</th><td class="num">${f.external_T !== undefined ? `${fmt(f.external_T * nT, 2)} nT<small>measured at L1 by ${esc(f.external_spacecraft || 'SWPC')} ${duration(f.delay_s)} before</small>` : `<small>${esc(f.external_note || 'not included')}</small>`}</td></tr>
          <tr><th>Its sources</th><td>${Object.entries(f.provenance_of_parts || {}).map(([k, p]) => `${esc(k.replace('_', ' '))} <small>${esc(p)}</small>`).join(', ')}</td></tr></tbody></table>
          ${f.note ? `<p class="note">${esc(f.note)}.</p>` : ''}
          <p class="note">The Moon has no global field: what a magnetometer there reads is the remanence of its crust and the field the solar wind carries past it.</p>`;
      } else if (m?.available) {
        const f = m.values, nT = 1e9;
        el.querySelector('#env-field').innerHTML = `<table><tbody>
          <tr><th>F</th><td class="num">${fmt(f.total_T * nT, 0)} nT</td></tr>
          <tr><th>H, Z</th><td class="num">${fmt(f.horizontal_T * nT, 0)}, ${fmt(f.down_T * nT, 0)} nT</td></tr>
          <tr><th>D</th><td class="num">${fmt(f.declination_deg, 2)}° ± ${fmt(f.declination_uncertainty_deg, 2)}°</td></tr>
          <tr><th>I</th><td class="num">${fmt(f.inclination_deg, 2)}°</td></tr>
          <tr><th>A compass</th><td><span class="status ${f.zone === 'reliable' ? 'good' : f.zone === 'caution' ? 'warning' : 'critical'}">${esc(f.zone)}</span></td></tr>
          <tr><th>Dipole</th><td class="num">λₘ ${fmt(f.geomagnetic_latitude_deg, 1)}°, L ${fmt(f.l_shell, 2)}</td></tr></tbody></table>`;
      } else {
        // Neither magnetometer reads here: say why each does not.
        const reasons = [m, lunar].filter(Boolean).map((x) => `<p class="note">${esc(x.title || x.family)}: ${esc(x.reason || '')}</p>`);
        el.querySelector('#env-field').innerHTML = reasons.join('') || '<p class="note">waiting for the magnetometers</p>';
      }

      // The sky: the bodies and the GNSS satellites.
      const sky = v('observer.sky'), gnss = r('observer.gnss'), sun = r('observer.sun');
      el.querySelector('#env-sky-prov').innerHTML = sun ? provenanceTag(sun.provenance) : '';
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
      el.querySelector('#env-sun').innerHTML = sun?.available ? `<table><tbody>
        <tr><th>Sun</th><td class="num">el ${fmt(sun.values.elevation_deg, 2)}°<small>az ${fmt(sun.values.azimuth_deg, 2)}°</small></td></tr>
        <tr><th>Its disc</th><td class="num">${fmt(sun.values.disc_visible * 100, 1)}% seen${Object.keys(sun.values.hidden_by || {}).length ? `<small>hidden by ${esc(Object.keys(sun.values.hidden_by).join(', '))}: an eclipse</small>` : ''}</td></tr>
        <tr><th>Irradiance</th><td class="num">${fmt(sun.values.irradiance_w_m2, 1)} W/m²<small>on the level: ${fmt(sun.values.horizontal_irradiance_w_m2 ?? NaN, 1)} W/m², above the air</small></td></tr>
        <tr><th>Distance</th><td class="num">${fmt(sun.values.distance_m / 1.495978707e11, 6)} au</td></tr></tbody></table>` : why(sun);

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
        nav.push(`<tr><th>GNSS ${provenanceTag(gnss.provenance)}</th><td class="num">${fmt(gv.in_view?.['gps-ops'] ?? 0, 0)} GPS, ${fmt(gv.in_view?.galileo ?? 0, 0)} Galileo in view<small>above ${fmt(gv.mask_deg, 0)}°</small></td></tr>`);
        if (gv.fix) nav.push(`<tr><th>Dilution</th><td class="num">PDOP ${fmt(gv.pdop, 2)}, HDOP ${fmt(gv.hdop, 2)}, VDOP ${fmt(gv.vdop, 2)}</td></tr>
          <tr><th>Simulated fix</th><td class="num">${fmt(Math.hypot(gv.error_m[0], gv.error_m[1]), 2)} m across, ${fmt(gv.error_m[2], 2)} m up<small>from σ = ${fmt(gv.sigma_uere_m, 1)} m times the dilution (a declared error, not the signals')</small></td></tr>`);
        else nav.push(`<tr><th>Fix</th><td>${esc(gv.reason || 'none')}</td></tr>`);
      } else if (gnss) nav.push(`<tr><th>GNSS</th><td class="note">${esc(gnss.reason || '')}</td></tr>`);
      if (ntp) nav.push(ntp.available ? `<tr><th>This computer's clock ${provenanceTag(ntp.provenance)}</th><td class="num">${fmt(ntp.values.offset_s * 1e3, 1)} ms ${ntp.values.offset_s >= 0 ? 'ahead of' : 'behind'} UTC<small>NTP stratum ${ntp.values.stratum}, round trip ${fmt(ntp.values.delay_s * 1e3, 1)} ms, ${esc(age(ntp))}</small></td></tr>`
        : `<tr><th>This computer's clock</th><td class="note">${esc(ntp.reason)}</td></tr>`);
      el.querySelector('#env-nav').innerHTML = `<table><tbody>${nav.join('')}</tbody></table>`;

      // Elsewhere: the ISS and Tranquility Base.
      const iss = r('iss.sun'), issPos = r('iss.position'), issMag = r('iss.magnetometer');
      const tq = r('tranquility.sun'), tqSky = v('tranquility.sky'), tqG = r('tranquility.gravity');
      const earthThere = tqSky?.bodies?.find((b) => b.body === 'earth');
      const tqB = r('tranquility.magnetometer'), rg = r('reiner_gamma.magnetometer'), rg30 = r('reiner_gamma.30km');
      const lunarRow = (x, name, place) => (x?.available ? `<tr><th>${name}<small>${place}</small></th><td class="num">F ${fmt(x.values.total_T * 1e9, 2)} nT${provenanceTag(x.provenance)}<small>the crust ${fmt(x.values.crustal_T * 1e9, 2)} nT${x.values.small_scales_T !== undefined ? `, finer scales ${fmt(x.values.small_scales_T * 1e9, 2)} nT (synthetic)` : ''}${x.values.external_T !== undefined ? `, the solar wind ${fmt(x.values.external_T * 1e9, 2)} nT` : x.values.in_magnetotail ? ', in the Earth\'s magnetotail' : ''}</small></td></tr>` : '');
      el.querySelector('#env-elsewhere').innerHTML = `<table><tbody>
        ${iss?.available ? `<tr><th>The ISS</th><td class="num">${iss.values.disc_visible > 0.999 ? 'in sunlight' : iss.values.disc_visible < 0.001 ? 'in the Earth\'s shadow' : `${fmt(iss.values.disc_visible * 100, 0)}% of the Sun`}${issPos?.available ? `<small>${fmt(issPos.values.height_m / 1e3, 1)} km up</small>` : ''}${issMag?.available ? `<small>F ${fmt(issMag.values.total_T * 1e9, 0)} nT, L ${fmt(issMag.values.l_shell, 2)}</small>` : ''}</td></tr>` : ''}
        ${lunarRow(tqB, 'Magnetometer', 'Tranquility Base')}${lunarRow(rg, 'Magnetometer', 'Reiner Gamma, with finer scales')}${lunarRow(rg30, 'Magnetometer', '30 km over Reiner Gamma')}
        ${tq?.available ? `<tr><th>Tranquility Base<small>the Moon</small></th><td class="num">the Sun at ${fmt(tq.values.elevation_deg, 1)}°${earthThere ? `<small>the Earth at az ${fmt(earthThere.azimuth_deg, 1)}°, el ${fmt(earthThere.elevation_deg, 1)}°</small>` : ''}${tqG?.available ? `<small>g ${fmt(tqG.values.gravity_m_s2, 4)} m/s²</small>` : ''}</td></tr>` : ''}
        </tbody></table>`;
    },
  };
  return page;
}
