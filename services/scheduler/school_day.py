"""School-day windows and adviser duties, independent of teaching demand."""
from collections import defaultdict

GROUPS = ('7-8', '9-10', '11', '12')
SCHOOL_CUTOFF = 17 * 60


def school_cutoff_violations(data, minute):
    """The confirmed 5 PM boundary includes dismissal supervision, even in trials."""
    violations = []
    for table, field in [('bells', 'end'), ('day_plans', 'dismissal_end')]:
        for row in data.get(table, []):
            try:
                late = minute(row.get(field, '')) > SCHOOL_CUTOFF
            except ValueError:
                continue  # Other validators explain blank or malformed times.
            if late:
                label = row.get('label') or 'Dismissal supervision'
                violations.append(dict(table=table, row=row, field=field,
                    message=f'Group {row.get("group", "unknown")}: {label} ends at {row[field]}. All classes, breaks and dismissal supervision must finish by 5:00 PM.'))
    return violations


def coordinator_starting_times():
    """Only the supplied arrival/routine times; other decisions remain blank."""
    return [dict(group=g, days='Mon-Fri', arrival=a, morning_end=b,
                 recess_start='', recess_end='', lunch='unconfirmed',
                 lunch_start='', lunch_end='', dismissal_start='', dismissal_end='')
            for g, a, b in [('7-8', '07:00', '07:30'), ('9-10', '07:00', '07:30'),
                            ('11', '06:30', '07:00'), ('12', '12:30', '13:00')]]


def adviser_ids(section):
    return [s.strip() for s in str(section.get('advisers', section.get('adviser', ''))).split(',') if s.strip()]


def prepare_school_days(data, model, issue, parse_days, minute, overlap):
    plans = data.get('day_plans', [])
    model.update(day_plans=[], activities=[])
    if not plans:
        return
    by_day = {}
    active_groups = {s['group'] for s in model['sections']}
    for index, source in enumerate(plans, 1):
        row = {**source, '_row': source.get('_row', index)}
        try:
            if row.get('group') not in GROUPS:
                raise ValueError('Choose Grades 7–8, Grades 9–10, Grade 11 or Grade 12.')
            if row['group'] not in active_groups:
                issue('UNUSED_GROUP', f'Group {row["group"]}: settings retained for later; no active sections use this group.', 'day_plans', row, warning=True)
                continue
            active_days = parse_days(row.get('days'))
            if row.get('lunch') not in ['yes', 'no']:
                raise ValueError('Confirm whether this group has a lunch break.')
            fields = ['arrival', 'morning_end', 'recess_start', 'recess_end', 'dismissal_start', 'dismissal_end']
            if row['lunch'] == 'yes':
                fields += ['lunch_start', 'lunch_end']
            elif row.get('lunch_start') or row.get('lunch_end'):
                raise ValueError('Clear lunch times or choose Yes for lunch.')
            for key in fields:
                try:
                    row[key] = minute(row.get(key, ''))
                except ValueError:
                    raise ValueError(f'{key.replace("_", " ").capitalize()}: enter the actual time.') from None
            if not row['arrival'] < row['morning_end'] < row['dismissal_start'] < row['dismissal_end']:
                raise ValueError('Arrival, end of morning routines, dismissal and end of supervision must be in that order.')
            windows = [('Morning routines', row['arrival'], row['morning_end']),
                       ('Recess', row['recess_start'], row['recess_end']),
                       ('Dismissal', row['dismissal_start'], row['dismissal_end'])]
            if row['lunch'] == 'yes':
                windows.append(('Lunch', row['lunch_start'], row['lunch_end']))
            for kind, start, end in windows:
                if start >= end or start < row['arrival'] or end > row['dismissal_end']:
                    raise ValueError(f'{kind}: the end must follow the start, within the school day.')
            for i, (_, start, end) in enumerate(windows):
                if any(start < b and a < end for _, a, b in windows[i+1:]):
                    raise ValueError('Morning routines, breaks and dismissal must not overlap.')
            for day in active_days:
                key = row['group'], day
                if key in by_day:
                    issue('DAY_PLAN', f'{row["group"]} {day}: two school-day settings cover the same day.', 'day_plans', row)
                    continue
                item = {**row, 'day': day, 'windows': windows}
                by_day[key] = item
                model['day_plans'].append(item)
        except ValueError as exc:
            issue('DAY_PLAN', f'Group {row.get("group", "unknown")}: {exc}', 'day_plans', row)
    # A shared canteen cannot host different release groups at overlapping times.
    windows = []
    for plan in model['day_plans']:
        for kind, start, end in plan['windows']:
            if kind in ['Recess', 'Lunch', 'Dismissal']:
                windows.append(dict(group=plan['group'], day=plan['day'], kind=kind, start=start, end=end))
    for i, a in enumerate(windows):
        for b in windows[i+1:]:
            if a['group'] == b['group'] or not overlap(a, b):
                continue
            if (a['kind'] == 'Dismissal') != (b['kind'] == 'Dismissal'):
                continue
            issue('STAGGER', f'{a["day"]}: {a["group"]} {a["kind"]} overlaps {b["group"]} {b["kind"]}. Stagger different groups.', 'day_plans')
    for slot in model['slots']:
        plan = by_day.get((slot['group'], slot['day']))
        if not plan:
            issue('DAY_PLAN', f'{slot["group"]} {slot["day"]}: complete school-day settings for this class day.', 'day_plans')
        elif slot['start'] < plan['morning_end'] or slot['end'] > plan['dismissal_start'] or any(
                slot['start'] < b and a < slot['end'] for _, a, b in plan['windows']):
            issue('SCHOOL_HOURS', f'{slot["group"]} {slot["day"]} {slot.get("label", "Class")}: class period is outside teaching hours or overlaps routines, a break or dismissal.', 'bells', slot)
    duties = []
    for section in model['sections']:
        advisers = adviser_ids(section)
        if not advisers or len(advisers) != len(set(advisers)) or any(t not in model['teacher_map'] for t in advisers):
            issue('ADVISER', f'{section["id"]}: select its class adviser(s).', 'sections', section, 'advisers')
            continue
        for plan in model['day_plans']:
            if plan['group'] != section['group']:
                continue
            for kind, start, end in plan['windows']:
                activity = dict(section=section['id'], advisers=','.join(advisers), day=plan['day'], kind=kind, start=start, end=end)
                model['activities'].append(activity)
                for teacher in advisers:
                    duties.append({**activity, 'teacher': teacher, 'reason': f'{kind} · {section["id"]}'})
    for i, a in enumerate(duties):
        for b in duties[i+1:] + model['blocks']:
            if a['teacher'] == b['teacher'] and overlap(a, b):
                issue('ADVISER_CONFLICT', f'{model["teacher_map"][a["teacher"]]["name"]}: {a["reason"]} conflicts with another duty or unavailable time on {a["day"]}.', 'day_plans')
    for load in model['loads']:
        if model['subject_map'].get(load.get('subject'), {}).get('kind') == 'Homeroom':
            section = model['section_map'].get(load.get('section'))
            if section and load.get('teacher') not in adviser_ids(section):
                issue('HOMEROOM_ADVISER', f'{section["id"]}: homeroom must be assigned to a class adviser.', 'loads', load, 'teacher')
    model['blocks'].extend(duties)
