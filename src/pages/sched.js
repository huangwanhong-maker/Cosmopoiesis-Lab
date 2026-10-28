// SCHED: the acquisition's scheduling (decision 0004; calx decision 0009): the policy, the admission of
// the declared set, the jobs on the workers as they ran, and a simulation of the declared set under
// each policy in logical time.
//
// The runtime releases each sensor at the ticks of its clock and orders the waiting jobs by the policy:
// EDF (earliest deadline first, optimal on one processor), fixed priorities by criticality (with aging,
// which bounds a waiting job's delay), or FIFO; classes of work are held to their share by constant
// bandwidth servers, so that a storm of events cannot starve the periodic sensing. Under overload the
// periods of the less critical sensors are stretched elastically. The timing shown is measured on this
// computer's operating system, not guaranteed; the values of the readings do not depend on it.

import { acquire, acquisition, analyse, trace } from '../api.js';
import { timeline } from '../charts.js';
import { esc, fmt } from '../format.js';

const POLICIES = [['edf', false, 'EDF'], ['fixed-priority', false, 'Fixed priority'], ['fixed-priority', true, 'FP with aging'], ['fifo', false, 'FIFO']];

export function schedPage(app) {
  let el, timer = null, describe = null;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <h3>The policy</h3>
        <div class="row" id="sc-policies">${POLICIES.map(([o, aging, label], i) => `<button type="button" class="key small" data-policy="${i}">${label}</button>`).join('')}</div>
        <div id="sc-stats"></div>
        <h3>The operating system's scheduler</h3>
        <div id="sc-kernel"></div>
        <div class="row"><button type="button" class="key small" data-kernel="probe">Time-sharing</button><button type="button" class="key small" data-kernel="fifo">Ask for SCHED_FIFO</button></div>
        <h3>The jobs as they ran <span class="aside">the last five seconds</span></h3>
        <div id="sc-timeline"></div>
        <div class="legend"><span><span class="crit c0"></span>display</span><span><span class="crit c1"></span>science</span><span><span class="crit c2"></span>mission</span><span><span class="crit c3"></span>safety</span><span><span class="status critical"></span>outlined: late</span></div>
        <h3>The servers <span class="aside">constant bandwidth</span></h3>
        <div id="sc-servers"></div>
        <h3>The declared set, simulated</h3>
        <div class="row"><span>world rate</span><select id="sc-rate"><option value="1">real time</option><option value="60">1 min/s</option><option value="3600">1 h/s</option><option value="86400">1 d/s</option></select>
          <label class="switch"><input type="checkbox" id="sc-burst"><span>a burst of 200 events</span></label></div>
        <p><button type="button" class="key small" id="sc-analyse">Simulate each policy</button></p>
        <div id="sc-analysis"></div>`;
      el.addEventListener('click', async (e) => {
        const k = e.target.closest('[data-kernel]');
        if (k) {
          acquire({ policy: { kernel: k.dataset.kernel } }).then((a) => { app.adoptAcquisition(a); page.refresh?.(); },
            (error) => app.console.message('caution', `The kernel's class was not changed: ${error.message}`, 'scheduler'));
          return;
        }
        const p = e.target.closest('[data-policy]');
        if (p) {
          const [order, aging] = POLICIES[Number(p.dataset.policy)];
          try {
            app.adoptAcquisition(await acquire({ policy: { order, aging } }));
            app.console.message('advisory', `Acquisition policy: ${POLICIES[Number(p.dataset.policy)][2]}`, 'scheduler');
            page.refresh();
          } catch (error) {
            app.console.message('caution', `The policy was not changed: ${error.message}`, 'scheduler');
          }
        }
        if (e.target.id === 'sc-analyse') page.analyse();
      });
    },
    show() { page.refresh(); clearInterval(timer); timer = setInterval(() => { if (app.isShown('SCHED')) page.refresh(); else clearInterval(timer); }, 1000); },
    hide() { clearInterval(timer); },
    async refresh() {
      try {
        describe = await acquisition();
        app.adoptAcquisition(describe);
        const st = describe.stats || {}, ad = st.admission || {};
        const pol = describe.session?.policy || {};
        for (const b of el.querySelectorAll('[data-policy]')) {
          const [o, aging] = POLICIES[Number(b.dataset.policy)];
          b.classList.toggle('on', pol.order === o && !!pol.aging === aging);
        }
        el.querySelector('#sc-stats').innerHTML = `<table><tbody>
          <tr><th>Declared utilisation</th><td class="num">${fmt((ad.utilisation ?? 0) * 100, 3)}% of ${fmt(st.workers, 0)} workers<small>target ${fmt((ad.target ?? 0) * 100, 0)}%: ${ad.feasible ? '<span class="status good">feasible by EDF\'s demand test</span>' : '<span class="status critical">not feasible</span>'}</small></td></tr>
          <tr><th>Measured</th><td class="num">${fmt((st.measured_utilisation ?? 0) * 100, 3)}% busy<small>${fmt(st.run ?? 0, 0)} run in the last step, ${fmt(st.waiting ?? 0, 0)} waiting, ${fmt(st.planned_external ?? 0, 0)} for the I/O workers</small></td></tr>
          <tr><th>Late, in all</th><td class="num">${fmt(st.late_total ?? 0, 0)}</td></tr>
          <tr><th>Degraded</th><td>${ad.degraded ? Object.entries(ad.decimation || {}).map(([k, d]) => `${esc(k)} ×${d}`).join(', ') : 'no: every sensor at its period'}</td></tr>
          ${describe.error ? `<tr><th>Stalled</th><td class="error">${esc(describe.error)}</td></tr>` : ''}</tbody></table>`;
        const k = describe.session?.kernel;
        for (const b of el.querySelectorAll('[data-kernel]')) b.classList.toggle('on', (pol.kernel || 'probe') === b.dataset.kernel);
        el.querySelector('#sc-kernel').innerHTML = k ? `<table><tbody>
          <tr><th>The kernel</th><td>${esc(k.system)} ${esc(k.release)}<small>${k.wsl ? 'in WSL 2, under Windows\'s own scheduler' : ''}${k.preempt_rt ? 'PREEMPT_RT: fully preemptible' : ' not PREEMPT_RT'}</small></td></tr>
          <tr><th>Real-time classes</th><td>SCHED_FIFO <span class="status ${k.fifo_permitted ? 'good' : 'muted'}">${k.fifo_permitted ? 'granted' : 'refused'}</span>, SCHED_DEADLINE <span class="status ${k.deadline_permitted ? 'good' : 'muted'}">${k.deadline_permitted ? 'granted' : 'refused'}</span><small>RLIMIT_RTPRIO ${fmt(k.rtprio_limit, 0)}${k.refusal ? `; ${esc(k.refusal)}` : ''}</small></td></tr>
          <tr><th>The workers run</th><td>${esc(k.workers_class)}${k.raised ? ' <span class="status good">raised</span>' : ''}<small>${esc(k.about)}</small></td></tr></tbody></table>
          <p class="note">The policy above orders the jobs among the engine's workers; the kernel decides whether other processes may take the workers' processors. EDF in user space is exact in logical time and best effort in the wall's: only a real-time class on a preemptible kernel bounds the latency.</p>` : '';
        el.querySelector('#sc-servers').innerHTML = `<table><tbody>${(describe.session?.servers || []).map((s) => `<tr><th>${esc(s.name)}</th><td class="num">${fmt(s.budget_s, 3)} s every ${fmt(s.period_s, 2)} s<small>bandwidth ${fmt(s.bandwidth * 100, 1)}%</small></td></tr>`).join('')}</tbody></table>
          <p class="note">A server's jobs take its deadlines: a job that would take more than the budget is pushed to the next period rather than taking more than its share (Abeni and Buttazzo 1998).</p>`;
        const now = Date.now() / 1000 + app.clock.offset;
        const t = await trace(now - 6);
        const workers = Math.max(1, st.workers || 1);
        const lanes = [...Array(workers)].map((_, i) => ({ label: `cpu ${i}`, match: (r) => r.worker === i }));
        lanes.push({ label: 'i/o', match: (r) => r.worker === 'io' });
        timeline(el.querySelector('#sc-timeline'), t.records, { lanes, from: t.now - 5, to: t.now });
      } catch (error) {
        el.querySelector('#sc-stats').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
    async analyse() {
      const out = el.querySelector('#sc-analysis');
      out.innerHTML = '<p class="note">simulating…</p>';
      try {
        const rate = Number(el.querySelector('#sc-rate').value);
        const body = { rate, horizon_s: 2 };
        if (el.querySelector('#sc-burst').checked) body.burst = { at_s: 0.5, count: 200, cost_s: 0.002, criticality: 2 };
        const a = await analyse(body);
        out.innerHTML = `<table><tbody>
          <tr><th>Utilisation</th><td class="num">${fmt(a.utilisation * 100, 2)}% of one worker<small>${a.edf_one_worker.feasible ? 'feasible' : 'not feasible'} on one by EDF; Liu–Layland's bound for rate-monotonic ${fmt(a.liu_layland_bound * 100, 1)}%</small></td></tr>
          ${a.policies.map((p) => `<tr><th>${esc(p.policy)}</th><td class="num">${fmt(p.misses, 0)} of ${fmt(p.jobs, 0)} late<small>${p.starved ? `<span class="status critical">${fmt(p.starved, 0)} never ran</span>` : 'none starved'}${p.max_lateness_s !== null ? `, worst ${fmt(p.max_lateness_s * 1e3, 2)} ms past` : ''}</small></td></tr>`).join('')}</tbody></table>
          <p class="note">A deterministic simulation of the declared costs on ${fmt(a.workers, 0)} workers, non-preemptive as the dispatcher is (calx::scheduler::simulate): what each policy does with these sensors at this rate. The burst shows what a storm of events does to the others without a server.</p>`;
      } catch (error) {
        out.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
  };
  return page;
}
