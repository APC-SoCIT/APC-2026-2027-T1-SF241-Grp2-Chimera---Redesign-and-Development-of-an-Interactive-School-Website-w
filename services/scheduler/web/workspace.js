/* exported renderWorkspace, setWorkspaceHeading, initWorkspace */
'use strict';
let timeGroup = '7-8', timePlan = -1;
const schoolGroups = [['7-8','Grades 7–8'],['9-10','Grades 9–10'],['11','Grade 11'],['12','Grade 12']];
const viewLabels = {
  home:['Scheduling dashboard','Prepare the school week, one step at a time.'],
  'load-method':['Input teacher load','Choose manual entry or Excel import.'],
  inputs:['School records','Keep the information needed for scheduling up to date.'],
  'import-loads':['Import teacher loads','Review the workbook before using its contents.'],
  'school-times':['Set school times','Configure routines, breaks, class periods and dismissal.'],
  advisers:['Class advisers','Reserve time for the adviser to be with their section.'],
  checks:['Generate schedules','Check the inputs, then generate a complete draft.'],
  review:['Review schedules','Teacher and class schedules from the same saved timetable.'],
  teacher:['Published preview','Only the published local version is shown here.'],
};
function renderWorkspace() {
  $('current-period-label').textContent = `${data.school_year || 'School year not set'} · ${data.period || 'New period'}`;
}
function setWorkspaceHeading(name) {
  const labels = name === 'inputs' && table === 'loads' ? ['Input teacher load','Enter assignments manually and review each teacher’s workload.'] : viewLabels[name] || viewLabels.home;
  $('page-title').textContent = labels[0]; $('page-intro').textContent = labels[1];
  if (name === 'school-times') renderSchoolTimes();
  if (name === 'advisers') renderAdvisers();
}
function advisersFor(section) { return String(section.advisers ?? section.adviser ?? '').split(',').map(s => s.trim()).filter(Boolean); }
function renderAdvisers() {
  loadOptions('adviser-section',data.sections,'','Choose a section…');
  loadOptions('adviser-teacher',data.teachers,'','Choose a teacher…');
  const names = Object.fromEntries(data.teachers.map(t => [t.id,t.name]));
  $('adviser-list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Section</th><th>Class adviser(s)</th></tr></thead><tbody>${data.sections.map((s,i) => `<tr><td>${esc(s.id)}</td><td>${advisersFor(s).map(t => `<span class="adviser-chip">${esc(names[t] || `${t} · needs matching`)}<button type="button" class="remove" data-remove-adviser="${i}" data-adviser="${esc(t)}" aria-label="Remove ${esc(names[t] || t)} as adviser of ${esc(s.id)}">×</button></span>`).join('') || '<span class="pending">Choose a class adviser</span>'}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Add sections in School records first.</td></tr>'}</tbody></table></div>`;
}
function blankPlan(group) { return {group,days:'Mon-Fri',arrival:'',morning_end:'',recess_start:'',recess_end:'',lunch:'unconfirmed',lunch_start:'',lunch_end:'',dismissal_start:'',dismissal_end:''}; }
function renderSchoolTimes() {
  const plans = data.day_plans || [];
  if (!plans[timePlan] || plans[timePlan].group !== timeGroup) timePlan = plans.findIndex(p => p.group === timeGroup);
  const p = plans[timePlan];
  const field = (key,label,help='') => `<label>${label}<input type="time" data-plan-field="${key}" value="${esc(p?.[key] || '')}">${help ? `<small>${help}</small>` : ''}</label>`;
  const groupRows = data.bells.map((r,i) => ({r,i})).filter(({r}) => r.group === timeGroup || (['11','12'].includes(timeGroup) && r.group === '11-12'));
  $('school-time-editor').innerHTML = `<div class="group-tabs" aria-label="School-day group">${schoolGroups.map(([id,label]) => `<button data-time-group="${id}" aria-pressed="${id === timeGroup}">${label}</button>`).join('')}</div>
    <div class="card school-day-card"><div class="section-head"><div><h3>${schoolGroups.find(([g]) => g === timeGroup)[1]}</h3><p>Times apply to every section in this group. Use a separate setting for a different day.</p></div>${p ? '<button class="subtle" data-add-plan>Add different-day setting</button>' : ''}</div>
    ${p ? `<div class="day-setting-bar"><label>Day setting<select id="time-plan">${plans.map((r,i) => r.group === timeGroup ? `<option value="${i}" ${i === timePlan ? 'selected' : ''}>${esc(r.days || 'Choose days')}</option>` : '').join('')}</select></label><label>Days<input data-plan-field="days" value="${esc(p.days)}" placeholder="Mon-Fri or Fri"><small>Mon-Fri is a starting assumption. Confirm the applicable days.</small></label><button class="remove" data-remove-plan>Remove this day setting</button></div>
    <div class="time-section"><div><span class="time-step">1</span><h4>Start of the school day</h4><p>Flag ceremony and morning routines keep classes and advisers occupied.</p></div><div class="time-fields">${field('arrival','Arrival / routines start')}${field('morning_end','Morning routines end')}</div></div>
    <div class="time-section"><div><span class="time-step">2</span><h4>Recess</h4><p>Choose a different window from other groups.</p></div><div class="time-fields">${field('recess_start','Recess starts')}${field('recess_end','Recess ends')}</div></div>
    <div class="time-section"><div><span class="time-step">3</span><h4>Lunch</h4><p>Confirm whether this group needs lunch for its current school-day hours.</p></div><div class="time-fields"><label>Does this group have lunch?<select data-plan-field="lunch"><option value="unconfirmed" ${p.lunch === 'unconfirmed' ? 'selected' : ''}>Not yet confirmed</option><option value="yes" ${p.lunch === 'yes' ? 'selected' : ''}>Yes, include lunch</option><option value="no" ${p.lunch === 'no' ? 'selected' : ''}>No lunch break</option></select></label>${field('lunch_start','Lunch starts')}${field('lunch_end','Lunch ends')}</div></div>
    <div class="time-section"><div><span class="time-step">4</span><h4>Dismissal</h4><p>Classes end before dismissal. Keep the release window separate from other groups.</p></div><div class="time-fields">${field('dismissal_start','Dismissal starts','No classes may run beyond this time.')}${field('dismissal_end','Adviser supervision ends','How long the adviser must stay for dismissal.')}</div></div>
    <div class="time-actions"><button class="primary" data-save-working>Save school times</button><button class="subtle" data-view="advisers">Assign class advisers →</button></div>` : `<div class="empty-time"><h4>No school-day setting yet</h4><p>Use the coordinator’s starting times above, or enter this group’s times manually.</p><button class="primary" data-add-plan>Enter this group’s times</button></div>`}</div>
    <div class="card school-day-card"><div class="section-head"><div><h3>Class periods</h3><p>Add the 45- or 60-minute periods in which lessons can be placed. Breaks and routines belong above.</p></div></div>
    ${groupRows.some(({r}) => r.group === '11-12') ? '<div class="information-card"><p>Older senior-high periods are shared by Grades 11 and 12. Separate them to configure morning and afternoon classes.</p><button class="secondary" data-split-shs>Separate Grade 11 and Grade 12 periods</button></div>' : ''}
    <form id="class-period-form" class="period-entry"><label>Period name<input id="class-label" placeholder="Period 1" required maxlength="100"></label><label>Days<input id="class-days" value="${esc(p?.days || 'Mon-Fri')}" required></label><label>Starts<input id="class-start" type="time" required></label><label>Length<select id="class-duration"><option value="60">60 minutes</option><option value="45">45 minutes</option></select></label><button class="secondary" type="submit">Add class period</button></form>
    <div class="table-wrap"><table><thead><tr><th>Period</th><th>Days</th><th>Starts</th><th>Ends</th><th></th></tr></thead><tbody>${groupRows.filter(({r}) => r.kind === 'Class').map(({r,i}) => `<tr><td><input aria-label="Period name ${i+1}" data-bell-index="${i}" data-bell-field="label" value="${esc(r.label)}"></td><td><input aria-label="Period days ${i+1}" data-bell-index="${i}" data-bell-field="days" value="${esc(r.days)}"></td><td><input type="time" aria-label="Period start ${i+1}" data-bell-index="${i}" data-bell-field="start" value="${esc(r.start)}"></td><td><input type="time" aria-label="Period end ${i+1}" data-bell-index="${i}" data-bell-field="end" value="${esc(r.end)}"></td><td><button class="remove" data-delete-bell="${i}">Remove</button></td></tr>`).join('') || '<tr><td class="empty" colspan="5">No class periods for this group yet.</td></tr>'}</tbody></table></div><div class="time-actions"><button class="primary" data-save-working>Save class periods</button><button class="secondary" data-check>Check these times</button></div></div>`;
}
function initWorkspace() {
  $('enable-auto').addEventListener('click', () => {
    if (busy || !discardLoadForm()) return;
    let count = 0;
    for (const row of data.loads) if (!row.section && row.allocation !== 'auto') { row.allocation = 'auto'; count++; }
    markDirty(); renderTable(); notice(`${count} unassigned loads will have their sections chosen during generation. Teacher assignments and weekly meeting counts were preserved. Curriculum must be complete; save the working copy when ready.`);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || busy) return;
    if (b.hasAttribute('data-manual')) { switchTable('loads'); showView('inputs'); }
    if (b.hasAttribute('data-save-working')) operation('Saving your changes…', async () => { await saveInputs(); notice('Changes saved on this computer. Run checks before generating a new timetable.'); });
    if (b.dataset.timeGroup) { timeGroup = b.dataset.timeGroup; timePlan = -1; renderSchoolTimes(); }
    if (b.hasAttribute('data-add-plan')) { data.day_plans ||= []; data.day_plans.push(blankPlan(timeGroup)); timePlan = data.day_plans.length-1; markDirty(); renderSchoolTimes(); }
    if (b.hasAttribute('data-remove-plan')) { data.day_plans.splice(timePlan,1); timePlan = -1; markDirty(); renderSchoolTimes(); }
    if (b.dataset.deleteBell !== undefined) { data.bells.splice(Number(b.dataset.deleteBell),1); markDirty(); renderSchoolTimes(); }
    if (b.hasAttribute('data-split-shs')) {
      data.bells = data.bells.flatMap(r => r.group === '11-12' ? [{...r,group:'11'},{...r,group:'12'}] : [r]); markDirty(); renderSchoolTimes();
      notice('Senior-high periods are now separate working copies. Review Grade 12 afternoon times before saving.');
    }
    if (b.dataset.removeAdviser !== undefined) {
      const s = data.sections[Number(b.dataset.removeAdviser)]; s.advisers = advisersFor(s).filter(t => t !== b.dataset.adviser).join(','); delete s.adviser; markDirty(); renderAdvisers();
    }
  });
  $('coordinator-times').addEventListener('click', () => operation('Loading the coordinator’s starting times…', async () => {
    const presets = await request('/api/coordinator-times'); data.day_plans ||= [];
    for (const p of presets) {
      const rows = data.day_plans.filter(r => r.group === p.group);
      if (!rows.length) data.day_plans.push(p);
      else rows.forEach(r => { if (!r.arrival) r.arrival = p.arrival; if (!r.morning_end) r.morning_end = p.morning_end; });
    }
    markDirty(); renderSchoolTimes(); notice('Known arrival and routine times added. Confirm the days, breaks, lunch policy and dismissal times; then save. Existing times were preserved.');
  }));
  $('school-time-editor').addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.planField) { data.day_plans[timePlan][el.dataset.planField] = el.value; markDirty(); }
    if (el.dataset.bellField) { data.bells[Number(el.dataset.bellIndex)][el.dataset.bellField] = el.value; markDirty(); }
  });
  $('school-time-editor').addEventListener('change', e => {
    if (e.target.id === 'time-plan') { timePlan = Number(e.target.value); renderSchoolTimes(); }
    if (e.target.dataset.planField === 'lunch' && e.target.value === 'no') {
      data.day_plans[timePlan].lunch_start = data.day_plans[timePlan].lunch_end = ''; renderSchoolTimes();
    }
  });
  $('school-time-editor').addEventListener('submit', e => {
    if (e.target.id !== 'class-period-form' || busy) return; e.preventDefault();
    const match = /^(\d\d):(\d\d)$/.exec($('class-start').value);
    if (!match || !$('class-label').value.trim()) return;
    const end = Number(match[1])*60+Number(match[2])+Number($('class-duration').value);
    if (end >= 1440) { notice('The class period must end on the same day.','error'); return; }
    data.bells.push({group:timeGroup,days:$('class-days').value,label:$('class-label').value.trim(),kind:'Class',start:$('class-start').value,end:`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`});
    markDirty(); renderSchoolTimes(); notice('Class period added to the working copy. Save class periods to keep it.');
  });
  $('adviser-form').addEventListener('submit', e => {
    e.preventDefault(); if (busy) return;
    const s = data.sections.find(s => s.id === $('adviser-section').value), teacher = $('adviser-teacher').value;
    if (!s || !teacher) { notice('Choose a section and teacher first.','error'); return; }
    s.advisers = [...new Set([...advisersFor(s),teacher])].join(','); delete s.adviser; markDirty(); renderAdvisers(); notice('Adviser added to the working copy. Save adviser assignments to keep it.');
  });
}
