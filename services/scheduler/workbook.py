"""Read the existing SNCS multi-sheet template without evaluating Excel formulas."""
from __future__ import annotations

import datetime as dt
import io
import zipfile
from collections import Counter
from copy import deepcopy

import openpyxl

HEADERS = {
    'Teachers': ['Teacher ID', 'Full Name', 'Regular Load Limit (min/week)', 'Also Teaches Elementary?', 'Other Assignments'],
    'Sections': ['Grade Level', 'Section', 'Strand(s)', 'Adviser', 'Recess Group'],
    'Subjects': ['Subject', 'Grade Level', 'Type', 'Strand (if strand subject)'],
    'Teaching Loads': ['Teacher', 'Subject', 'Grade', 'Section', 'Strand Only (combined classes)', '60-min meetings / week', '45-min meetings / week', 'Weekly Minutes', 'Check'],
    'Bell Schedule': ['Grade Group', 'Days', 'Slot', 'Type', 'Start Time', 'End Time', 'Minutes'],
    'Unavailable Times': ['Teacher', 'Day', 'Start Time', 'End Time', 'Reason'],
}

# These checks depend on scheduling decisions made after the workbook is read.
READINESS_ERRORS = {
    'EXTERNAL_COMMITMENTS', 'UNAPPROVED_CLASS', 'DEMAND_MISMATCH',
    'CLASS_CAPACITY', 'SECTION_CAPACITY',
}


class WorkbookInputError(ValueError):
    def __init__(self, issues):
        super().__init__('Correct the highlighted workbook rows before importing or saving.')
        self.issues = issues


def require_valid_workbook_rows(report):
    issues = [error for error in report['errors']
              if error['sheet'] in HEADERS and error['code'] not in READINESS_ERRORS]
    if issues:
        raise WorkbookInputError(issues)


def text(value):
    return '' if value is None else str(value).strip()


def yes_no(value):
    if text(value).lower() in ['yes', 'true']:
        return True
    if text(value).lower() in ['no', 'false']:
        return False
    return value


def clock(value):
    if isinstance(value, (dt.time, dt.datetime)) and not value.second and not value.microsecond:
        return f'{value.hour:02}:{value.minute:02}'
    if type(value) in [int, float] and 0 <= value < 1:
        minutes = value * 1440
        if abs(minutes - round(minutes)) < 0.00001:
            return f'{round(minutes) // 60:02}:{round(minutes) % 60:02}'
    return text(value)


