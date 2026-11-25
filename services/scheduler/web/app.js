'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const specs = {
  teachers: {title:'Teachers', help:'Keep one record per teacher. Other teaching minutes count toward workload; fixed duties also need unavailable times.', fields:[['id','Teacher ID'],['name','Teacher name'],['limit','Regular min/week','number'],['extra_minutes','Other teaching min/week','number'],['elementary','Teaches elementary','boolean'],['availability_confirmed','All external times confirmed','boolean'],['approved_overload','Approved extra min/week','number'],['overload_reason','Allowance reason & approver']]},
  sections: {title:'Sections', help:'A combined SHS section lists its strands separated by commas. Core classes occupy all strands.', fields:[['id','Section name'],['grade','Grade','grade'],['strands','Strands (e.g. ABM, ICT)']]},
  subjects: {title:'Subjects', help:'Include only subjects offered in this period. Use explicit curriculum requirements for strand and subtrack offerings.', fields:[['id','Subject name'],['grade','Grade / Any','anygrade'],['kind','Type','kind'],['strand','Strand (if applicable)']]},
  requirements: {title:'Curriculum', help:'Required lessons, independent of teacher assignments. A required lesson with no teacher blocks generation. Check imported requirements against the official curriculum.', fields:[['id','Requirement ID'],['section','Section','sections'],['subject','Subject','subjects'],['strand','Strand only'],['n60','60-min/week','number'],['n45','45-min/week','number']]},
  loads: {title:'Teaching loads', help:'One teacher + subject + section per record. Enter 60- and 45-minute meetings separately; totals are recalculated.', fields:[['id','Load ID'],['teacher','Teacher','teachers'],['section','Section','sections'],['subject','Subject','subjects'],['strand','Strand only'],['n60','60-min/week','number'],['n45','45-min/week','number']]},
  bells: {title:'Bell times', help:'Use actual school times, including breaks. Unused rows may have both times blank. Supported class lengths: 45 or 60 minutes.', fields:[['group','Grade group','group'],['days','Days (Mon-Thu, Fri)'],['label','Period / break'],['kind','Type','bellkind'],['start','Start time'],['end','End time']]},
  unavailable: {title:'Unavailable times', help:'Record all fixed teaching duties and unavailable intervals. Every entered row needs a teacher, days and valid start/end times.', fields:[['teacher','Teacher','teachers'],['days','Days (Mon,Wed or Mon-Fri)'],['start','Start time'],['end','End time'],['reason','Reason']]},
};
let data, workspaceId = null, revision = null, dirty = true, table = 'loads', preview = null, run = null, published = null, busy = false;
let editingLoadId = null, loadFormDirty = false;
let draftAudience = 'section';
const knownRevisions = new Map();
const periodKey = () => JSON.stringify([data.school_year.trim(), data.period.trim()]);

function workbookLocation(issue) {
  const column = specs[issue.table]?.fields.find(([key]) => key === issue.field)?.[1] || issue.field;
  return [issue.sheet, issue.row ? 'row ' + issue.row : '', column].filter(Boolean).join(' · ');
}

