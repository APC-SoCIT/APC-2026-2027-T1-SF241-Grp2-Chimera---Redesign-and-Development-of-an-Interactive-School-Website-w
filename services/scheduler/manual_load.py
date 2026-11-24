"""Coordinator entry commands using the scheduler's canonical input validation."""
from copy import deepcopy
import uuid

from domain import class_key, integer, shape_error, validate


class LoadInputError(ValueError):
    def __init__(self, fields):
        self.fields = fields
        super().__init__('Review the teaching-load fields before saving.')


def empty_data():
    return dict(schema_version=1, school_year='', period='', demo=False, confirmed=False,
                max_per_day=1, teachers=[], sections=[], subjects=[], requirements=[],
                loads=[], bells=[], unavailable=[], source_notes=[])


def prepare_load(data, values, editing_id=None, add_requirement=False):
    """Return a candidate dataset; neither invalid submissions nor cancellation mutate it.

    Other incomplete school inputs may remain drafts. This command checks the new
    assignment and its selected master records without requiring finished bells.
    Curriculum changes are explicit; editing a load never silently changes demand.
    """
    error = shape_error(data)
    if error:
        raise ValueError(error)
    if not isinstance(values, dict) or type(add_requirement) is not bool:
        raise ValueError('Provide teaching-load fields and an explicit curriculum option.')
    candidate = deepcopy(data)
    for table in ['teachers', 'sections', 'subjects', 'requirements', 'loads']:
        for record in candidate[table]:
            for field, value in record.items():
                if isinstance(value, str):
                    record[field] = value.strip()
    fields = {}
    automatic = values.get('allocation') == 'auto' and not values.get('section')
    if not isinstance(values.get('candidate_sections', ''), str):
        fields['section'] = 'Choose eligible sections using text IDs.'
    for field in ['teacher', 'section', 'subject', 'strand']:
        value = values.get(field, '')
        if not isinstance(value, str):
            fields[field] = 'Choose a value from the list.'
        else:
            fields_value = value.strip()
            if field != 'strand' and not fields_value and not (field == 'section' and automatic):
                fields[field] = f'Choose a {field}.'
    if editing_id is not None and (not isinstance(editing_id, str) or
                                  sum(r.get('id') == editing_id for r in data['loads']) != 1):
        raise ValueError('The teaching load to edit was not found. Reopen the saved period.')
    row = {key: values.get(key, '').strip() if isinstance(values.get(key, ''), str) else ''
           for key in ['teacher', 'section', 'subject', 'strand']}
    row['id'] = editing_id or 'LOAD-' + uuid.uuid4().hex[:12]
    row['allocation'] = 'auto' if automatic else 'fixed'
    previous = next((r for r in candidate['loads'] if r.get('id') == editing_id), {}) if editing_id else {}
    row['candidate_sections'] = values.get('candidate_sections', previous.get('candidate_sections', ''))
    for key in ['n60', 'n45']:
        try:
            row[key] = integer(values.get(key), 0, 30)
        except ValueError as exc:
            fields[key] = str(exc)
    if fields:
        raise LoadInputError(fields)
    if row['n60'] + row['n45'] == 0:
        raise LoadInputError({'n60': 'Enter at least one weekly meeting.', 'n45': 'Both meeting counts cannot be zero.'})

    selected = {'teachers': row['teacher'], 'sections': row['section'], 'subjects': row['subject']}
    if editing_id:
        index = next(i for i, old in enumerate(candidate['loads']) if old.get('id') == editing_id)
        row = {**candidate['loads'][index], **row}
        candidate['loads'][index] = row
    else:
        candidate['loads'].append(row)
    # This is the SAME row/grade/strand/reference validator used for imported records.
    report, _ = validate(candidate)
    for issue in report['errors']:
        if (issue['table'] == 'loads' and issue['record'] == row['id']
                and issue['code'] not in ['UNAPPROVED_CLASS', 'DEMAND_MISMATCH']):
            message = ('This section and subject already have a teaching load. Use Edit on the existing assignment.'
                       if issue['code'] == 'DUPLICATE_CLASS' else issue['message'])
            fields.setdefault(issue['field'] or 'assignment', message)
        elif (issue['table'] in selected and issue['record'] == selected[issue['table']]
              and issue['code'] not in ['EXTERNAL_COMMITMENTS', 'EXTERNAL_TIMES']):
            key = {'teachers': 'teacher', 'sections': 'section', 'subjects': 'subject'}[issue['table']]
            fields.setdefault(key, issue['message'])
    if fields:
        raise LoadInputError(fields)

    subjects = {r['id'].strip(): r for r in candidate['subjects'] if isinstance(r.get('id'), str)}
    teachers = {r['id'].strip(): r for r in candidate['teachers'] if isinstance(r.get('id'), str)}
    # Reference errors above prevent an unknown subject/teacher reaching this point.
    if row['subject'] not in subjects or row['teacher'] not in teachers:
        raise LoadInputError({'assignment': 'Choose valid teacher and subject records.'})
    subject = subjects[row['subject']]
    row['strand'] = row.get('strand') or subject.get('strand') or ''
    key = class_key(row, subjects)
    for old in candidate['loads'] if not automatic else []:
        if old['id'] == row['id'] or old.get('subject') not in subjects:
            continue
        if class_key(old, subjects) == key:
            raise LoadInputError({'assignment': 'This section and subject already have a teaching load. Edit that assignment instead.'})
    matching = [r for r in candidate['requirements'] if r.get('subject') in subjects and class_key(r, subjects) == key] if not automatic else []
    if len(matching) > 1:
        raise LoadInputError({'curriculum': 'Resolve duplicate curriculum requirements for this class first.'})
    if matching:
        try:
            expected = tuple(integer(matching[0].get(k), 0, 30) for k in ['n60', 'n45'])
        except ValueError:
            raise LoadInputError({'curriculum': 'Complete the official weekly meeting counts in Curriculum first.'}) from None
        if expected != (row['n60'], row['n45']):
            raise LoadInputError({'curriculum': f'This class requires {expected[0]} × 60-minute and {expected[1]} × 45-minute meetings. Update Curriculum explicitly if the requirement has changed.'})
    elif automatic:
        if add_requirement:
            raise LoadInputError({'curriculum': 'Define curriculum for each section separately before generating automatic assignments.'})
    elif not add_requirement:
        raise LoadInputError({'curriculum': 'No curriculum requirement exists for this class. Add it in Curriculum, or select the option to create it with these counts.'})
    else:
        candidate['requirements'].append(dict(id='REQ-' + uuid.uuid4().hex[:12],
                                             **{k: row[k] for k in ['section', 'subject', 'strand', 'n60', 'n45']}))
    teacher = teachers[row['teacher']]
    try:
        used = integer(teacher.get('extra_minutes'), 0, 6000)
        for load in candidate['loads']:
            if load.get('teacher', '').strip() == row['teacher']:
                used += integer(load.get('n60'), 0, 30) * 60 + integer(load.get('n45'), 0, 30) * 45
        allowed = integer(teacher.get('limit'), 0, 6000) + integer(teacher.get('approved_overload'), 0, 6000)
    except (ValueError, AttributeError):
        raise LoadInputError({'teacher': 'Correct this teacher\'s existing load counts and workload limits first.'}) from None
    if used > allowed:
        raise LoadInputError({'teacher': f'This assignment would require {used} minutes/week, including other teaching. The allowed load is {allowed}; it exceeds the limit by {used - allowed} minutes.'})
    candidate['confirmed'] = False
    return candidate, row
