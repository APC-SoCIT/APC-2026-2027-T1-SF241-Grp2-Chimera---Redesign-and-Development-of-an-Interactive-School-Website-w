/*
  Author: Gian Mandac
  Created Date: 20261124
  Staff dashboard bridge for the scheduling workbench (loaded after app.js, only through the gateway).
  - Adds html.in-portal so portal.css applies the SNCS dashboard look.
  - Draws the Overview: the four steps with their progress, the latest draft and the school records.
  - Lets the dashboard's side panel open a step, and tells the dashboard which step is open,
    how far each step has got, and how tall the page is.
  It only reads the workbench's own state (data, run) and calls its own showView(); it never changes data.
*/
(function () {
  'use strict';
  if (window.parent === window) return;
  const origin = window.location.origin;
  const root = document.documentElement;
  root.classList.add('in-portal');

  const STEPS = [
    { id: 'loads', view: 'load-method', title: 'Teacher loads', views: ['load-method', 'import-loads', 'inputs'] },
    { id: 'times', view: 'school-times', title: 'School times', views: ['school-times', 'advisers'] },
    { id: 'generate', view: 'checks', title: 'Check & generate', views: ['checks'] },
    { id: 'review', view: 'review', title: 'Review & publish', views: ['review'] },
  ];
  const OPENABLE = new Set(['home', 'load-method', 'school-times', 'advisers', 'checks', 'review', 'teacher']);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = () => ({
    // Globals declared by app.js and workspace.js, which load before this file.
    data: typeof data === 'undefined' ? null : data, // eslint-disable-line no-undef
    run: typeof run === 'undefined' ? null : run, // eslint-disable-line no-undef
    groups: typeof schoolGroups === 'undefined' ? [] : schoolGroups, // eslint-disable-line no-undef
  });

  // Progress, read from the workbench's own working copy and the draft it has open.
  function progress() {
    const { data: d, run: r, groups } = state();
    if (!d) return STEPS.map((s) => ({ ...s, state: 'todo', note: '' }));
    const teachers = new Set(d.loads.map((l) => l.teacher).filter(Boolean)).size;
    const groupIds = groups.map(([id]) => id);
    const setGroups = new Set((d.day_plans || []).filter((p) => p.arrival && p.dismissal_end).map((p) => p.group));
    const timesSet = groupIds.filter((id) => setGroups.has(id)).length;
    const generated = Boolean(r && r.result);
    const verified = Boolean(generated && r.result.verified && !(r.policy_errors || []).length);
    const isPublished = Boolean(r && r.status === 'published');
    const raw = [
      [d.loads.length > 0, d.loads.length ? `${d.loads.length} assignments · ${teachers} teachers` : 'No teaching loads yet'],
      [groupIds.length > 0 && timesSet === groupIds.length, `${timesSet} of ${groupIds.length || 4} grade groups set`],
      [verified, verified ? 'Draft ready to review' : generated ? 'Last draft needs attention' : 'No draft generated yet'],
      [isPublished, isPublished ? 'Published to teachers' : verified ? 'Draft not published yet' : 'Waiting for a draft'],
    ];
    let next = false;
    return STEPS.map((s, i) => {
      const [done, note] = raw[i];
      let st = done ? 'done' : 'todo';
      if (!done && !next) { st = 'now'; next = true; }
      return { ...s, state: st, note };
    });
  }

  function currentView() {
    const open = document.querySelector('.view:not([hidden])');
    return open ? open.id : 'home';
  }
  /** The dashboard side panel item for a workbench view. */
  function navId(view) {
    if (view === 'home') return 'overview';
    if (view === 'teacher') return 'published';
    return (STEPS.find((s) => s.views.includes(view)) || { id: 'overview' }).id;
  }

  // Overview
  const ICONS = {
    users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
    layers: 'M12 3 2 8l10 5 10-5z M2 13l10 5 10-5',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
    clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 7v5l3 2',
  };
  const icon = (name) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  const records = [
    ['teachers', 'Teachers', 'Names and workload limits', 'users', (d) => d.teachers.length],
    ['subjects', 'Subjects', 'Grades, subjects and strands', 'book', (d) => d.subjects.length],
    ['sections', 'Sections', 'Class names and grades', 'layers', (d) => d.sections.length],
    ['requirements', 'Curriculum', 'Required meetings per section', 'list', (d) => d.requirements.length],
    ['@advisers', 'Class advisers', 'Adviser assignments & supervision', 'star', (d) => {
      const withAdviser = d.sections.filter((s) => String(s.advisers ?? s.adviser ?? '').trim()).length;
      return `${withAdviser} / ${d.sections.length}`;
    }],
    ['unavailable', 'Teacher commitments', 'Times already occupied', 'clock', (d) => (d.unavailable || []).length],
  ];
  let glanceSection = '';

  function overviewHtml() {
    const { data: d, run: r } = state();
    const steps = progress();
    const nextStep = steps.find((s) => s.state === 'now');
    const doneCount = steps.filter((s) => s.state === 'done').length;
    const lead = !d ? 'Opening the scheduling workspace…'
      : nextStep ? {
        loads: 'Start with teacher loads: enter them or import the SNCS Excel file. Then set the school day and generate a draft.',
        times: 'Teacher loads are in. Set the school day for each grade group next.',
        generate: 'Teacher loads and school times are in. Run the checks, generate a draft, then review it before publishing to teachers.',
        review: 'A draft is ready. Review it, then publish it to teachers.',
      }[nextStep.id] : 'The timetable is published. Teachers see the published version; changes start a new draft.';
    const route = `<section class="pt-route" aria-labelledby="pt-title">
      <div class="pt-route-top"><div>
        <div class="pt-school"><span></span> STO. NIÑO CATHOLIC SCHOOL</div>
        <h2 class="pt-title" id="pt-title">Your school week</h2>
        <p>${esc(lead)}</p>
      </div>${nextStep ? `<button type="button" class="pt-gold" data-view="${nextStep.view}">→ Continue: ${esc(nextStep.title.toLowerCase())}</button>` : ''}</div>
      <div class="pt-stations" style="--done:${Math.min(100, doneCount * 33.3)}%">${steps.map((s, i) => `<button type="button" class="pt-station ${s.state}" data-view="${s.view}">
        <span class="pt-pin" aria-hidden="true">${s.state === 'done' ? '✓' : i + 1}</span><b>${esc(s.title)}</b><small>${esc(s.note)}</small></button>`).join('')}</div>
    </section>`;

    let glance;
    if (r && r.result && r.result.verified && window.SNCSTimetable) {
      const sections = (r.snapshot.sections || []).map((s) => s.id);
      if (!sections.includes(glanceSection)) glanceSection = sections[0] || '';
      let board = '';
      try { board = window.SNCSTimetable.html(r, 'section', glanceSection); } catch { board = ''; }
      glance = `<div class="pt-head"><div><h2>Latest draft at a glance</h2><p>${esc(r.snapshot.school_year)} · ${esc(r.snapshot.period)} · ${esc(String(r.status || '').toLowerCase())}</p></div>
        <select id="pt-glance-section" aria-label="Section">${sections.map((id) => `<option value="${esc(id)}" ${id === glanceSection ? 'selected' : ''}>${esc(id)}</option>`).join('')}</select></div>
        <div class="pt-glance-body">${board}</div>`;
    } else {
      glance = `<div class="pt-head"><div><h2>Latest draft at a glance</h2><p>The weekly timetable of the draft you open or generate appears here.</p></div></div>
        <div class="pt-empty"><span>No draft is open yet.</span><button type="button" class="secondary" data-view="${r ? 'review' : 'checks'}">${r ? 'Open a saved version →' : 'Check & generate →'}</button></div>`;
    }
    const recordRows = d ? records.map(([table, title, note, ic, count]) => `<button type="button" class="pt-record" ${table === '@advisers' ? 'data-view="advisers"' : `data-table="${table}"`}>
      <span class="pt-ic">${icon(ic)}</span><span><b>${title}</b><small>${note}</small></span><strong>${esc(count(d))}</strong></button>`).join('') : '';
    return `${route}<div class="pt-grid"><section class="card pt-glance-card">${glance}</section>
      <section class="card pt-records-card"><div class="pt-head"><div><h2>School records</h2><p>Keep these current before generating.</p></div></div><div class="pt-records">${recordRows}</div></section></div>`;
  }

  let host;
  function renderOverview() {
    const home = document.getElementById('home');
    if (!home) return;
    if (!host) {
      host = document.createElement('div');
      host.id = 'portal-overview';
      home.prepend(host);
      host.addEventListener('change', (event) => {
        if (event.target.id !== 'pt-glance-section') return;
        glanceSection = event.target.value;
        renderOverview();
      });
    }
    host.innerHTML = overviewHtml();
    if (window.SNCSTimetable) window.SNCSTimetable.hydrate(host);
  }

  // Dashboard messages
  let lastSent = '';
  // Label each step's page the way the side panel numbers it.
  const kickers = { 'load-method': 'STEP 1 OF 4', 'import-loads': 'STEP 1 OF 4', 'school-times': 'STEP 2 OF 4', advisers: 'STEP 2 OF 4',
    checks: 'STEP 3 OF 4', review: 'STEP 4 OF 4', teacher: 'WHAT TEACHERS SEE' };
  function setKicker(view) {
    const eyebrow = document.querySelector('.heading .eyebrow');
    if (!eyebrow) return;
    const title = document.getElementById('page-title')?.textContent || '';
    const text = view === 'inputs' ? (title === 'School records' ? 'SCHOOL RECORDS' : 'STEP 1 OF 4') : kickers[view] || 'SCHEDULING';
    if (eyebrow.textContent !== text) eyebrow.textContent = text;
  }

  function report() {
    const view = currentView();
    root.classList.toggle('portal-home', view === 'home');
    setKicker(view);
    const message = {
      type: 'SNCS_SCHEDULER_STATE',
      view: navId(view),
      steps: progress().map(({ id, state: st, note }) => ({ id, state: st, note })),
      height: Math.ceil(document.body.scrollHeight),
    };
    const key = JSON.stringify(message);
    if (key === lastSent) return;
    lastSent = key;
    window.parent.postMessage(message, origin);
  }

  let pending = false;
  function refresh() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (currentView() === 'home') renderOverview();
      report();
    });
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== window.parent || event.data?.type !== 'SNCS_SCHEDULER_SHOW') return;
    const view = String(event.data.view || '');
    if (!OPENABLE.has(view) || typeof showView !== 'function') return;
    showView(view); // eslint-disable-line no-undef
    window.scrollTo(0, 0);
    refresh();
  });

  // Re-draw when the workbench shows another view or its data changes; report size changes.
  // Changes made by the Overview itself are ignored, so drawing it never triggers another draw.
  new MutationObserver((changes) => {
    if (changes.every((change) => host && host.contains(change.target))) return;
    refresh();
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  if ('ResizeObserver' in window) new ResizeObserver(() => report()).observe(document.body);
  refresh();
})();