async function request(path, payload, raw = false) {
  const response = await (window.SNCSPortal?.fetch || fetch)(path, payload === undefined ? {cache:'no-store'} : {
    method:'POST', headers:{'X-SNCS-Local':'1', 'Content-Type':raw ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json'},
    body:raw ? payload : JSON.stringify(payload),
  });
  const value = await response.json();
  if (!response.ok) {
    const rowIssue = value.issues?.[0];
    const error = new Error(rowIssue ? workbookLocation(rowIssue) + ': ' + rowIssue.message :
      value.error || value.message || 'The request failed.');
    error.fields = value.fields;
    error.issues = value.issues;
    throw error;
  }
  return value;
}

function notice(text, kind = '') { $('notice').textContent = text; $('notice').className = kind; }
async function operation(message, action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button,input,select').forEach((b) => { b.disabled = true; });
  notice(message, 'busy');
  try { await action(); }
  catch (error) { notice(error.message, 'error'); }
  finally {
    busy = false;
    document.querySelectorAll('button,input,select').forEach((b) => { b.disabled = false; });
    updatePublishButton();
  }
}
function markDirty() {
  dirty = true;
  data.confirmed = false;
  $('confirmed').checked = false;
  $('report').innerHTML = '<p>Inputs changed. Run checks again before generating a new timetable.</p>';
  updateState();
}
function updateState() {
  $('save-state').textContent = loadFormDirty ? 'Teaching-load form not saved' : dirty ? 'Unsaved changes' : 'Saved on this computer';
  $('dataset-badge').textContent = data.trial ? 'TRIAL · REAL LOADS / TEST RULES' : data.demo ? 'DEMO DATA' : 'SCHOOL DATA · REVIEW REQUIRED';
  $('dataset-badge').classList.toggle('gold', !!data.demo);
  updatePublishButton();
  renderWorkspace();
}
function setData(value, id = null, rev = null) {
  data = value; workspaceId = id; revision = rev; dirty = !rev; run = null; published = null;
  editingLoadId = null; loadFormDirty = false;
  $('school-year').value = data.school_year;
  $('period').value = data.period;
  $('daily').value = data.max_per_day;
  $('spread-lessons').checked = !!data.spread_lessons;
  $('confirmed').checked = !!data.confirmed;
  $('search').value = '';
  $('load-list-teacher').value = '';
  if (rev) knownRevisions.set(periodKey(), rev);
  $('run-detail').innerHTML = '<p>Generate or open a saved version for this period.</p>';
  $('teacher-detail').innerHTML = '<p>Refresh to view this period’s published version.</p>';
  $('report').innerHTML = '<p>Run readiness checks for this working copy.</p>';
  $('source-detail').hidden = !data.source_notes?.length || data.demo;
  $('source-detail').innerHTML = `<h3>School data · input review</h3><p>${data.teachers.length} teachers · ${data.sections.length} sections · ${data.loads.length} teaching loads. Imported values remain editable. Generation waits for complete, valid inputs.</p><details><summary>Source & preparation notes</summary><ul>${(data.source_notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>`;
  renderMetrics(); renderTable(); updateState(); refreshVersions();
  const active = document.querySelector('.view:not([hidden])');
  if (active) setWorkspaceHeading(active.id);
}
function showView(name) {
  if (name !== 'inputs' && loadFormDirty && !discardLoadForm()) return;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== name; });
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  setWorkspaceHeading(name);
  if (name === 'teacher') loadTeacher().catch((e) => notice(e.message, 'error'));
}
function renderMetrics() {
  const values = [['Teachers',data.teachers.length],['Sections',data.sections.length],['Teaching loads',data.loads.length],['Meetings / week',data.loads.reduce((n,r) => n + (Number(r.n60) || 0) + (Number(r.n45) || 0),0)]];
  $('metrics').innerHTML = values.map(([label,count]) => `<div class="metric"><span>${label}</span><strong>${count}</strong></div>`).join('');
}
function optionsFor(type) {
  if (['teachers','sections','subjects'].includes(type)) return data[type].map((r) => [r.id, type === 'teachers' ? `${r.id} · ${r.name}` : r.id]);
  const lists = {grade:[7,8,9,10,11,12],anygrade:['Any',7,8,9,10,11,12],kind:['Core','Strand','Homeroom'],group:['7-8','9-10','11','12','11-12'],bellkind:['Class','Recess','Lunch']};
  return (lists[type] || []).map((v) => [v,v]);
}
function fieldHtml(row, index, field) {
  const [key,label,type] = field, value = row[key] ?? '', attrs = `data-index="${index}" data-field="${key}" aria-label="${esc(label)} for record ${index+1}"`;
  if (type === 'boolean') return `<input type="checkbox" ${attrs} ${value === true ? 'checked' : ''}>`;
  if (type && type !== 'number') {
    const choices = optionsFor(type);
    if (!choices.some(([v]) => String(v) === String(value))) choices.unshift([value, value || 'Choose…']);
    return `<select ${attrs}>${choices.map(([v,l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  // Invalid imported numeric cells stay visible as text until the operator corrects them.
  const numeric = type === 'number' && (typeof value === 'number' || /^\d*$/.test(String(value)));
  return `<input ${attrs} type="${numeric ? 'number' : 'text'}" ${numeric ? 'min="0" step="1"' : ''} value="${esc(value)}" class="${['name','id','overload_reason','reason'].includes(key) ? 'wide' : ''}">`;
}
function renderTable() {
  const spec = specs[table], query = $('search').value.toLowerCase();
  $('table-title').textContent = spec.title;
  $('table-help').textContent = spec.help;
  $('enable-auto').hidden = table !== 'loads' || !data.loads.some(r => !r.section && r.allocation !== 'auto');
  $('input-heading').textContent = table === 'loads' ? 'Enter teacher loads manually' : spec.title;
  $('input-intro').textContent = table === 'loads' ? 'Select a teacher, subject and required meetings. Choose sections yourself or let the scheduler assign them.' : spec.help;
  $('load-entry').hidden = table !== 'loads';
  $('teacher-filter-label').hidden = table !== 'loads';
  $('teacher-load-summary').hidden = table !== 'loads' || !$('load-list-teacher').value;
  $('add-row').textContent = table === 'loads' ? '+ Add teaching load' : '+ Add record';
  $('table-tabs').innerHTML = Object.entries(specs).map(([key,s]) => `<button data-table="${key}" class="${table === key ? 'active' : ''}" aria-pressed="${table === key}">${s.title} <span>(${data[key].length})</span></button>`).join('');
  if (table === 'loads') {
    const selected = $('load-list-teacher').value;
    $('load-list-teacher').innerHTML = '<option value="">All teachers</option>' + data.teachers.map(t => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    renderLoadList(query);
    if (!loadFormDirty && !editingLoadId) resetLoadForm();
    return;
  }
  const rows = data[table].map((r,i) => ({r,i})).filter(({r}) => !query || Object.values(r).some((v) => String(v).toLowerCase().includes(query)));
  $('input-table').innerHTML = `<thead><tr><th>Row</th>${spec.fields.map((f) => `<th scope="col">${esc(f[1])}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.map(({r,i}) => `<tr><td class="row-number">${esc(r._row ?? i+1)}</td>${spec.fields.map((f) => `<td>${fieldHtml(r,i,f)}</td>`).join('')}<td><button class="remove" data-remove="${i}" aria-label="Remove record ${i+1}">Remove</button></td></tr>`).join('') || `<tr><td colspan="${spec.fields.length+2}" class="empty">No records. Add a record or import the SNCS template.</td></tr>`}</tbody>`;
}

function wholeNumber(value) {
  if (typeof value === 'boolean' || !/^\d+(?:\.0+)?$/.test(String(value))) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}
function loadMinutes(row) {
  const a = wholeNumber(row.n60), b = wholeNumber(row.n45);
  return a === null || b === null ? null : a * 60 + b * 45;
}
function renderLoadList(query) {
  const teachers = Object.fromEntries(data.teachers.map((t) => [t.id,t.name]));
  const teacherId = $('load-list-teacher').value;
  const teacherLoads = data.loads.filter(r => r.teacher === teacherId);
  const teacher = data.teachers.find(t => t.id === teacherId);
  $('teacher-load-summary').hidden = !teacher;
  if (teacher) {
    const valid = teacherLoads.every(r => loadMinutes(r) !== null);
    const total = valid ? teacherLoads.reduce((n,r) => n + loadMinutes(r),0) : null;
    $('teacher-load-summary').textContent = `${teacher.name} · ${teacherLoads.length} class assignments · ${total === null ? 'Meeting counts need review' : `${Math.floor(total/60)} hr ${total%60} min of assigned teaching per week`}`;
  }
  const rows = data.loads.map((r,i) => ({r,i})).filter(({r}) => (!teacherId || r.teacher === teacherId) && (!query || [...Object.values(r), teachers[r.teacher]].some((v) => String(v ?? '').toLowerCase().includes(query))));
  $('input-table').innerHTML = `<thead><tr><th scope="col">Teacher</th><th scope="col">Subject & section</th><th scope="col">Meetings / week</th><th scope="col">Weekly minutes</th><th scope="col">Action</th></tr></thead><tbody>${rows.map(({r,i}) => `<tr><td><strong>${esc(teachers[r.teacher] || r.teacher || 'Teacher not assigned')}</strong><small class="record-meta">${esc(r.id)}</small></td><td>${esc(r.subject || 'Subject missing')}<small class="record-meta">${esc(r.section || (r.allocation === 'auto' ? 'Section chosen during generation' : 'Section not assigned'))}${r.strand ? ` · ${esc(r.strand)}` : ''}</small></td><td>${esc(r.n60 ?? '?')} × 60 min<br>${esc(r.n45 ?? '?')} × 45 min</td><td>${loadMinutes(r) === null ? 'Needs review' : `${loadMinutes(r)} min`}</td><td><button class="secondary" data-edit-load="${esc(r.id)}" aria-label="Edit teaching load ${i+1}">Edit</button><button class="remove" data-remove="${i}" aria-label="Remove record ${i+1}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No teaching loads yet. Add the first assignment using the form above.</td></tr>'}</tbody>`;
}
function loadOptions(id, rows, selected = '', placeholder = 'Choose…') {
  const choices = rows.map((r) => [String(r.id ?? ''),r.id === '__AUTO__' ? r.name : r.name ? `${r.id} · ${r.name}` : r.id]).filter(([v]) => v);
  if (selected && !choices.some(([v]) => v === selected)) choices.unshift([selected,`${selected} (check this record)`]);
  $(id).innerHTML = `<option value="">${esc(placeholder)}</option>` + choices.map(([v,label]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}
function resetLoadForm(row = null) {
  editingLoadId = row?.id || null;
  loadFormDirty = false;
  $('load-form').reset();
  $('load-errors').hidden = true;
  $('load-form').querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  loadOptions('load-teacher',data.teachers,row?.teacher || '','Choose a teacher…');
  loadOptions('load-section',[{id:'__AUTO__',name:'Let the scheduler choose sections'},...data.sections],row?.allocation === 'auto' && !row.section ? '__AUTO__' : row?.section || '','Choose how to assign sections…');
  loadOptions('load-subject',eligibleSubjects(row?.section),row?.subject || '','Choose a subject…');
  $('load-n60').value = row?.n60 ?? 0;
  $('load-n45').value = row?.n45 ?? 0;
  $('load-strand').value = row?.strand || '';
  $('load-section-count').value = 1;
  $('load-form-title').textContent = row ? 'Edit teaching load' : 'Add a teaching load';
  $('load-edit-badge').textContent = row ? 'EDITING ASSIGNMENT' : 'NEW ASSIGNMENT';
  $('load-submit').textContent = row ? 'Save teaching-load changes' : 'Save teaching load locally';
  $('load-cancel').textContent = row ? 'Cancel edit' : 'Clear form';
  const missing = ['teachers','sections','subjects'].filter((key) => !data[key].length);
  $('load-prerequisites').hidden = !missing.length;
  $('load-prerequisites').innerHTML = missing.length ? `<p>Add the records below first. You can enter all of them manually.</p>${missing.map((key) => `<button type="button" class="secondary" data-table="${key}">Add ${esc(specs[key].title.toLowerCase())}</button>`).join(' ')}` : '';
  $('load-form').hidden = !!missing.length;
  syncLoadForm();
  updateState();
}
function eligibleSubjects(sectionId) {
  const section = data.sections.find((s) => s.id === sectionId);
  if (!section) return data.subjects;
  const strands = String(section.strands || '').split(',').map((s) => s.trim());
  return data.subjects.filter((s) => (s.grade === 'Any' || String(s.grade) === String(section.grade)) && (!s.strand || strands.includes(s.strand)));
}
function matchingRequirement() {
  const subject = data.subjects.find((s) => s.id === $('load-subject').value);
  return data.requirements.filter((r) => r.section === $('load-section').value && r.subject === $('load-subject').value && (r.strand || subject?.strand || '') === (subject?.strand || ''));
}
function syncLoadForm(prefill = false) {
  const automatic = $('load-section').value === '__AUTO__';
  $('load-section-count-label').hidden = !automatic || !!editingLoadId;
  const subject = data.subjects.find((s) => s.id === $('load-subject').value);
  $('load-strand').value = subject?.strand || '';
  $('load-strand-label').hidden = !subject?.strand;
  const ready = !!$('load-section').value && !!subject;
  const requirements = ready && !automatic ? matchingRequirement() : [];
  if (prefill && requirements.length === 1) {
    $('load-n60').value = requirements[0].n60 ?? '';
    $('load-n45').value = requirements[0].n45 ?? '';
  }
  $('load-curriculum').textContent = !ready ? 'Choose a section and subject to see the curriculum requirement.' : requirements.length === 1 ? `Curriculum requirement: ${requirements[0].n60 ?? '?'} × 60-minute and ${requirements[0].n45 ?? '?'} × 45-minute meetings per week.` : requirements.length > 1 ? 'This class has duplicate curriculum records. Correct them in Curriculum before saving.' : 'This class has no curriculum requirement yet. Add it in Curriculum or use the option below.';
  $('load-create-label').hidden = !ready || requirements.length !== 0;
  if (automatic) {
    $('load-create-label').hidden = true; $('load-create').checked = false;
    $('load-curriculum').textContent = 'The scheduler will choose distinct eligible sections that need this subject and these weekly meetings. Enter the curriculum requirements for each section before generating. Counts below are per section.';
  }
  if (requirements.length) $('load-create').checked = false;
  const counts = {n60:$('load-n60').value,n45:$('load-n45').value};
  const each = loadMinutes(counts), count = automatic && !editingLoadId ? wholeNumber($('load-section-count').value) : 1;
  const minutes = each === null || count === null ? null : each * count;
  $('load-total').textContent = minutes === null ? 'Enter whole meeting counts' : automatic && count > 1 ? `${minutes} min total · ${count} sections × ${each} min` : `${minutes} min · ${Number(counts.n60) + Number(counts.n45)} meetings`;
  const teacher = data.teachers.find((t) => t.id === $('load-teacher').value);
  $('load-budget').classList.remove('over-budget');
  if (!teacher) { $('load-budget').textContent = 'Select a teacher to see their workload.'; return; }
  const otherLoads = data.loads.filter((r) => r.teacher === teacher.id && r.id !== editingLoadId);
  const extra = wholeNumber(teacher.extra_minutes), limit = wholeNumber(teacher.limit), allowance = wholeNumber(teacher.approved_overload);
  if (minutes === null || extra === null || limit === null || allowance === null || otherLoads.some((r) => loadMinutes(r) === null)) {
    $('load-budget').textContent = 'Some meeting counts or workload limits need correction before a total can be calculated.';
    return;
  }
  const projected = otherLoads.reduce((n,r) => n + loadMinutes(r),0) + extra + minutes, allowed = limit + allowance;
  $('load-budget').classList.toggle('over-budget',projected > allowed);
  $('load-budget').textContent = `After saving: ${projected} of ${allowed} allowed min/week for ${teacher.name}, including ${extra} other teaching minutes. ${projected > allowed ? `${projected - allowed} minutes over the limit.` : `${allowed - projected} minutes remaining.`}`;
}
function discardLoadForm() {
  if (loadFormDirty && !window.confirm('Discard the unsaved teaching-load form? Your saved assignments will remain.')) return false;
  resetLoadForm();
  return true;
}
function switchTable(name) {
  if (!specs[name] || (name !== table && !discardLoadForm())) return;
  table = name; $('search').value = ''; renderTable();
  showView('inputs');
}
function editLoad(id) {
  if (loadFormDirty && !discardLoadForm()) return;
  const row = data.loads.find((r) => r.id === id);
  if (!row) { notice('That teaching load is no longer in this working copy.','error'); return; }
  resetLoadForm(row);
  $('load-teacher').focus();
}
function showLoadErrors(fields) {
  const entries = Object.entries(fields || {assignment:'Review the selected class and meeting counts.'});
  $('load-errors').innerHTML = `<strong>The teaching load was not saved.</strong><ul>${entries.map(([,message]) => `<li>${esc(message)}</li>`).join('')}</ul>`;
  $('load-errors').hidden = false;
  for (const [key] of entries) $('load-' + key)?.setAttribute('aria-invalid','true');
  $('load-errors').setAttribute('tabindex','-1'); $('load-errors').focus();
}
function renderReport(report, target = 'report') {
  const issue = (r, warning) => {
    const times = ['bells','day_plans'].includes(r.table), location = times ? 'School times' : specs[r.table]?.title || r.sheet;
    const link = warning ? '' : times ? '<button class="subtle" data-view="school-times">Review school times →</button>' : specs[r.table] ? `<button class="subtle" data-table="${esc(r.table)}" data-find="${esc(r.record || '')}">Review ${esc(specs[r.table].title.toLowerCase())} →</button>` : '';
    return `<div class="issue ${warning ? 'warning' : ''}">${esc(r.message)}${location ? `<small>${esc(location)}${r.row ? ` · row ${esc(r.row)}` : ''}</small>` : ''}${link}</div>`;
  };
  const groups = new Map();
  report.errors.forEach(r => { const key = r.code || 'INPUT'; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(r); });
  const titles = {REFERENCE:'Missing or unknown section / subject',MISSING_FREQUENCY:'Curriculum meeting counts to confirm',MISSING_BELLS:'Bell times needed',TIME:'Invalid or missing time',EXTERNAL_COMMITMENTS:'External workload to confirm',EXTERNAL_TIMES:'External teaching times needed'};
  Object.assign(titles,{DAY_PLAN:'School-day settings to complete',STAGGER:'Groups with overlapping breaks or dismissal',SCHOOL_HOURS:'Class periods outside school hours',ADVISER:'Class advisers to assign',ADVISER_CONFLICT:'Conflicting adviser duties',HOMEROOM_ADVISER:'Homeroom adviser to correct',ALLOCATION:'Sections available for automatic assignment',UNAPPROVED_CLASS:'Curriculum and teacher loads to reconcile',CLASS_CAPACITY:'Classes needing more available periods',SECTION_CAPACITY:'Sections needing more available periods',WORKLOAD:'Teachers exceeding their workload limit',UNSTAFFED:'Required classes needing a teacher'});
  $(target).innerHTML = `<div class="report-title"><h3 class="${report.errors.length ? 'status-bad' : 'status-good'}">${report.errors.length ? `${report.errors.length} issues to resolve` : 'Ready for a draft'}</h3><span class="pill">${report.warnings.length} notes</span></div><p>${report.errors.length ? 'Correct these inputs, then run checks again. No schedule has been generated from this report. Expand a group for the affected records.' : 'These preflight checks passed. The solver must still find a complete timetable and the result must pass independent checks.'}</p>${[...groups].map(([key,rows]) => `<details class="issue-group"><summary>${esc(titles[key] || key.replaceAll('_',' '))} (${rows.length})</summary>${rows.map(r => issue(r,false)).join('')}</details>`).join('')}${report.warnings.map((r) => issue(r,true)).join('')}${report.capacity.length ? `<details class="capacity"><summary>Teacher workload totals (${report.capacity.length})</summary><div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Required min/week</th><th>Allowed min/week</th><th>Remaining</th></tr></thead><tbody>${report.capacity.map((r) => `<tr><td>${esc(r.teacher)}</td><td>${r.required}</td><td>${r.allowed}</td><td class="${r.remaining < 0 ? 'status-bad' : ''}">${r.remaining}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
}
async function refreshWorkspaces() {
  const items = await request('/api/workspaces');
  $('saved-period').innerHTML = '<option value="">Choose a period…</option>' + items.map((w) => `<option value="${w.id}" ${workspaceId === w.id ? 'selected' : ''}>${esc(w.school_year)} · ${esc(w.period)}</option>`).join('');
}
async function refreshVersions() {
  const versions = workspaceId ? await request('/api/runs?id=' + encodeURIComponent(workspaceId)) : [];
  $('versions').innerHTML = '<option value="">Choose a version…</option>' + versions.map((r) => `<option value="${r.id}" ${run?.id === r.id ? 'selected' : ''}>${esc(r.created.slice(0,19).replace('T',' '))} UTC · ${esc(r.status)} · ${esc(r.solver)}</option>`).join('');
}
async function saveInputs() {
  if (loadFormDirty) throw new Error('Save the teaching-load form first, or clear it before saving the other inputs.');
  const submitted = JSON.stringify(data);
  const saved = await request('/api/save', {data, revision:knownRevisions.get(periodKey()) || null});
  workspaceId = saved.id; revision = saved.revision; dirty = JSON.stringify(data) !== submitted;
  knownRevisions.set(periodKey(),revision);
  updateState(); await refreshWorkspaces(); await refreshVersions();
}
async function checks() {
  const report = await request('/api/validate', {data});
  renderReport(report); showView('checks');
  notice(report.errors.length ? `${report.errors.length} input issue${report.errors.length === 1 ? '' : 's'} found. Review the list below.` : 'Preflight passed. You can generate a draft for review.', report.errors.length ? 'error' : '');
  return report;
}
function weeklySchedule(target, version, type, id) {
  $(target).innerHTML = SNCSTimetable.html(version,type,id);
  SNCSTimetable.hydrate($(target));
}
function audienceOptions(version,type) {
  return SNCSTimetable.entities(version,type).map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
}
function renderDraftSchedule(type = draftAudience) {
  draftAudience = type;
  document.querySelectorAll('[data-audience]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.audience === type)));
  $('schedule-entity-label').textContent = type === 'teacher' ? 'Teacher' : 'Section';
  $('schedule-entity').innerHTML = audienceOptions(run,type);
  weeklySchedule('draft-schedule',run,type,$('schedule-entity').value);
}
function snapshotLoads(version) {
  const names = Object.fromEntries(version.snapshot.teachers.map(t => [t.id,t.name]));
  return `<details class="lesson-details"><summary>Teaching loads used for this version (${version.snapshot.loads.length})</summary><p class="muted">These are the frozen generation inputs. Later working-copy edits do not change them.</p><div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Subject</th><th>Section / strand</th><th>60-min/week</th><th>45-min/week</th><th>Minutes/week</th></tr></thead><tbody>${version.snapshot.loads.map(l => `<tr><td>${esc(names[l.teacher] || l.teacher)}</td><td>${esc(l.subject)}</td><td>${esc(l.section || (l.allocation === 'auto' ? 'Assigned during generation' : 'Not assigned'))}${l.strand ? ` · ${esc(l.strand)}` : ''}</td><td>${esc(l.n60)}</td><td>${esc(l.n45)}</td><td>${Number(l.n60)*60+Number(l.n45)*45}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function printSchedule(version,type,id) {
  document.querySelector('.print-root')?.remove();
  const root = document.createElement('div'); root.className = 'print-root';
  root.innerHTML = SNCSTimetable.html(version,type,id); document.body.append(root); SNCSTimetable.hydrate(root);
  window.addEventListener('afterprint',() => root.remove(),{once:true});
  window.print();
}
function trialNotes(version) {
  if (!version.snapshot.trial) return '';
  const notes = version.snapshot.source_notes || [];
  const hours = notes.find(n => /^(FULL DAYTIME ASSUMPTION:|CONFIRMED BOUNDARY:|EXTENDED-HOURS EXPERIMENT:)/.test(n));
  return `<aside class="source-card"><h3>Trial assumptions · school confirmation needed</h3>${hours ? `<p><strong>${esc(hours)}</strong></p>` : ''}<details><summary>Review all trial inputs and changes</summary><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details></aside>`;
}
async function downloadSchedules(version,type) {
  const response = await fetch(window.SNCSPortal?.assetURL('timetable.css') || '/timetable.css',{cache:'no-store'});
  if (!response.ok) throw new Error('Timetable styles could not be loaded. Try again.');
  const css = await response.text();
  const root = document.createElement('div'); root.className = 'print-root';
  root.innerHTML = SNCSTimetable.entities(version,type).map(r => SNCSTimetable.html(version,type,r.id)).join('');
  SNCSTimetable.hydrate(root);
  const title = type === 'teacher' ? 'Teacher schedules' : 'Class schedules';
  const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | SNCS</title><style>${css}</style></head><body class="schedule-document"><p class="document-help">${title} · ${esc(version.snapshot.school_year)} · ${esc(version.snapshot.period)}. Open in a browser to view the full weekly grids. Print at a readable scale; longer days may need larger paper. ${version.snapshot.trial ? 'PROVISIONAL TRIAL: real teacher loads, test times and rules; not school-approved.' : version.snapshot.demo ? 'SYNTHETIC DEMO DATA.' : 'School input snapshot.'}</p>${trialNotes(version)}${root.outerHTML}</body></html>`;
  const url = URL.createObjectURL(new Blob([documentHtml],{type:'text/html;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `sncs-${type}-schedules-${version.id.slice(0,8)}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  notice(`${title} downloaded from version ${version.id.slice(0,8)}. Open the HTML file and print or save as PDF.`);
}
function renderRun() {
  if (!run) return;
  const result = run.result, policyErrors = run.policy_errors || [], good = !!result.verified && !policyErrors.length;
  $('run-detail').innerHTML = `<div class="report-title"><h3 class="${good ? 'status-good' : 'status-bad'}">${good ? (run.snapshot.trial ? 'Trial timetable · provisional inputs' : 'Complete timetable · checks passed') : esc(result.status.replaceAll('_',' '))}</h3><span class="pill">${esc(run.status.toUpperCase())}</span></div><p>${esc(run.snapshot.school_year)} · ${esc(run.snapshot.period)}${run.snapshot.trial ? ' · PROVISIONAL TRIAL — NOT SCHOOL-APPROVED' : run.snapshot.demo ? ' · DEMO ONLY' : ''} · ${result.entries.length} meetings${result.seconds !== undefined ? ` · ${result.seconds}s search` : ''}</p>${good ? '<p>One timetable, two views. All supplied required meetings are placed. Teacher and section/strand overlap, bell times and availability checks passed. Rooms and other unmodeled school rules still require review.</p>' : `<p>${esc(result.message || 'Correct the input errors and generate again.')}</p>`}${(result.explanation || []).map((e) => `<div class="issue">${esc(e)}</div>`).join('')}${!good && result.report?.errors.length ? `<div id="failed-report"></div>` : ''}${good ? `<div class="schedule-browser"><div class="schedule-tabs" aria-label="Schedule audience"><button class="secondary" data-audience="section" aria-pressed="true">Class schedules</button><button class="secondary" data-audience="teacher" aria-pressed="false">Teacher schedules</button></div><div class="schedule-controls"><label><span id="schedule-entity-label">Section</span><select id="schedule-entity"></select></label><button class="secondary" id="print-draft">Print / save this schedule as PDF</button></div><p class="muted">Choose any teacher or section. Both views use the same saved version.</p><div id="draft-schedule"></div><div class="schedule-downloads"><button class="secondary" data-download-audience="teacher">Download all teacher schedules</button><button class="secondary" data-download-audience="section">Download all class schedules</button></div></div>${snapshotLoads(run)}<div class="exports"><a href="/api/export?id=${run.id}&format=csv">Download meetings CSV</a><a href="/api/export?id=${run.id}">Download version & inputs</a></div><div class="publish-row"><label>Coordinator / reviewer<input id="reviewer" placeholder="Name for the local review record" maxlength="180"></label><button id="publish" class="primary">Publish locally</button></div><p class="muted" id="publish-help"></p>` : ''}`;
  if (policyErrors.length) {
    $('run-detail').querySelector('h3').textContent = 'Historical result exceeds 5:00 PM cutoff';
    $('run-detail').insertAdjacentHTML('afterbegin',`<div class="issue"><strong>Withdrawn from current review.</strong> This historical result used hours the school does not allow. Open the corrected 5:00 PM period instead.</div>${policyErrors.map(e => `<div class="issue">${esc(e)}</div>`).join('')}`);
  }
  if (good) {
    $('run-detail').querySelector('.schedule-browser').insertAdjacentHTML('beforebegin',trialNotes(run));
    for (const warning of (result.report?.warnings || []).filter((issue) => issue.code === 'WORKLOAD')) {
      $('run-detail').querySelector('.schedule-browser').insertAdjacentHTML('beforebegin', '<div class="issue warning">' + esc(warning.message) + '</div>');
    }
    if (result.quality) $('run-detail').querySelector('.schedule-browser').insertAdjacentHTML('beforebegin',`<p>Weekly distribution: ${esc(result.quality.extra_same_day_meetings)} extra same-day class meetings.${result.quality.optimal ? ' This distribution score is optimal for the entered rules.' : ' Best distribution found within the search time; further improvement may be possible.'}</p>`);
    renderDraftSchedule();
  }
  if (!good && result.report?.errors.length) renderReport(result.report,'failed-report');
  updatePublishButton();
}
function updatePublishButton() {
  const button = $('publish');
  if (!button || !run) return;
  button.disabled = busy || dirty || run.status !== 'draft' || !run.snapshot.confirmed || !run.result.verified;
  if (run.snapshot.trial) { button.disabled = true; $('publish-help').textContent = 'Provisional trial only. This version cannot be published as a school schedule.'; return; }
  if (run.status === 'draft' && run.result.report?.warnings?.some((issue) => issue.code === 'WORKLOAD')) {
    button.disabled = true;
    $('publish-help').textContent = 'Resolve the workload warnings or record approved allowances, then generate a fresh draft before publication.';
    return;
  }
  $('publish-help').textContent = dirty ? 'Unsaved edits: save and generate a fresh draft before publication.' : !run.snapshot.confirmed ? 'This draft used unconfirmed inputs. Confirm inputs in Readiness checks, then generate a new draft.' : run.status === 'published' ? 'This is the published local version.' : run.status !== 'draft' ? 'Open or generate a draft to publish.' : 'Local publication rechecks the saved version and keeps one published schedule for this period.';
}
async function loadTeacher() {
  if (!workspaceId) { $('teacher-detail').innerHTML = '<p>Save the period, generate a verified draft, and publish it locally first.</p>'; return; }
  published = await request('/api/published?id=' + encodeURIComponent(workspaceId));
  if (!published) { $('teacher-detail').innerHTML = '<p>No schedule is published for this period. Unpublished drafts are not visible.</p>'; return; }
  $('teacher-detail').innerHTML = `<div class="report-title"><h3>Published schedule${published.snapshot.demo ? ' · DEMO' : ''}</h3><span class="pill">READ ONLY PREVIEW</span></div><p>${esc(published.snapshot.school_year)} · ${esc(published.snapshot.period)} · Reviewed locally by ${esc(published.reviewer)}</p><p class="muted">This is a local teacher-view preview. Account-based access is not connected.</p><div class="schedule-controls"><label>Teacher<select id="teacher-filter">${audienceOptions(published,'teacher')}</select></label><button class="secondary" id="print-published">Print / save as PDF</button></div><div id="published-schedule"></div>`;
  weeklySchedule('published-schedule',published,'teacher',$('teacher-filter').value);
}
function discardOkay() { return (!dirty && !loadFormDirty) || window.confirm('You have unsaved input changes. Continue without saving them?'); }
function downloadWorking() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'scheduling-working-copy.json'; link.click(); URL.revokeObjectURL(url);
}

document.addEventListener('click', (event) => {
  const download = event.target.closest('a[href^="/api/export"]');
  if (download && window.SNCSPortal) {
    event.preventDefault();
    operation('Downloading the saved schedule…',async () => {
      const response = await window.SNCSPortal.fetch(download.getAttribute('href'));
      if (!response.ok) { const value=await response.json(); throw new Error(value.error || 'The schedule could not be downloaded.'); }
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement('a');link.href=url;
      link.download=download.getAttribute('href').includes('format=csv')?'schedule.csv':'schedule-version.json';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    return;
  }
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.table) {
    switchTable(button.dataset.table);
    if (button.dataset.find) { $('search').value = button.dataset.find; renderTable(); }
  }
  if (button.dataset.editLoad) editLoad(button.dataset.editLoad);
  if (button.hasAttribute('data-check')) operation('Checking assignments, times and capacity…',checks);
  if (button.dataset.remove !== undefined) {
    if (table === 'loads' && !discardLoadForm()) return;
    data[table].splice(Number(button.dataset.remove),1); markDirty(); renderTable(); renderMetrics();
    if (table === 'loads') notice('Assignment removed from the working copy. Its curriculum requirement remains, so an unstaffed class stays visible. Save inputs to keep this change.');
  }
});
$('input-table').addEventListener('change', (event) => {
  const control = event.target;
  if (!control.dataset.field) return;
  data[table][Number(control.dataset.index)][control.dataset.field] = control.type === 'checkbox' ? control.checked : control.value;
  markDirty(); renderMetrics();
});
for (const [id,key] of [['school-year','school_year'],['period','period'],['daily','max_per_day']]) {
  $(id).addEventListener('input', () => {
    data[key] = $(id).value;
    if (key !== 'max_per_day') { workspaceId = null; revision = null; }
    markDirty();
  });
}
$('confirmed').addEventListener('change', () => { data.confirmed = $('confirmed').checked; dirty = true; updateState(); });
$('spread-lessons').addEventListener('change', () => { data.spread_lessons = $('spread-lessons').checked; markDirty(); });
$('search').addEventListener('input',renderTable);
$('load-list-teacher').addEventListener('change', () => renderLoadList($('search').value.toLowerCase()));
for (const field of ['teacher','section','subject','n60','n45','create','section-count']) {
  $('load-' + field).addEventListener(['n60','n45','section-count'].includes(field) ? 'input' : 'change', () => {
    loadFormDirty = true;
    $('load-errors').hidden = true;
    if (field === 'section') {
      const available = eligibleSubjects($('load-section').value);
      const old = $('load-subject').value;
      loadOptions('load-subject',available,available.some((s) => s.id === old) ? old : '','Choose a subject…');
    }
    syncLoadForm(field === 'section' || field === 'subject');
    updateState();
  });
}
$('load-cancel').addEventListener('click', () => { resetLoadForm(); notice('Form cleared. Saved teaching loads are unchanged.'); });
$('load-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const values = Object.fromEntries(['teacher','section','subject','strand','n60','n45'].map((key) => [key,$('load-' + key).value]));
  values.allocation = values.section === '__AUTO__' ? 'auto' : 'fixed';
  if (values.allocation === 'auto') values.section = '';
  values.section_count = values.allocation === 'auto' && !editingLoadId ? $('load-section-count').value : 1;
  const payload = {data,load:values,editing_id:editingLoadId,add_requirement:$('load-create').checked,revision:knownRevisions.get(periodKey()) || null};
  operation('Validating and saving the teaching load…', async () => {
    try {
      const result = await request('/api/manual-load',payload);
      setData(result.data,result.id,result.revision);
      await refreshWorkspaces();
      notice(`Teaching load saved: ${result.load.subject} · ${result.loads?.length > 1 ? result.loads.length + ' sections for automatic allocation' : result.load.section || 'section will be assigned during generation'}. Run checks before generating.`);
    } catch (error) {
      showLoadErrors(error.fields || {assignment:error.message});
      throw error;
    }
  });
});
$('new-period').addEventListener('click', () => {
  if (!discardOkay()) return;
  operation('Starting an empty planning period…', async () => {
    const value = await request('/api/empty');
    value.school_year = data?.school_year || '';
    table = 'loads'; setData(value); showView('inputs');
    $('period').focus(); notice('Empty period started. Enter its name, then add teachers, sections and subjects manually. No Excel file is required.');
  });
});
$('add-row').addEventListener('click', () => {
  if (table === 'loads') {
    if (discardLoadForm()) { resetLoadForm(); $('load-teacher').focus(); }
    return;
  }
  const row = Object.fromEntries(specs[table].fields.map(([k,,type]) => [k,type === 'boolean' ? false : type === 'number' ? 0 : '']));
  if ('id' in row) row.id = `${table.slice(0,3).toUpperCase()}-${crypto.randomUUID().slice(0,6)}`;
  if (table === 'teachers') row.limit = 1500;
  if (table === 'subjects') { row.grade = 'Any'; row.kind = 'Core'; }
  if (table === 'sections') row.grade = 7;
  if (table === 'bells') { row.group = '7-8'; row.days = 'Mon-Thu'; row.kind = 'Class'; }
  data[table].push(row); $('search').value = ''; markDirty(); renderTable(); renderMetrics();
  const wrap = $('input-table').parentElement; wrap.scrollTop = wrap.scrollHeight;
});
$('save').addEventListener('click', () => operation('Saving inputs on this computer…',async () => { await saveInputs(); notice('Inputs saved locally. The published timetable has not changed.'); }));
$('demo').addEventListener('click', () => { if (!discardOkay()) return; operation('Loading the fictional example…',async () => {
  const example = await request('/api/demo');
  const periods = await request('/api/workspaces');
  const existing = periods.find(w => w.school_year === example.school_year && w.period === example.period);
  if (existing) { const w = await request('/api/workspace?id=' + existing.id); setData(w.data,w.id,w.revision); }
  else setData(example);
  showView('home'); notice('Fictional example loaded. It includes automatic section assignment and adviser duties. School data stays separate.');
}); });
$('open-period').addEventListener('click', () => {
  if (!$('saved-period').value || !discardOkay()) return;
  operation('Opening the saved period…',async () => { const w = await request('/api/workspace?id=' + $('saved-period').value); setData(w.data,w.id,w.revision); notice('Saved period opened.'); });
});
$('download-inputs').addEventListener('click',downloadWorking);
$('restore').addEventListener('change', async () => {
  const file = $('restore').files[0]; $('restore').value = '';
  if (!file || !discardOkay()) return;
  await operation('Reading the saved working copy…',async () => {
    if (file.size > 5*1024*1024) throw new Error('Choose a JSON file smaller than 5 MB.');
    const value = JSON.parse(await file.text());
    if (value?.day_plans !== undefined && (!Array.isArray(value.day_plans) || value.day_plans.length > 100 || value.day_plans.some(r => !r || typeof r !== 'object' || Array.isArray(r) || Object.values(r).some(v => v !== null && typeof v === 'object')))) throw new Error('The school-day settings in this working copy are invalid.');
    if (!value || value.schema_version !== 1 || Object.keys(specs).some((k) => !Array.isArray(value[k]) || value[k].some((r) => !r || typeof r !== 'object' || Array.isArray(r) || Object.values(r).some((v) => v !== null && typeof v === 'object'))) || typeof value.school_year !== 'string' || typeof value.period !== 'string' || typeof value.demo !== 'boolean') throw new Error('This is not a schema-version-1 scheduling working copy.');
    value.confirmed = false; setData(value); notice('Working copy restored for review. Save locally when ready.');
  });
});
$('workbook').addEventListener('change', async () => {
  const file = $('workbook').files[0]; $('workbook').value = '';
  if (!file) return;
  await operation('Reading the workbook into a review preview…',async () => {
    const panel = $('import-preview');
    preview = null;
    panel.hidden = true;
    panel.replaceChildren();
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5*1024*1024) throw new Error('Choose an .xlsx file smaller than 5 MB.');
    try {
      preview = await request('/api/import',file,true);
    } catch (error) {
      if (error.issues?.length) {
        panel.hidden = false;
        panel.innerHTML = '<h3>Workbook not imported</h3><p>Correct these rows in Excel and upload the file again. Your current inputs are unchanged.</p><ul>' +
          error.issues.map((issue) => '<li><strong>' + esc(workbookLocation(issue)) + '</strong> — ' + esc(issue.message) + '</li>').join('') + '</ul>';
      }
      throw error;
    }
    panel.hidden = false;
    panel.innerHTML = `<h3>Review import: ${esc(file.name)}</h3><p>${preview.data.teachers.length} teachers · ${preview.data.sections.length} sections · ${preview.data.loads.length} teaching-load records. ${preview.report.errors.length} issues need review before generation.</p><ul>${preview.data.source_notes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul><div class="actions"><button class="primary" id="apply-import">Use this working copy</button><button class="subtle" id="cancel-import">Cancel preview</button></div>`;
    notice('Import preview ready. Your current inputs and saved periods are unchanged.');
  });
});
document.addEventListener('click', (event) => {
  if (event.target.id === 'cancel-import') { preview = null; $('import-preview').hidden = true; }
  if (event.target.id === 'apply-import' && preview && discardOkay()) {
    const imported = preview; setData(imported.data); renderReport(imported.report);
    preview = null; $('import-preview').hidden = true;
    table = 'loads'; showView('inputs');
    notice('Import is now your unsaved working copy. Confirm the period, review the teacher loads and save.');
  }
  if (event.target.id === 'publish') operation('Rechecking the saved draft before local publication…', async () => {
    run = await request('/api/publish',{id:run.id,reviewer:$('reviewer').value});
    renderRun(); await refreshVersions(); notice('Schedule published locally. The teacher preview now reads this version.');
  });
});
$('generate').addEventListener('click', () => operation('Checking and generating a complete timetable…',async () => {
  const report = await request('/api/validate',{data}); renderReport(report);
  if (report.errors.length) { showView('checks'); notice('Resolve the input issues before generation.','error'); return; }
  await saveInputs();
  if (dirty) throw new Error('Inputs changed during saving. Run checks and generate again.');
  run = await request('/api/generate',{id:workspaceId,revision,seconds:Number($('seconds').value)});
  renderRun(); await refreshVersions(); showView('review');
  notice(run.result.verified ? 'Complete draft generated and independently checked. Review it before local publication.' : (run.result.message || 'The timetable could not be generated.'),run.result.verified ? '' : 'error');
}));
$('open-version').addEventListener('click', () => {
  if (!$('versions').value) return;
  operation('Opening the frozen schedule version…',async () => { run = await request('/api/run?id=' + $('versions').value); renderRun(); notice('Saved version opened. Its inputs are preserved with it.'); });
});
$('run-detail').addEventListener('change',(event) => { if (event.target.id === 'schedule-entity') weeklySchedule('draft-schedule',run,draftAudience,event.target.value); });
$('run-detail').addEventListener('click',(event) => {
  const button = event.target.closest('button'); if (!button || busy) return;
  if (button.dataset.audience) renderDraftSchedule(button.dataset.audience);
  if (button.id === 'print-draft') printSchedule(run,draftAudience,$('schedule-entity').value);
  if (button.dataset.downloadAudience) operation('Preparing printable schedules…',() => downloadSchedules(run,button.dataset.downloadAudience));
});
$('teacher-detail').addEventListener('change',(event) => { if (event.target.id === 'teacher-filter') weeklySchedule('published-schedule',published,'teacher',event.target.value); });
$('teacher-detail').addEventListener('click',(event) => { if (event.target.closest('#print-published') && !busy) printSchedule(published,'teacher',$('teacher-filter').value); });
$('refresh-teacher').addEventListener('click', () => operation('Reading the published local version…',async () => { await loadTeacher(); notice('Published view refreshed.'); }));
window.addEventListener('beforeunload', (event) => { if (dirty || loadFormDirty) { event.preventDefault(); event.returnValue = ''; } });
initWorkspace();
operation('Opening the local scheduling workspace…',async () => {
  const periods = await request('/api/workspaces');
  if (periods.length) { const w = await request('/api/workspace?id=' + periods[0].id); setData(w.data,w.id,w.revision); }
  else setData(await request('/api/demo'));
  await refreshWorkspaces(); notice(data.demo ? 'Demo workspace ready. Import the school workbook or open a saved school period to use actual data.' : 'School-data draft opened. Review the teaching loads and run readiness checks before generating.');
  showView('home'); notice('');
});