def read_workbook(content: bytes):
    if len(content) > 5 * 1024 * 1024:
        raise ValueError('The workbook must be at most 5 MB.')
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(i.file_size for i in archive.infolist()) > 30 * 1024 * 1024:
                raise ValueError('The expanded workbook is too large (30 MB maximum).')
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=False, keep_links=False)
    except (zipfile.BadZipFile, KeyError, OSError) as exc:
        raise ValueError('Choose an .xlsx SNCS Teaching Load Template, not a PDF or legacy .xls file.') from exc
    missing = [s for s in HEADERS if s not in wb.sheetnames]
    if missing:
        raise ValueError('Missing SNCS input sheets: ' + ', '.join(missing) + '. Use the multi-sheet SNCS template.')

    def rows(sheet, editable):
        ws = wb[sheet]
        if ws.max_row > 10000 or ws.max_column > 40:
            raise ValueError(f'{sheet}: sheet is too large; remove excessive unused rows/columns.')
        expected = HEADERS[sheet]
        header = None
        mapping = None
        for i, values in enumerate(ws.iter_rows(max_row=12, values_only=True), 1):
            actual = [text(v) for v in values]
            if all(h in actual for h in expected):
                header, mapping = i, [actual.index(h) for h in expected]
                if any(actual.count(h) != 1 for h in expected):
                    raise ValueError(f'{sheet}: duplicate column headers.')
                break
        if header is None:
            raise ValueError(f'{sheet}: expected headers not found in the first 12 rows. Keep the original column names.')
        result = []
        for number, values in enumerate(ws.iter_rows(min_row=header + 1, values_only=True), header + 1):
            cells = [values[index] if index < len(values) else None for index in mapping]
            # Formula-only template rows are blank unless an EDITABLE cell has content.
            if not any(cells[index] is not None and cells[index] != '' for index in editable):
                continue
            result.append(({'_sheet': sheet, '_row': number}, cells))
        if len(result) > 2000:
            raise ValueError(f'{sheet}: at most 2,000 input records are supported.')
        return result

    data = {'schema_version': 1, 'school_year': '', 'period': '', 'demo': False,
            'confirmed': False, 'max_per_day': 1, 'teachers': [], 'sections': [],
            'subjects': [], 'loads': [], 'requirements': [], 'bells': [], 'unavailable': [],
            'source_notes': [
                'Imported into a review preview. Nothing has been saved or published.',
                'Enter the target school year and period. G11 terms and G12 semesters must be confirmed with the school.',
                'Derived Grade, Weekly Minutes, Check, Summary and Recess Group formulas are ignored; the system recalculates them.',
                'Curriculum requirements are seeded from named loads plus Core/Homeroom coverage. Confirm them independently against the official curriculum, especially strand/subtrack offerings.',
                'Default maximum is one meeting per subject/section per day. Confirm this rule; no sample bell times or section allocations are invented.',
            ]}
    for src, r in rows('Teachers', range(5)):
        data['teachers'].append({**src, 'id': text(r[0]), 'name': text(r[1]), 'limit': r[2],
                                 'elementary': yes_no(r[3]), 'extra_minutes': 0,
                                 'availability_confirmed': False, 'approved_overload': 0,
                                 'overload_reason': ''})
    name_counts = Counter(t['name'] for t in data['teachers'])
    name_ids = {t['name']: t['id'] for t in data['teachers'] if name_counts[t['name']] == 1}
    for src, r in rows('Sections', [0, 1, 2, 3]):
        data['sections'].append({**src, 'id': text(r[1]), 'grade': r[0], 'strands': text(r[2]),
                                 'advisers': name_ids.get(text(r[3]), text(r[3]))})
    for src, r in rows('Subjects', range(4)):
        data['subjects'].append({**src, 'id': text(r[0]), 'grade': r[1], 'kind': text(r[2]), 'strand': text(r[3])})
    for src, r in rows('Teaching Loads', [0, 1, 3, 4, 5, 6]):
        data['loads'].append({**src, 'id': f'LOAD-{src["_row"]}', 'teacher': name_ids.get(text(r[0]), text(r[0])),
                              'subject': text(r[1]), 'section': text(r[3]), 'strand': text(r[4]),
                              'n60': r[5], 'n45': r[6]})
    for src, r in rows('Bell Schedule', range(6)):
        data['bells'].append({**src, 'group': text(r[0]), 'days': text(r[1]), 'label': text(r[2]),
                              'kind': text(r[3]), 'start': clock(r[4]), 'end': clock(r[5])})
    for src, r in rows('Unavailable Times', range(5)):
        data['unavailable'].append({**src, 'teacher': name_ids.get(text(r[0]), text(r[0])),
                                    'days': text(r[1]), 'start': clock(r[2]), 'end': clock(r[3]), 'reason': text(r[4])})
    seed_requirements(data)
    wb.close()
    return data


