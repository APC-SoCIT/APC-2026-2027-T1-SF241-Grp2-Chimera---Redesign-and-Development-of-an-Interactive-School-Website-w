"""Term-scoped scheduling inputs, preflight, CP-SAT and independent verification.

No database, browser or spreadsheet dependencies belong in this module.
All intervals are half-open [start, end) in integer minutes, in school local time.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from copy import deepcopy
from school_day import GROUPS, adviser_ids, prepare_school_days, school_cutoff_violations

DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
_UNSPECIFIED_ACTIVITIES = object()
TABLES = ['teachers', 'sections', 'subjects', 'requirements', 'loads', 'bells', 'unavailable']


def fingerprint(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False,
                                     allow_nan=False).encode()).hexdigest()


def integer(value, minimum=0, maximum=10000):
    if isinstance(value, bool) or value is None:
        raise ValueError('Enter a whole number.')
    text = str(value).strip()
    if not re.fullmatch(r'\d+(?:\.0+)?', text):
        raise ValueError('Enter a whole number; blanks, fractions and formulas are not allowed.')
    result = int(text.partition('.')[0])
    if not minimum <= result <= maximum:
        raise ValueError(f'Enter a whole number from {minimum} to {maximum}.')
    return result


def minute(value):
    match = re.fullmatch(r'(\d{1,2}):(\d{2})\s*([ap]m)?', str(value).strip(), re.I)
    if not match:
        raise ValueError('Enter a valid time, for example 07:30 or 1:15 PM.')
    hour, mins, suffix = int(match[1]), int(match[2]), match[3]
    if mins > 59 or (suffix and not 1 <= hour <= 12) or (not suffix and hour > 23):
        raise ValueError('Time is outside the clock range.')
    if suffix:
        hour = hour % 12 + (12 if suffix.lower() == 'pm' else 0)
    return hour * 60 + mins


def days(value):
    text = str(value).strip()
    if '-' in text:
        parts = text.split('-')
        if len(parts) != 2 or any(p.strip() not in DAYS for p in parts):
            raise ValueError('Use Mon-Fri, Mon-Thu, Fri, or comma-separated days such as Mon,Wed.')
        a, b = (DAYS.index(p.strip()) for p in parts)
        if a > b:
            raise ValueError('The first day must come before the last day.')
        return DAYS[a:b + 1]
    result = [p.strip() for p in text.split(',')]
    if not result or any(p not in DAYS for p in result) or len(result) != len(set(result)):
        raise ValueError('Use Mon through Sat; separate multiple days with commas.')
    return result


def split_strands(value):
    return [s.strip() for s in str(value or '').split(',') if s.strip()]


def group(grade):
    return '7-8' if grade <= 8 else '9-10' if grade <= 10 else str(grade)


def overlap(a, b):
    return a['day'] == b['day'] and a['start'] < b['end'] and b['start'] < a['end']


def cohort_ids(row, sections, subjects):
    specific = row.get('strand') or subjects[row['subject']].get('strand')
    return [specific] if specific else (split_strands(sections[row['section']].get('strands')) or ['ALL'])


def class_key(row, subjects):
    return row['section'], row['subject'], row.get('strand') or subjects[row['subject']].get('strand') or ''


def meeting_teachers(row, model):
    teachers = {row['teacher']}
    if model.get('day_plans') and model['subject_map'][row['subject']]['kind'] == 'Homeroom':
        teachers.update(adviser_ids(model['section_map'][row['section']]))
    return teachers


def schedule_activities(model, entries):
    activities = deepcopy(model['activities'])
    for entry in entries:
        other = meeting_teachers(entry, model) - {entry['teacher']}
        if other:
            activities.append(dict(section=entry['section'], advisers=','.join(sorted(other)),
                                   day=entry['day'], kind='Homeroom supervision',
                                   start=entry['start'], end=entry['end'], teacher_only=True))
    return activities


def shape_error(data):
    """Structural validation shared by save, restore and solve boundaries."""
    if not isinstance(data, dict) or data.get('schema_version') != 1:
        return 'Provide a schema-version-1 scheduling object.'
    if any(not isinstance(data.get(k), str) for k in ['school_year', 'period']):
        return 'School year and period must be text.'
    if any(not isinstance(data.get(k), bool) for k in ['demo', 'confirmed']):
        return 'Demo and confirmation flags must be true or false.'
    for table in TABLES:
        records = data.get(table)
        if not isinstance(records, list) or len(records) > 2000:
            return f'{table}: provide a list of at most 2,000 records.'
        if any(not isinstance(row, dict) or any(isinstance(v, (dict, list)) for v in row.values()) for row in records):
            return f'{table}: each record must contain simple text, numeric or checkbox fields.'
    for flag in ['trial', 'elementary_after_secondary', 'spread_lessons']:
        if flag in data and type(data[flag]) is not bool:
            return f'{flag}: provide a true/false value.'
    plans = data.get('day_plans', [])
    if not isinstance(plans, list) or len(plans) > 100 or any(not isinstance(r, dict) or any(isinstance(v, (list, dict)) for v in r.values()) for r in plans):
        return 'day_plans: provide at most 100 records with simple fields.'
    return None


def validate(data):
    """Return errors with source locations and a normalized model. Never repair inputs."""
    report = {'errors': [], 'warnings': [], 'capacity': [], 'counts': {}}

    def issue(code, message, table='', row=None, field='', warning=False):
        report['warnings' if warning else 'errors'].append({
            'code': code, 'message': message, 'table': table,
            'row': row.get('_row') if isinstance(row, dict) else row,
            'record': row.get('id', '') if isinstance(row, dict) else '',
            'sheet': row.get('_sheet', table) if isinstance(row, dict) else table,
            'field': field,
        })

    structural_error = shape_error(data)
    if structural_error:
        issue('FORMAT', structural_error)
        return report, None
    for violation in school_cutoff_violations(data, minute):
        issue('SCHOOL_CUTOFF', violation['message'], violation['table'], violation['row'], violation['field'])
    if data.get('schema_version') != 1:
        issue('SCHEMA', 'Use scheduling schema version 1.')
    for name in ['school_year', 'period']:
        if not isinstance(data.get(name), str) or not data[name].strip():
            issue('PERIOD', f'Enter {name.replace("_", " ")} before validating.')
    for name in ['demo', 'confirmed']:
        if not isinstance(data.get(name), bool):
            issue('FORMAT', f'{name} must be true or false.')
    try:
        daily = integer(data.get('max_per_day'), 1, 6)
    except ValueError as exc:
        daily = 1
        issue('DAILY_LIMIT', str(exc), field='max_per_day')
    model = {'daily': daily}
    secondary_first = data.get('trial') is True and data.get('elementary_after_secondary') is True
    if data.get('elementary_after_secondary') and not data.get('trial'):
        issue('POLICY', 'Elementary-after-secondary is a provisional trial policy, not a confirmed school rule.')
    for table in TABLES:
        rows = data.get(table)
        if not isinstance(rows, list) or len(rows) > 2000 or any(not isinstance(r, dict) for r in rows):
            issue('FORMAT', f'{table}: provide a list of at most 2,000 records.')
            model[table] = []
            continue
        model[table] = deepcopy(rows)
        for index, row in enumerate(model[table], 1):
            row.setdefault('_row', index)
            for key, value in row.items():
                if isinstance(value, str):
                    row[key] = value.strip()
        report['counts'][table] = len(rows)
        if table not in ['unavailable'] and not rows:
            issue('EMPTY', f'Add {table} records before generation.', table)
    for table in ['teachers', 'sections', 'subjects', 'requirements', 'loads']:
        seen = set()
        for row in model[table]:
            key = row.get('id')
            if not isinstance(key, str) or not key or key.startswith('='):
                issue('ID', 'Enter a nonempty text ID or name.', table, row, 'id')
            elif key.casefold() in seen:
                issue('DUPLICATE', f'Duplicate ID/name: {key}. Keep one authoritative record.', table, row, 'id')
            else:
                seen.add(key.casefold())
    teachers = {r.get('id'): r for r in model['teachers'] if isinstance(r.get('id'), str)}
    sections = {r.get('id'): r for r in model['sections'] if isinstance(r.get('id'), str)}
    subjects = {r.get('id'): r for r in model['subjects'] if isinstance(r.get('id'), str)}

    def number(row, field, lo, hi, table):
        try:
            row[field] = integer(row.get(field), lo, hi)
        except ValueError as exc:
            issue('NUMBER', str(exc), table, row, field)
            row[field] = 0  # internal only; errors prevent this model from being solved

    teacher_names = set()
    for row in model['teachers']:
        if not isinstance(row.get('name'), str) or not row['name'] or row['name'].startswith('='):
            issue('NAME', 'Enter a teacher name.', 'teachers', row, 'name')
        elif row['name'].casefold() in teacher_names:
            issue('AMBIGUOUS_NAME', 'Teacher names must be distinct for this name-based Excel template.', 'teachers', row, 'name')
        else:
            teacher_names.add(row['name'].casefold())
        for field in ['limit', 'extra_minutes', 'approved_overload']:
            number(row, field, 0, 6000, 'teachers')
        if row.get('approved_overload') and not str(row.get('overload_reason', '')).strip():
            issue('APPROVAL_REASON', 'Record the reason and approver for this workload allowance.', 'teachers', row, 'overload_reason')
        for flag in ['elementary', 'availability_confirmed']:
            if not isinstance(row.get(flag), bool):
                issue('BOOLEAN', f'{flag} must be Yes or No.', 'teachers', row, flag)
        if row.get('elementary') and (not row['extra_minutes'] or not secondary_first and not row.get('availability_confirmed')):
            issue('EXTERNAL_COMMITMENTS', 'Confirm all elementary commitments, enter their weekly minutes, and block their actual times.', 'teachers', row)
    for row in model['sections']:
        number(row, 'grade', 7, 12, 'sections')
        strands = split_strands(row.get('strands'))
        if len(strands) != len(set(strands)):
            issue('STRAND', 'A section cannot list the same strand twice.', 'sections', row, 'strands')
        row['group'] = group(row['grade'])
    for row in model['subjects']:
        if row.get('grade') != 'Any':
            number(row, 'grade', 7, 12, 'subjects')
        if row.get('kind') not in ['Core', 'Strand', 'Homeroom']:
            issue('SUBJECT_TYPE', 'Choose Core, Strand or Homeroom.', 'subjects', row, 'kind')
        if row.get('kind') == 'Strand' and not row.get('strand'):
            issue('STRAND', 'A strand subject needs an explicit strand.', 'subjects', row, 'strand')
        if row.get('kind') != 'Strand' and row.get('strand'):
            issue('STRAND', 'Only Strand subjects can specify a strand.', 'subjects', row, 'strand')
    for table in ['loads', 'requirements']:
        seen = set()
        for row in model[table]:
            automatic = table == 'loads' and row.get('allocation') == 'auto' and not row.get('section')
            for field, records in [('section', sections), ('subject', subjects)]:
                if automatic and field == 'section':
                    continue
                if not isinstance(row.get(field), str) or row[field] not in records:
                    issue('REFERENCE', f'Select a known {field}; missing assignments are never guessed.', table, row, field)
            if table == 'loads' and (not isinstance(row.get('teacher'), str) or row['teacher'] not in teachers):
                issue('TEACHER', 'Assign a teacher from the Teachers list.', table, row, 'teacher')
            missing_frequency = row.get('n60') in ['', None] and row.get('n45') in ['', None]
            if missing_frequency:
                issue('MISSING_FREQUENCY', f'{row.get("subject", "Class")} / {row.get("section", "section")}: enter the required weekly 60- and 45-minute meeting counts.', table, row)
                row['n60'] = row['n45'] = 0
            else:
                for field in ['n60', 'n45']:
                    number(row, field, 0, 30, table)
            if not missing_frequency and row['n60'] + row['n45'] == 0:
                issue('NO_DEMAND', 'Enter at least one required meeting.', table, row)
            if automatic and row.get('subject') in subjects:
                sub = subjects[row['subject']]
                if sub['kind'] != 'Strand' and row.get('strand'):
                    issue('CORE_SPLIT', 'Core/homeroom lessons occupy the whole section.', table, row, 'strand')
                if sub.get('strand') and row.get('strand') not in ['', None, sub['strand']]:
                    issue('STRAND', 'The load strand must match the subject strand.', table, row, 'strand')
                allowed = split_strands(row.get('candidate_sections'))
                eligible = [s['id'] for s in model['sections'] if sub['grade'] in ['Any', s['grade']]
                            and (not sub.get('strand') or sub['strand'] in split_strands(s.get('strands')))]
                if allowed and (len(allowed) != len(set(allowed)) or any(s not in eligible for s in allowed)):
                    issue('ALLOCATION', 'Candidate sections must be distinct and match the subject grade/strand.', table, row, 'candidate_sections')
                row['_sections'] = allowed or eligible
                if data.get('day_plans') and sub['kind'] == 'Homeroom':
                    row['_sections'] = [s for s in row['_sections'] if row['teacher'] in adviser_ids(sections[s])]
                if not row['_sections']:
                    issue('ALLOCATION', 'No eligible sections for this subject and teacher. Add matching sections or select the correct subject/adviser.', table, row, 'section')
                continue
            if row.get('section') not in sections or row.get('subject') not in subjects:
                continue
            if table == 'loads':
                row['_sections'] = [row['section']]
            sec, sub = sections[row['section']], subjects[row['subject']]
            if sub['grade'] != 'Any' and sec['grade'] != sub['grade']:
                issue('GRADE', f'{sub["id"]} does not match the section grade.', table, row)
            strand = row.get('strand') or sub.get('strand') or ''
            if sub.get('kind') != 'Strand' and row.get('strand'):
                issue('CORE_SPLIT', 'Core/homeroom lessons occupy the whole combined section.', table, row, 'strand')
            if sub.get('strand') and strand != sub['strand']:
                issue('STRAND', 'The load strand must match the subject strand.', table, row, 'strand')
            if strand and strand not in split_strands(sec.get('strands')):
                issue('STRAND', f'{strand} is not in this section.', table, row, 'strand')
            key = class_key(row, subjects)
            if key in seen:
                issue('DUPLICATE_CLASS', 'This subject/section/strand already has a record. Co-teaching is not supported.', table, row)
            seen.add(key)
    if not report['errors']:
        demands = {class_key(r, subjects): r for r in model['requirements']}
        assigned = {class_key(r, subjects): r for r in model['loads'] if r.get('section')}
        automatic = [r for r in model['loads'] if not r.get('section') and r.get('allocation') == 'auto']
        for load in automatic:
            load['_sections'] = [s for s in load['_sections']
                                 if (s, load['subject'], load.get('strand') or subjects[load['subject']].get('strand') or '') in demands
                                 and (s, load['subject'], load.get('strand') or subjects[load['subject']].get('strand') or '') not in assigned
                                 and (demands[s, load['subject'], load.get('strand') or subjects[load['subject']].get('strand') or '']['n60'],
                                      demands[s, load['subject'], load.get('strand') or subjects[load['subject']].get('strand') or '']['n45']) == (load['n60'], load['n45'])]
            if not load['_sections']:
                issue('UNAPPROVED_CLASS', 'No unassigned curriculum class matches this automatic load and its weekly meetings. Review curriculum and assignments.', 'loads', load)
        for key, req in demands.items():
            load = assigned.get(key)
            if not load and not any(req['section'] in r['_sections'] and req['subject'] == r['subject']
                                    and (req.get('strand') or subjects[req['subject']].get('strand') or '') == (r.get('strand') or subjects[r['subject']].get('strand') or '') for r in automatic):
                issue('UNSTAFFED', f'{req["section"]} / {req["subject"]} has required meetings but no teacher. Assign a teacher or resolve the staffing shortage.', 'requirements', req)
            elif load and (req['n60'], req['n45']) != (load['n60'], load['n45']):
                issue('DEMAND_MISMATCH', 'Assigned meetings must match the curriculum requirement, including 45/60-minute counts.', 'loads', load)
        for key, load in assigned.items():
            if key not in demands:
                issue('UNAPPROVED_CLASS', 'Add a curriculum requirement for this class before scheduling.', 'loads', load)
        # Strand/subtrack offerings must be explicit in curriculum requirements.
        for sub in model['subjects']:
            if sub['kind'] in ['Core', 'Homeroom']:
                for sec in model['sections']:
                    if sub['grade'] in ['Any', sec['grade']] and (sec['id'], sub['id'], '') not in demands:
                        issue('CURRICULUM_GAP', f'Add the {sub["id"]} requirement for {sec["id"]}, or correct the active subject catalogue.', 'requirements')
    slots, blocks = [], []
    for table in ['bells', 'unavailable']:
        for row in model[table]:
            if table == 'unavailable' and row.get('deferred') is True:
                if secondary_first and teachers.get(row.get('teacher'), {}).get('elementary') and not any(row.get(k) for k in ['days','start','end']):
                    continue  # Explicit trial assumption: future elementary timetable follows this one.
                issue('TIME', 'Only undated elementary commitments may be deferred in a labeled secondary-first trial.', table, row)
                continue
            if table == 'bells' and not row.get('start') and not row.get('end'):
                continue  # unused template periods; a used grade group still needs class times
            try:
                active_days = days(row.get('days'))
                start, end = minute(row.get('start')), minute(row.get('end'))
                if start >= end:
                    raise ValueError('The end must be later than the start; overnight classes are unsupported.')
                if table == 'bells':
                    if row.get('group') not in [*GROUPS, '11-12']:
                        raise ValueError('Choose grade group 7-8, 9-10, 11 or 12.')
                    if row.get('kind') not in ['Class', 'Recess', 'Lunch']:
                        raise ValueError('Choose Class, Recess or Lunch.')
                    if row['kind'] == 'Class' and end - start not in [45, 60]:
                        raise ValueError('This template supports 45- and 60-minute class periods.')
                elif row.get('teacher') not in teachers:
                    raise ValueError('Choose a teacher from the Teachers list.')
                for day in active_days:
                    groups = ['11', '12'] if table == 'bells' and row.get('group') == '11-12' else [row.get('group')]
                    for g in groups:
                        item = {**row, 'day': day, 'start': start, 'end': end}
                        if table == 'bells':
                            item['group'] = g
                        (slots if table == 'bells' else blocks).append(item)
            except ValueError as exc:
                issue('TIME', str(exc), table, row)
    bell_groups = defaultdict(list)
    for slot in slots:
        bell_groups[slot['group'], slot['day']].append(slot)
    for (g, day), values in bell_groups.items():
        ordered = sorted(values, key=lambda x: x['start'])
        for a, b in zip(ordered, ordered[1:]):
            if overlap(a, b):
                issue('BELL_OVERLAP', f'{g} {day}: {a.get("label")} overlaps {b.get("label")} (including breaks).', 'bells', b)
    slots = [s for s in slots if s['kind'] == 'Class']
    for g in {s['group'] for s in model['sections']}:
        if not any(s['group'] == g for s in slots):
            issue('MISSING_BELLS', f'Enter actual class times for grade group {g}. Blank times are never replaced with sample bells.', 'bells')
    for teacher in model['teachers']:
        if teacher['elementary'] and not secondary_first and not any(b['teacher'] == teacher['id'] for b in blocks):
            issue('EXTERNAL_TIMES', f'{teacher["name"]}: enter all fixed elementary class times.', 'unavailable')
    model.update(teacher_map=teachers, section_map=sections, subject_map=subjects, slots=slots, blocks=blocks)
    prepare_school_days(data, model, issue, days, minute, overlap)
    if report['errors']:
        return report, None
    choices = {}
    teacher_minutes = Counter()
    for load in model['loads']:
        teacher_minutes[load['teacher']] += load['n60'] * 60 + load['n45'] * 45
        for duration in [60, 45]:
            count = load['n60' if duration == 60 else 'n45']
            capacity = []
            for sec in load['_sections']:
                occupied = meeting_teachers({**load, 'section': sec}, model)
                options = [i for i, s in enumerate(slots)
                           if s['group'] == sections[sec]['group'] and s['end'] - s['start'] == duration
                           and not any(b['teacher'] in occupied and overlap(s, b) for b in blocks)]
                choices[load['id'], sec, duration] = options
                day_capacity = sum(min(daily, sum(slots[i]['day'] == day for i in options)) for day in DAYS)
                capacity.append(min(len(options), day_capacity))
            if count > max(capacity, default=0):
                issue('CLASS_CAPACITY', f'{load["subject"]} / {load["section"] or "automatic section"} needs {count} × {duration}-minute meetings; at most {max(capacity, default=0)} fit with availability and daily limits.', 'loads', load)
    for teacher in model['teachers']:
        required = teacher_minutes[teacher['id']] + teacher['extra_minutes']
        allowed = teacher['limit'] + teacher['approved_overload']
        report['capacity'].append({'teacher': teacher['name'], 'required': required, 'allowed': allowed, 'remaining': allowed - required})
        if required > allowed:
            issue('WORKLOAD', f'{teacher["name"]} needs {required} minutes/week; allowed {allowed}. '
                  f'This is {required - allowed} minutes over. Reassign work or record an approved '
                  'allowance before publication.', 'teachers', teacher, warning=True)
    section_need = Counter()
    for load in model['requirements']:
        for cohort in cohort_ids(load, sections, subjects):
            for duration, count in [(60, load['n60']), (45, load['n45'])]:
                section_need[load['section'], cohort, duration] += count
    for (sec, cohort, duration), count in section_need.items():
        available = sum(s['group'] == sections[sec]['group'] and s['end'] - s['start'] == duration for s in slots)
        if count > available:
            issue('SECTION_CAPACITY', f'{sec} ({cohort}) needs {count} × {duration}-minute periods; only {available} exist.', 'sections', sections[sec])
    if not data.get('confirmed'):
        issue('UNCONFIRMED', 'Draft testing only: curriculum, bell times and availability need coordinator confirmation before local publication.', warning=True)
    if data.get('trial'):
        issue('TRIAL', 'TRIAL ONLY: provisional times, curriculum choices and workload allowances are not school approval. This scenario cannot be published.', warning=True)
    if secondary_first:
        issue('ELEMENTARY_DEFERRED', 'Trial assumption: elementary is scheduled after JHS/SHS and must respect occupied times. Elementary timetable feasibility has not been established; its weekly teaching minutes still count toward workload.', warning=True)
    issue('SCOPE', 'Checks cover supplied curriculum, teacher/section/strand overlap, bell times, availability and workload. Rooms, travel time, qualifications and student elective overlaps are not modeled yet.', warning=True)
    model['choices'] = choices
    return report, None if report['errors'] else model


def solve(data, time_limit=10):
    from ortools.sat.python import cp_model
    report, model = validate(data)
    result = {'status': 'INVALID_INPUT', 'entries': [], 'report': report,
              'input_hash': fingerprint(data), 'explanation': []}
    if model is None:
        return result
    cp = cp_model.CpModel()
    selected = []
    assumptions = {}
    teacher_day, section_day = defaultdict(list), defaultdict(list)
    coverage = defaultdict(list)
    equivalent_allocations = defaultdict(list)
    repeat_terms = []
    for load in model['loads']:
        active = cp.new_bool_var('require_' + load['id'])
        cp.add_assumption(active)
        assumptions[active.index] = load
        allocations = []
        for sec in load['_sections']:
            assignment = cp.new_bool_var(f'assign_{load["id"]}_{sec}')
            allocations.append(assignment)
            assigned_load = {**load, 'section': sec}
            coverage[class_key(assigned_load, model['subject_map'])].append(assignment)
            per_day = defaultdict(list)
            for duration, count in [(60, load['n60']), (45, load['n45'])]:
                variables = []
                for index in model['choices'][load['id'], sec, duration] if count else []:
                    slot = model['slots'][index]
                    var = cp.new_bool_var(f'{load["id"]}_{sec}_{index}')
                    selected.append((assigned_load, slot, var))
                    variables.append(var)
                    per_day[slot['day']].append(var)
                    for teacher in meeting_teachers(assigned_load, model):
                        teacher_day[teacher, slot['day']].append((slot, var))
                    for cohort in cohort_ids(assigned_load, model['section_map'], model['subject_map']):
                        section_day[sec, cohort, slot['day']].append((slot, var))
                cp.add(sum(variables) == count * assignment)
            for variables in per_day.values():
                cp.add(sum(variables) <= model['daily'])
                if data.get('spread_lessons') and model['daily'] > 1:
                    extra = cp.new_int_var(0,model['daily']-1,'extra_same_day')
                    cp.add(extra >= sum(variables)-1)
                    repeat_terms.append(extra)
        cp.add(sum(allocations) == active)
        if not load.get('section'):
            key = (load['teacher'],load['subject'],load.get('strand',''),load['n60'],load['n45'],tuple(load['_sections']))
            equivalent_allocations[key].append((active,sum((i+1)*v for i,v in enumerate(allocations))))
    for values in equivalent_allocations.values():
        for (a,x),(b,y) in zip(values,values[1:]):
            cp.add(x < y).only_enforce_if([a,b])
    if any(not load.get('section') for load in model['loads']):
        for req in model['requirements']:
            cp.add(sum(coverage[class_key(req, model['subject_map'])]) == 1)
    # Using actual interval overlap catches staggered bell times across grade groups.
    for values in list(teacher_day.values()) + list(section_day.values()):
        for start in {s['start'] for s, _ in values}:
            covering = [v for s, v in values if s['start'] <= start < s['end']]
            if len(covering) > 1:
                cp.add_at_most_one(covering)
    solver = cp_model.CpSolver()
    if data.get('spread_lessons'):
        cp.minimize(sum(repeat_terms))
    solver.parameters.max_time_in_seconds = max(0, min(float(time_limit), 300))
    search_model = cp
    large = len(model['loads']) >= 100
    if large:
        # Same hard requirements, without assumption machinery impeding portfolio search.
        search_model = cp.clone()
        search_model.clear_assumptions()
        for index in assumptions:
            search_model.add(search_model.get_bool_var_from_proto_index(index) == 1)
    solver.parameters.num_search_workers = 4 if large else 1
    solver.parameters.random_seed = 0
    status = solver.solve(search_model)
    result.update(status=solver.status_name(status), seconds=round(solver.wall_time, 3), search_workers=4 if large else 1)
    if status in [cp_model.FEASIBLE, cp_model.OPTIMAL]:
        result['entries'] = [{'load': ld['id'], 'teacher': ld['teacher'], 'subject': ld['subject'],
                              'section': ld['section'], 'strand': ld.get('strand') or model['subject_map'][ld['subject']].get('strand') or '',
                              'day': s['day'], 'start': s['start'], 'end': s['end']}
                             for ld, s, var in selected if solver.value(var)]
        result['entries'].sort(key=lambda e: (DAYS.index(e['day']), e['start'], e['section'], e['subject']))
        problems = verify(data, result['entries'])
        if problems:
            result.update(status='VERIFICATION_FAILED', entries=[], explanation=problems)
        else:
            result['verified'] = True
            result['activities'] = schedule_activities(model, result['entries'])
            if data.get('spread_lessons'):
                daily_counts = Counter((e['load'],e['day']) for e in result['entries'])
                result['quality'] = dict(objective='Reduce extra meetings of the same class on one day',
                    extra_same_day_meetings=sum(max(0,n-1) for n in daily_counts.values()),
                    best_bound=round(solver.best_objective_bound,3),optimal=status==cp_model.OPTIMAL)
    elif status == cp_model.INFEASIBLE:
        core = [] if large else solver.sufficient_assumptions_for_infeasibility()
        result['explanation'] = [
            f'{assumptions[i]["section"]} / {assumptions[i]["subject"]} / {model["teacher_map"][assumptions[i]["teacher"]]["name"]}'
            for i in core if i in assumptions]
        result['message'] = ('No complete schedule satisfies the current rules. ' +
                             ('The listed classes form a sufficient conflict set, not necessarily the smallest one. ' if core else 'No smaller conflict set was extracted for this run. ') +
                             'Review teacher availability, section counts, periods and daily limits; then revise inputs and regenerate.')
    elif status == cp_model.UNKNOWN:
        result['message'] = 'The time limit ended without a schedule or proof of impossibility. No classes have been dropped. Retry with more time or review the inputs.'
    else:
        result['message'] = 'The solver model could not be processed. No schedule was produced.'
    return result


def verify(data, entries, activities=_UNSPECIFIED_ACTIVITIES, *, require_workload_approval=False):
    """Independent plain-Python check, also run again when publishing saved drafts."""
    report, model = validate(data)
    if model is None:
        return ['Inputs no longer validate.']
    errors = []
    if require_workload_approval:
        errors.extend(warning['message'] for warning in report['warnings'] if warning['code'] == 'WORKLOAD')
    loads = {r['id']: r for r in model['loads']}
    counts, daily = Counter(), Counter()
    checked = []
    allocations = defaultdict(set)
    coverage = defaultdict(set)
    for entry in entries:
        if not isinstance(entry, dict) or entry.get('load') not in loads:
            errors.append('Unknown meeting/load.')
            continue
        load = loads[entry['load']]
        expected = {k: load[k] for k in ['teacher', 'subject']}
        expected['strand'] = load.get('strand') or model['subject_map'][load['subject']].get('strand') or ''
        if any(entry.get(k) != v for k, v in expected.items()):
            errors.append(f'{load["id"]}: meeting identity changed.')
            continue
        sec = entry.get('section')
        if sec not in load['_sections']:
            errors.append(f'{load["id"]}: section is outside eligible curriculum classes.')
            continue
        allocations[load['id']].add(sec)
        coverage[class_key({**load, 'section': sec}, model['subject_map'])].add(load['id'])
        if any(type(entry.get(k)) is not int for k in ['start', 'end']) or entry.get('day') not in DAYS:
            errors.append(f'{load["id"]}: invalid meeting time.')
            continue
        duration = entry['end'] - entry['start']
        permitted = model['choices'].get((load['id'], sec, duration), [])
        if not any(all(entry[k] == model['slots'][i][k] for k in ['day', 'start', 'end']) for i in permitted):
            errors.append(f'{load["id"]}: meeting outside an available class period.')
        counts[load['id'], duration] += 1
        daily[load['id'], entry['day']] += 1
        checked.append(entry)
    for load in model['loads']:
        if len(allocations[load['id']]) != 1:
            errors.append(f'{load["id"]}: all weekly meetings must belong to one section.')
        for duration, target in [(60, load['n60']), (45, load['n45'])]:
            if counts[load['id'], duration] != target:
                errors.append(f'{load["id"]}: wrong number of {duration}-minute meetings.')
        if any(daily[load['id'], d] > model['daily'] for d in DAYS):
            errors.append(f'{load["id"]}: daily meeting limit exceeded.')
    for req in model['requirements']:
        if len(coverage[class_key(req, model['subject_map'])]) != 1:
            errors.append(f'{req["section"]} / {req["subject"]}: requires exactly one assigned teacher load.')
    for index, a in enumerate(checked):
        for b in checked[index + 1:]:
            if not overlap(a, b):
                continue
            if meeting_teachers(a, model) & meeting_teachers(b, model):
                errors.append(f'Teacher double booking: {a["teacher"]}.')
            if a['section'] == b['section']:
                ca = set(cohort_ids(a, model['section_map'], model['subject_map']))
                cb = set(cohort_ids(b, model['section_map'], model['subject_map']))
                if ca & cb:
                    errors.append(f'Section/strand double booking: {a["section"]}.')
    if activities is not _UNSPECIFIED_ACTIVITIES and activities != schedule_activities(model, checked):
        errors.append('School-day activities or adviser duties changed.')
    return errors
