// SCHED: the acquisition's scheduling (decisions 0004 and 0006; calx decision 0009): its key figures
// first, then the policy, the jobs on the workers as they ran, the servers, the kernel's classes, and a
// simulation of the declared set under each policy in logical time, compared in bars, with what each
// figure counts written out.
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
const NAMES = { edf: 'EDF', 'fixed-priority': 'Fixed priority', 'fixed-priority with aging': 'FP with aging', fifo: 'FIFO' };
// The burst the simulation may add (acquisition.hpp, Session::analyse): its jobs' deadlines are 50 ms
// after their release.
const BURST = { at_s: 0.5, count: 200, cost_s: 0.002, criticality: 2 };
const BURST_DEADLINE_S = 0.05;

const kpi = (what, value, unit, sub = '', bad = false) => `<div class="kpi${bad ? ' bad' : ''}"><div class="what">${what}</div><div class="v">${value}${unit ? `<span class="u">${unit}</span>` : ''}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

export function schedPage(app) {
  let el, timer = null, describe = null;
  const page = {
    mount(root) {
      el = root;
      el.innerHTML = `
        <div id="sc-kpis"></div>
        <h3>The policy</h3>
        <div class="keyrow" id="sc-policies">${POLICIES.map(([o, aging, label], i) => `<button type="button" class="key small" data-policy="${i}">${label}</button>`).join('')}</div>
        <div id="sc-stats"></div>
        <h3>The jobs as they ran <span class="aside">the last five seconds</span></h3>
        <div id="sc-timeline-figure"><div class="chart-box" id="sc-timeline"></div><div class="legend"><span><span class="crit c0"></span>display</span><span><span class="crit c1"></span>science</span><span><span class="crit c2"></span>mission</span><span><span class="crit c3"></span>safety</span><span><span class="status critical"></span>outlined: late</span></div></div>
        <h3>The declared set, simulated</h3>
        <div class="row"><span>World rate</span><select id="sc-rate"><option value="1">real time</option><option value="60">1 min/s</option><option value="3600">1 h/s</option><option value="86400">1 d/s</option></select>
          <label class="switch"><input type="checkbox" id="sc-burst"><span>a burst of ${BURST.count} events</span></label></div>
        <div class="keyrow"><button type="button" class="key small" id="sc-analyse">Simulate each policy</button></div>
        <div id="sc-analysis"></div>
        <h3>The servers <span class="aside">constant bandwidth</span></h3>
        <div id="sc-servers"></div>
        <h3>The operating system's scheduler</h3>
        <div id="sc-kernel"></div>
        <div class="keyrow"><button type="button" class="key small" data-kernel="probe">Time-sharing</button><button type="button" class="key small" data-kernel="fifo">Ask for SCHED_FIFO</button></div>`;
      app.separator.attach(document.getElementById('sc-timeline-figure'), { id: 'sched-timeline', title: 'The jobs as they ran', page: 'SCHED' });
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
        el.querySelector('#sc-kpis').innerHTML = `<div class="kpis">
          ${kpi('Late, in all', fmt(st.late_total ?? 0, 0), 'jobs', 'since the session began', (st.late_total ?? 0) > 0)}
          ${kpi('Declared load', fmt((ad.utilisation ?? 0) * 100, 2), '%', `of ${fmt(st.workers, 0)} workers' capacity`)}
          ${kpi('Measured busy', fmt((st.measured_utilisation ?? 0) * 100, 2), '%', `${fmt(st.run ?? 0, 0)} run in the last step`)}
          </div>`;
        el.querySelector('#sc-stats').innerHTML = `<p class="explain"><b>${ad.feasible ? 'Feasible' : 'Not feasible'}</b> by EDF's demand test on the declared costs, against a target of ${fmt((ad.target ?? 0) * 100, 0)}% of the workers.
          ${ad.degraded ? `Degraded: ${Object.entries(ad.decimation || {}).map(([k, d]) => `${esc(k)} ×${d}`).join(', ')}.` : 'Every sensor runs at its period.'}
          ${fmt(st.waiting ?? 0, 0)} jobs wait; ${fmt(st.planned_external ?? 0, 0)} are for the I/O workers (the physical sources).</p>
          ${describe.error ? `<p class="error">Stalled: ${esc(describe.error)}</p>` : ''}`;
        const k = describe.session?.kernel;
        for (const b of el.querySelectorAll('[data-kernel]')) b.classList.toggle('on', (pol.kernel || 'probe') === b.dataset.kernel);
        el.querySelector('#sc-kernel').innerHTML = k ? `<table><tbody>
          <tr><th>The kernel</th><td>${esc(k.system)} ${esc(k.release)}<small>${k.wsl ? 'in WSL 2, under Windows\'s own scheduler; ' : ''}${k.preempt_rt ? 'PREEMPT_RT: fully preemptible' : 'not PREEMPT_RT'}</small></td></tr>
          <tr><th>Real-time classes</th><td>SCHED_FIFO <span class="status ${k.fifo_permitted ? 'good' : 'muted'}">${k.fifo_permitted ? 'granted' : 'refused'}</span>, SCHED_DEADLINE <span class="status ${k.deadline_permitted ? 'good' : 'muted'}">${k.deadline_permitted ? 'granted' : 'refused'}</span><small>RLIMIT_RTPRIO ${fmt(k.rtprio_limit, 0)}${k.refusal ? `; ${esc(k.refusal)}` : ''}</small></td></tr>
          <tr><th>The workers run</th><td>${esc(k.workers_class)}${k.raised ? ' <span class="status good">raised</span>' : ''}<small>${esc(k.about)}</small></td></tr></tbody></table>
          <p class="note">The policy orders the jobs among the engine's workers; the kernel decides whether other processes may take the workers' processors. EDF in user space is exact in logical time and best effort in the wall's: only a real-time class on a preemptible kernel bounds the latency.</p>` : '';
        el.querySelector('#sc-servers').innerHTML = `<table><tbody>${(describe.session?.servers || []).map((s) => `<tr><th>${esc(s.name)}</th><td class="num">${fmt(s.budget_s, 3)} s every ${fmt(s.period_s, 2)} s<small>bandwidth ${fmt(s.bandwidth * 100, 1)}%</small></td></tr>`).join('')}</tbody></table>
          <p class="note">A server's jobs take its deadlines: a job that would take more than the budget is pushed to the next period rather than taking more than its share (Abeni and Buttazzo 1998).</p>`;
        const now = Date.now() / 1000 + app.clock.offset;
        const t = await trace(now - 6);
        const workers = Math.max(1, st.workers || 1);
        const lanes = [...Array(workers)].map((_, i) => ({ label: `cpu ${i}`, match: (r) => r.worker === i }));
        lanes.push({ label: 'i/o', match: (r) => r.worker === 'io' });
        timeline(document.getElementById('sc-timeline'), t.records, { lanes, from: t.now - 5, to: t.now });
      } catch (error) {
        el.querySelector('#sc-stats').innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
    async analyse() {
      const out = el.querySelector('#sc-analysis');
      out.innerHTML = '<p class="note">simulating…</p>';
      try {
        const rate = Number(el.querySelector('#sc-rate').value);
        const burst = el.querySelector('#sc-burst').checked;
        const body = { rate, horizon_s: 2 };
        if (burst) body.burst = BURST;
        const a = await analyse(body);
        out.innerHTML = analysisHtml(a, burst);
      } catch (error) {
        out.innerHTML = `<p class="error">${esc(error.message)}</p>`;
      }
    },
  };
  return page;
}