def seed_requirements(data):
    """Initial review aid only: imported curriculum always needs explicit confirmation."""
    subjects = {s['id']: s for s in data['subjects']}
    existing = set()
    for load in data['loads']:
        if not load['section'] or load['subject'] not in subjects:
            continue
        strand = load.get('strand') or subjects[load['subject']].get('strand') or ''
        key = (load['section'], load['subject'], strand)
        if key in existing:
            continue
        existing.add(key)
        data['requirements'].append({'id': f'REQ-{len(existing)}', 'section': key[0], 'subject': key[1],
                                      'strand': key[2], 'n60': load['n60'], 'n45': load['n45']})
    for sub in data['subjects']:
        if sub['kind'] not in ['Core', 'Homeroom']:
            continue
        for sec in data['sections']:
            key = (sec['id'], sub['id'], '')
            if sub['grade'] not in ['Any', sec['grade']] or key in existing:
                continue
            existing.add(key)
            data['requirements'].append({'id': f'REQ-{len(existing)}', 'section': key[0], 'subject': key[1],
                                          'strand': '', 'n60': '', 'n45': ''})


def demo_data():
    """Small synthetic fixture, independent curriculum and assignments, staggered bells."""
    data = {'schema_version': 1, 'school_year': '2026-2027', 'period': 'DEMO Term 2',
            'demo': True, 'confirmed': False, 'max_per_day': 1,
            'teachers': [dict(id='T01', name='Demo Teacher A', limit=1500, elementary=False,
                              extra_minutes=0, availability_confirmed=True, approved_overload=0, overload_reason=''),
                         dict(id='T02', name='Demo Teacher B', limit=1500, elementary=False,
                              extra_minutes=0, availability_confirmed=True, approved_overload=0, overload_reason='')],
            'sections': [dict(id='G7 Demo A', grade=7, strands=''), dict(id='G9 Demo B', grade=9, strands='')],
            'subjects': [dict(id='Demo Mathematics', grade='Any', kind='Core', strand=''),
                         dict(id='Demo English', grade='Any', kind='Core', strand='')],
            'requirements': [], 'loads': [], 'bells': [],
            'unavailable': [dict(teacher='T01', days='Mon', start='07:00', end='08:00', reason='Demo fixed duty')],
            'source_notes': ['Synthetic demonstration only. These are not school-approved bell times, subjects, loads or policies.']}
    for g, spans in [('7-8', [('07:00', '08:00'), ('08:00', '09:00'), ('09:20', '10:20')]),
                     ('9-10', [('07:00', '08:00'), ('08:20', '09:20'), ('09:20', '10:20')])]:
        for i, (start, end) in enumerate(spans, 1):
            data['bells'].append(dict(group=g, days='Mon-Thu', label=f'Period {i}', kind='Class', start=start, end=end))
        data['bells'].append(dict(group=g, days='Fri', label='Period 1', kind='Class', start='07:00', end='07:45'))
        data['bells'].append(dict(group=g, days='Fri', label='Period 2', kind='Class', start='08:00', end='08:45'))
    for sec in data['sections']:
        for i, sub in enumerate(data['subjects'], 1):
            req = dict(id=f'REQ-{len(data["requirements"]) + 1}', section=sec['id'], subject=sub['id'], strand='', n60=2, n45=1)
            data['requirements'].append(req)
            load = deepcopy(req)
            load.update(id=f'LOAD-{len(data["loads"]) + 1}', teacher=f'T0{i}')
            data['loads'].append(load)
    return data


def coordinator_demo_data():
    """Clearly fictional, complete example of the coordinator workflow."""
    data = demo_data()
    data['period'] = 'DEMO · School-day rules'
    data['sections'][0]['advisers'] = 'T01'
    data['sections'][1]['advisers'] = 'T02'
    for row in data['loads']:
        row.update(section='', allocation='auto')
    data['day_plans'] = [dict(group=g, days='Mon-Fri', arrival='06:30', morning_end='07:00',
                              recess_start=a, recess_end=b, lunch='no', lunch_start='', lunch_end='',
                              dismissal_start=c, dismissal_end=e)
                         for g,a,b,c,e in [('7-8','10:30','10:50','14:00','14:10'),
                                          ('9-10','10:50','11:10','14:10','14:20')]]
    data['source_notes'] = ['Fictional demonstration only: these are not the school’s approved bell times or lunch policy. Includes automatic section allocation and adviser supervision.']
    return data
