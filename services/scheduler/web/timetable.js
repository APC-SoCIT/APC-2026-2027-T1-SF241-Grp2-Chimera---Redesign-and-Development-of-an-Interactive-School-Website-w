/* One frozen schedule, rendered for either audience. Also usable by Node tests. */
(function (root) {
  'use strict';
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const LABELS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2,'0')} ${m < 720 ? 'AM' : 'PM'}`;
  function dayList(text) {
    const parts = String(text).split('-').map(s => s.trim());
    return parts.length === 2 ? DAYS.slice(DAYS.indexOf(parts[0]),DAYS.indexOf(parts[1])+1) : String(text).split(',').map(s => s.trim());
  }
  const minute = (text) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(text));
    return m ? (m[3] ? Number(m[1]) % 12 + (/pm/i.test(m[3]) ? 12 : 0) : Number(m[1])) * 60 + Number(m[2]) : NaN;
  };
  function entities(version, type) {
    return version.snapshot[type === 'teacher' ? 'teachers' : 'sections'].map(r => ({id:r.id,name:r.name || r.id}));
  }
  // Interval lanes retain simultaneous, disjoint SHS strand lessons side by side.
  function lanes(entries) {
    const sorted = entries.map(e => ({...e})).sort((a,b) => a.start-b.start || a.end-b.end || a.subject.localeCompare(b.subject));
    let group = [], end = -1;
    const finish = () => {
      const ends = [];
      for (const e of group) {
        let lane = ends.findIndex(v => v <= e.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = e.end; e.lane = lane;
      }
      group.forEach(e => { e.lanes = ends.length; });
    };
    for (const e of sorted) {
      if (e.start >= end) { finish(); group = []; end = -1; }
      group.push(e); end = Math.max(end,e.end);
    }
    finish(); return sorted;
  }
  function model(version, type, id) {
    if (!['teacher','section'].includes(type)) throw new Error('Choose a teacher or section schedule.');
    const entity = entities(version,type).find(e => e.id === id);
    if (!entity) throw new Error('Choose a registered teacher or section.');
    const snapshot = version.snapshot;
    const entries = version.result.entries.filter(e => e[type] === id);
    const activities = (version.result.activities || []).filter(a => type === 'section' ? a.section === id && !a.teacher_only : String(a.advisers).split(',').includes(id));
    const sectionIds = type === 'section' ? [id] : [...entries.map(e => e.section),...activities.map(a => a.section)];
    const groups = new Set(snapshot.sections.filter(s => sectionIds.includes(s.id)).map(s => Number(s.grade) <= 8 ? '7-8' : Number(s.grade) <= 10 ? '9-10' : String(s.grade)));
    const validBells = snapshot.bells.filter(b => (groups.has(b.group) || b.group === '11-12' && (groups.has('11') || groups.has('12'))) && Number.isFinite(minute(b.start)) && Number.isFinite(minute(b.end)) && minute(b.end) > minute(b.start));
    const all = [...entries,...activities];
    const starts = [...all.map(e => e.start),...validBells.map(b => minute(b.start))];
    const ends = [...all.map(e => e.end),...validBells.map(b => minute(b.end))];
    const start = starts.length ? Math.floor(Math.min(...starts)/30)*30 : 420;
    const end = ends.length ? Math.ceil(Math.max(...ends)/30)*30 : 1020;
    const days = DAYS.slice(0,all.some(e => e.day === 'Sat') || validBells.some(b => dayList(b.days).includes('Sat')) ? 6 : 5);
    const section = snapshot.sections.find(s => s.id === id);
    const group = section ? (Number(section.grade) <= 8 ? '7-8' : Number(section.grade) <= 10 ? '9-10' : String(section.grade)) : null;
    const breaks = type === 'section' && !snapshot.day_plans?.length ? validBells.filter(b => (b.group === group || b.group === '11-12' && ['11','12'].includes(group)) && b.kind !== 'Class') : [];
    return {entity,type,start,end,days,entries,activities,columns:days.map(day => ({day,entries:lanes(entries.filter(e => e.day === day)),breaks:[...breaks.filter(b => dayList(b.days).includes(day)).map(b => ({...b,start:minute(b.start),end:minute(b.end)})),...activities.filter(a => a.day === day).map(a => ({...a,label:a.kind+(type === 'teacher' ? ' · '+a.section : '')}))]}))};
  }
  function html(version, type, id) {
    const m = model(version,type,id), s = version.snapshot;
    const teachers = Object.fromEntries(s.teachers.map(t => [t.id,t.name]));
    const subjects = [...new Set(s.loads.map(l => l.subject))].sort();
    const sorted = [...m.entries].sort((a,b) => DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || a.start-b.start || a.subject.localeCompare(b.subject));
    const activityGroups = new Map();
    for (const a of m.activities) {
      const key = JSON.stringify([a.section,a.kind,a.start,a.end,a.advisers]);
      if (!activityGroups.has(key)) activityGroups.set(key,{...a,days:[]});
      activityGroups.get(key).days.push(a.day);
    }
    const activitySummary = activityGroups.size ? `<div class="activity-summary"><h5>School activities & adviser supervision</h5><table><thead><tr><th>Activity</th><th>Days</th><th>Time</th>${type === 'teacher' ? '<th>Advisory section</th>' : ''}</tr></thead><tbody>${[...activityGroups.values()].map(a => `<tr><td>${escape(a.kind)}</td><td>${escape([...new Set(a.days)].join(', '))}</td><td>${clock(a.start)}–${clock(a.end)}</td>${type === 'teacher' ? `<td>${escape(a.section)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
    const detail = (e) => type === 'teacher' ? e.section : teachers[e.teacher] || e.teacher;
    const full = (e) => `${e.subject} · ${e.section}${e.strand ? ' · '+e.strand : ''} · ${teachers[e.teacher] || e.teacher} · ${e.day} ${clock(e.start)}–${clock(e.end)}`;
    const ticks = [];
    for (let t=m.start;t<=m.end;t+=30) ticks.push(`<span class="week-tick" data-offset="${t-m.start}">${clock(t)}</span>`);
    return `<article class="timetable-sheet"><header class="timetable-heading"><div><p class="eyebrow">STO. NIÑO CATHOLIC SCHOOL</p><h3>${type === 'teacher' ? 'Teacher schedule' : 'Class schedule'}</h3><h4>${escape(m.entity.name)}</h4><p>${escape(s.school_year)} · ${escape(s.period)}</p></div><span class="pill ${s.demo ? 'gold' : ''}">${s.trial ? 'TRIAL · ' : s.demo ? 'DEMO · ' : ''}${escape(version.status.toUpperCase())}</span></header><div class="timetable-summary"><span>${m.entries.length} meetings · ${m.entries.reduce((n,e) => n+e.end-e.start,0)} min/week</span><span>Version ${escape(version.id.slice(0,8))} · School local time</span></div>${m.entries.length ? '' : '<p class="empty-schedule">No lessons assigned to this record in this version.</p>'}<div class="week-scroll" tabindex="0" aria-label="Weekly timetable; scroll horizontally to see all days"><div class="week-board" data-minutes="${m.end-m.start}" data-days="${m.days.length}"><div class="week-corner">TIME</div>${m.days.map(day => `<div class="week-day">${LABELS[DAYS.indexOf(day)]}</div>`).join('')}<div class="week-axis">${ticks.join('')}</div>${m.columns.map(col => `<div class="week-column" aria-label="${col.day}">${col.breaks.map(b => `<div class="week-break" data-offset="${b.start-m.start}" data-length="${b.end-b.start}" title="${escape((b.label || b.kind)+' · '+clock(b.start)+'–'+clock(b.end))}"><strong>${escape(b.label || b.kind)}</strong><small>${clock(b.start)}–${clock(b.end)}</small></div>`).join('')}${col.entries.map(e => `<div class="week-lesson color-${subjects.indexOf(e.subject)%8}" data-offset="${e.start-m.start}" data-length="${e.end-e.start}" data-lane="${e.lane}" data-lanes="${e.lanes}" tabindex="0" title="${escape(full(e))}"><strong>${escape(e.subject)}</strong><span>${escape(detail(e))}</span>${e.strand ? `<span class="lesson-strand">${escape(e.strand)}</span>` : ''}<small>${clock(e.start)}–${clock(e.end)}</small></div>`).join('')}</div>`).join('')}</div></div>${activitySummary}<p class="timetable-note">${s.trial ? 'TRIAL ONLY: real teacher loads with provisional times/rules; not school-approved. ' : ''}Blank space means no lesson or school activity in this version. ${type === 'teacher' ? 'Adviser supervision is shown separately from teaching. Other commitments remain in the inputs. ' : ''}Rooms are not assigned. Simultaneous strand classes appear side by side.</p><details class="lesson-details"><summary>Lesson details (${m.entries.length})</summary><div class="table-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Section / strand</th><th>Teacher</th></tr></thead><tbody>${sorted.map(e => `<tr><td>${escape(e.day)}</td><td>${clock(e.start)}–${clock(e.end)}</td><td>${escape(e.subject)}</td><td>${escape(e.section)}${e.strand ? ' · '+escape(e.strand) : ''}</td><td>${escape(teachers[e.teacher] || e.teacher)}</td></tr>`).join('')}</tbody></table></div></details></article>`;
  }
  function hydrate(container) {
    for (const board of container.querySelectorAll('.week-board')) {
      board.style.setProperty('--minutes',board.dataset.minutes);
      board.style.setProperty('--days',board.dataset.days);
      board.style.setProperty('--print-scale',`${Math.min(1.25,430/Number(board.dataset.minutes))}px`);
    }
    for (const el of container.querySelectorAll('[data-offset]')) {
      el.style.setProperty('--offset',el.dataset.offset);
      if (el.dataset.length) el.style.setProperty('--length',el.dataset.length);
      if (el.dataset.lane) el.style.setProperty('--lane',el.dataset.lane);
      if (el.dataset.lanes) el.style.setProperty('--lanes',el.dataset.lanes);
    }
  }
  const api = {clock,entities,model,html,hydrate};
  if (typeof module !== 'undefined') module.exports = api;
  else root.SNCSTimetable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