// The simulation's answer: its figures, each policy's late jobs in bars, and what is counted.
export function analysisHtml(a, burst) {
  const edf = a.policies.find((p) => p.policy === 'edf') || a.policies[0];
  const jobs = edf?.jobs ?? 0;
  const burstJobs = burst ? BURST.count : 0;
  const periodic = jobs - burstJobs;
  const top = Math.max(1, ...a.policies.map((p) => p.jobs));
  const bars = a.policies.map((p) => {
    const late = p.misses, starved = p.starved || 0;
    return `<div class="bar-row"><span class="name">${esc(NAMES[p.policy] || p.policy)}</span>
      <span class="track" title="${fmt(late, 0)} of ${fmt(p.jobs, 0)} late${starved ? `, ${fmt(starved, 0)} never ran` : ''}"><span class="fill late" style="width:${(100 * late / top).toFixed(2)}%"></span>${starved ? `<span class="fill starved" style="left:${(100 * (late - starved) / top).toFixed(2)}%;width:${(100 * starved / top).toFixed(2)}%"></span>` : ''}</span>
      <span class="n">${fmt(late, 0)} / ${fmt(p.jobs, 0)}</span></div>`;
  }).join('');
  const work = BURST.count * BURST.cost_s, capacity = a.workers * BURST_DEADLINE_S;
  const minLate = Math.max(0, Math.ceil(BURST.count - capacity / BURST.cost_s));
  return `<div class="kpis">
      ${`<div class="kpi${(edf?.misses ?? 0) > 0 ? ' bad' : ''}"><div class="what">Late under EDF</div><div class="v">${fmt(edf?.misses ?? 0, 0)}<span class="u">/ ${fmt(jobs, 0)} jobs</span></div><div class="sub">${edf?.max_lateness_s !== null && edf?.max_lateness_s !== undefined ? `worst ${fmt(edf.max_lateness_s * 1e3, 1)} ms past` : 'none late'}</div></div>`}
      <div class="kpi"><div class="what">Periodic load</div><div class="v">${fmt(a.utilisation * 100, 2)}<span class="u">%</span></div><div class="sub">of one worker; ${a.edf_one_worker.feasible ? 'feasible' : 'not feasible'} on one by EDF</div></div>
      <div class="kpi"><div class="what">Burst work</div><div class="v">${burst ? fmt(work * 1e3, 0) : '0'}<span class="u">ms</span></div><div class="sub">${burst ? `${BURST.count} events at ${BURST.at_s} s` : 'no burst'}</div></div></div>
    <div class="bars">${bars}</div>
    <p class="explain">What is counted. <b>Periodic load</b> is Σ cost/period over the session's periodic sensors at this world rate (${fmt(periodic, 0)} of the ${fmt(jobs, 0)} jobs in the ${fmt(a.horizon_s, 0)} s simulated); Liu and Layland's bound for rate-monotonic priorities on these is ${fmt(a.liu_layland_bound * 100, 1)}%.
      ${burst ? `<b>The burst</b> is not in it: ${BURST.count} jobs of ${fmt(BURST.cost_s * 1e3, 0)} ms each, ${fmt(work * 1e3, 0)} ms of work released together at ${BURST.at_s} s, each due ${fmt(BURST_DEADLINE_S * 1e3, 0)} ms later. ${fmt(a.workers, 0)} workers can do ${fmt(capacity * 1e3, 0)} ms of work in ${fmt(BURST_DEADLINE_S * 1e3, 0)} ms, so at least ${fmt(minLate, 0)} of the burst's jobs are late under any policy, and the dispatcher does not preempt, so periodic jobs released behind them wait too. A constant bandwidth server holds such a storm to its share.` : 'Without a burst, the declared costs are far below the workers\' capacity.'}</p>
    <p class="note">A deterministic simulation of the declared costs on ${fmt(a.workers, 0)} workers, non-preemptive as the dispatcher is (calx::scheduler::simulate): what each policy does with these sensors at this rate, not a measurement of this computer.</p>`;
}
