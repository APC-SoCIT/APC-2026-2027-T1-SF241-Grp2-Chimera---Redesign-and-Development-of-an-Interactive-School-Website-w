"""Behavioral regression tests: inputs, constraints, saved versions and local HTTP."""
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook

from app import Conflict, Store, make_server
from domain import DAYS, integer, minute, solve, validate, verify
from workbook import HEADERS, demo_data, read_workbook


class DomainTests(unittest.TestCase):
    def test_spreading_lessons_keeps_required_counts_and_uses_distinct_days(self):
        from collections import Counter
        d=demo_data();d.update(max_per_day=2,spread_lessons=True)
        result=solve(d,5)
        self.assertTrue(result.get('verified'),result)
        self.assertEqual([],verify(d,result['entries'],result['activities']))
        self.assertEqual(0,result['quality']['extra_same_day_meetings'])
        self.assertTrue(all(n==1 for n in Counter((e['load'],e['day']) for e in result['entries']).values()))

    def setUp(self):
        self.data = demo_data()

    def codes(self):
        return [e['code'] for e in validate(self.data)[0]['errors']]

    def test_demo_places_every_meeting_and_respects_unavailability(self):
        result = solve(self.data)
        self.assertIn(result['status'], ['FEASIBLE', 'OPTIMAL'])
        self.assertEqual(12, len(result['entries']))
        self.assertEqual([], verify(self.data, result['entries']))
        self.assertFalse(any(e['teacher'] == 'T01' and e['day'] == 'Mon' and e['start'] < 480 for e in result['entries']))

    def test_input_numbers_never_silently_round_or_default(self):
        for value in ['', None, -1, 1.5, True, '=1+1', float('nan'), float('inf')]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                integer(value)
        self.assertEqual(0, integer('0'))
        self.assertEqual(2, integer('2.0'))

    def test_invalid_clock_values_rejected(self):
        for value in ['24:00', '08:60', '-1:00', '13:00 PM', '=0.5', '', '7:5']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                minute(value)
        self.assertEqual(795, minute('1:15 PM'))
        self.assertEqual(0, minute('12:00 AM'))

    def test_missing_section_is_blocked_instead_of_guessed(self):
        self.data['loads'][0]['section'] = ''
        self.assertIn('REFERENCE', self.codes())
        self.assertEqual('INVALID_INPUT', solve(self.data)['status'])

    def test_unknown_teacher_is_blocked(self):
        self.data['loads'][0]['teacher'] = 'Not registered'
        self.assertIn('TEACHER', self.codes())

    def test_duplicate_names_and_ids_are_not_overwritten(self):
        self.data['teachers'].append(deepcopy(self.data['teachers'][0]))
        self.assertIn('DUPLICATE', self.codes())
        self.assertIn('AMBIGUOUS_NAME', self.codes())

    def test_two_teachers_for_same_class_is_not_silently_accepted(self):
        duplicate = deepcopy(self.data['loads'][0])
        duplicate.update(id='different-id', teacher='T02')
        self.data['loads'].append(duplicate)
        self.assertIn('DUPLICATE_CLASS', self.codes())

    def test_curriculum_detects_staff_shortage_even_when_load_is_missing(self):
        self.data['loads'].pop()
        self.assertIn('UNSTAFFED', self.codes())

    def test_frequency_must_match_independent_requirement(self):
        self.data['loads'][0]['n45'] = 0
        self.assertIn('DEMAND_MISMATCH', self.codes())

    def test_removing_required_core_class_does_not_hide_curriculum_gap(self):
        self.data['loads'].pop()
        self.data['requirements'].pop()
        self.assertIn('CURRICULUM_GAP', self.codes())

    def test_workload_allowance_requires_reason_and_capacity_still_applies(self):
        self.data['teachers'][0]['limit'] = 300
        report, _ = validate(self.data)
        self.assertEqual([], report['errors'])
        self.assertIn('WORKLOAD', [warning['code'] for warning in report['warnings']])
        result = solve(self.data)
        self.assertTrue(result['verified'])
        self.assertEqual([], verify(self.data, result['entries']))
        self.data['teachers'][0]['approved_overload'] = 30
        self.assertIn('APPROVAL_REASON', self.codes())
        self.data['teachers'][0]['overload_reason'] = 'Demo review: coordinator approved 30 additional minutes'
        report, _ = validate(self.data)
        self.assertEqual([], report['errors'])
        self.assertNotIn('WORKLOAD', [warning['code'] for warning in report['warnings']])
        self.data['teachers'][0]['extra_minutes'] = 60
        self.assertIn('WORKLOAD', [warning['code'] for warning in validate(self.data)[0]['warnings']])

    def test_incomplete_or_misspelled_unavailability_is_never_ignored(self):
        for updates in [dict(days=''), dict(start=''), dict(days='Mno'), dict(end='06:00'), dict(teacher='unknown')]:
            with self.subTest(updates=updates):
                self.data = demo_data()
                self.data['unavailable'][0].update(updates)
                self.assertIn('TIME', self.codes())

    def test_elementary_minutes_and_actual_times_must_be_confirmed(self):
        self.data['teachers'][0]['elementary'] = True
        self.assertIn('EXTERNAL_COMMITMENTS', self.codes())
        self.data['teachers'][0]['extra_minutes'] = 60
        self.data['unavailable'] = []
        self.assertIn('EXTERNAL_TIMES', self.codes())

    def test_blank_bells_are_not_replaced_with_sample_times(self):
        for bell in self.data['bells']:
            bell['start'] = bell['end'] = ''
        self.assertIn('MISSING_BELLS', self.codes())

    def test_breaks_and_class_periods_cannot_overlap(self):
        self.data['bells'].append(dict(group='7-8', days='Mon', label='Recess', kind='Recess', start='07:50', end='08:10'))
        self.assertIn('BELL_OVERLAP', self.codes())

    def test_45_minute_capacity_is_separate_from_total_minutes(self):
        self.data['bells'] = [b for b in self.data['bells'] if b['days'] != 'Fri']
        self.assertIn('CLASS_CAPACITY', self.codes())

    def test_daily_limit_is_enforced(self):
        self.data['bells'] = [dict(group=g,days='Mon',label=f'P{i}',kind='Class',start=a,end=b)
                              for g in ['7-8','9-10'] for i,(a,b) in enumerate([('08:00','09:00'),('09:00','10:00'),('10:00','11:00')])]
        for collection in ['requirements','loads']:
            for row in self.data[collection]:
                row['n45'] = 0
        self.assertIn('CLASS_CAPACITY', self.codes())

    def test_teacher_shortage_at_same_clock_time_is_proven_infeasible(self):
        self.data['subjects'] = self.data['subjects'][:1]
        self.data['requirements'] = [r for r in self.data['requirements'] if r['subject'] == 'Demo Mathematics']
        self.data['loads'] = [r for r in self.data['loads'] if r['subject'] == 'Demo Mathematics']
        for collection in ['requirements','loads']:
            for row in self.data[collection]:
                row.update(n60=1,n45=0)
        self.data['bells'] = [dict(group=g,days='Tue',label='P1',kind='Class',start='07:00',end='08:00') for g in ['7-8','9-10']]
        self.assertEqual([], self.codes())  # individually feasible, collectively impossible
        result = solve(self.data)
        self.assertEqual('INFEASIBLE', result['status'])
        self.assertEqual([], result['entries'])
        self.assertEqual(2, len(result['explanation']))

    def test_timeout_is_not_reported_as_impossible(self):
        result = solve(self.data, time_limit=0)
        self.assertEqual('UNKNOWN', result['status'])
        self.assertEqual([], result['entries'])
        self.assertIn('without a schedule or proof', result['message'])

    def test_independent_verifier_rejects_dropped_or_tampered_meetings(self):
        result = solve(self.data)
        self.assertTrue(verify(self.data, result['entries'][1:]))
        entries = deepcopy(result['entries'])
        entries[0]['teacher'] = 'T99'
        self.assertTrue(verify(self.data, entries))
        entries = deepcopy(result['entries'])
        entries[0]['start'] += 1
        self.assertTrue(verify(self.data, entries))

    def test_combined_shs_strands_can_run_in_parallel_but_core_blocks_both(self):
        self.data['sections'] = [dict(id='Combined',grade=11,strands='ABM, ICT')]
        self.data['subjects'] = [dict(id='Business',grade=11,kind='Strand',strand='ABM'),
                                 dict(id='Programming',grade=11,kind='Strand',strand='ICT')]
        self.data['requirements'] = [dict(id=f'R{i}',section='Combined',subject=s['id'],strand=s['strand'],n60=1,n45=0) for i,s in enumerate(self.data['subjects'])]
        self.data['loads'] = [dict(**r,teacher=f'T0{i+1}') for i,r in enumerate(self.data['requirements'])]
        self.data['bells'] = [dict(group='11-12',days='Tue',label='P1',kind='Class',start='07:00',end='08:00')]
        result = solve(self.data)
        self.assertTrue(result['verified'])
        self.assertEqual(2,len(result['entries']))
        self.data['teachers'].append(dict(self.data['teachers'][0],id='T03',name='Demo Teacher C'))
        self.data['subjects'].append(dict(id='Core lesson',grade=11,kind='Core',strand=''))
        self.data['requirements'].append(dict(id='R3',section='Combined',subject='Core lesson',strand='',n60=1,n45=0))
        self.data['loads'].append(dict(self.data['requirements'][-1],teacher='T03'))
        self.assertIn('SECTION_CAPACITY',self.codes())


class PersistenceTests(unittest.TestCase):
    def test_revised_loads_and_times_regenerate_without_changing_previous_version(self):
        saved,first=self.generated()
        self.store.publish(first['id'],'Coordinator')
        revised=deepcopy(self.data);revised['confirmed']=False
        load=revised['loads'][0];load['n60']+=1
        requirement=next(r for r in revised['requirements'] if r['section']==load['section'] and r['subject']==load['subject'])
        requirement['n60']+=1
        for b in revised['bells']:
            for field in ['start','end']:
                value=minute(b[field])+15;b[field]=f'{value//60:02}:{value%60:02}'
        updated=self.store.save(revised,saved['revision'])
        second=self.store.generate(updated['id'],updated['revision'],3)
        self.assertTrue(second['result'].get('verified'),second)
        self.assertEqual(13,len(second['result']['entries']))
        self.assertEqual(first['snapshot'],self.store.run(first['id'])['snapshot'])
        self.assertEqual(12,len(self.store.run(first['id'])['result']['entries']))
        self.assertEqual(first['id'],self.store.published(saved['id'])['id'])
        with self.assertRaises(ValueError):self.store.publish(second['id'],'Coordinator')

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'test.sqlite3')
        self.data = demo_data()
        self.data['confirmed'] = True

    def tearDown(self):
        self.tmp.cleanup()

    def generated(self):
        saved = self.store.save(self.data,None)
        return saved,self.store.generate(saved['id'],saved['revision'],2)

    def test_publish_and_teacher_view_use_only_verified_published_version(self):
        saved,run = self.generated()
        self.assertIsNone(self.store.published(saved['id']))
        self.store.publish(run['id'],'Demo Coordinator')
        self.assertEqual(run['id'],self.store.published(saved['id'])['id'])

    def test_changed_inputs_make_old_draft_stale(self):
        saved,run = self.generated()
        self.data['unavailable'].append(dict(teacher='T02',days='Tue',start='07:00',end='08:00',reason='New duty'))
        self.store.save(self.data,saved['revision'])
        with self.assertRaises(Conflict):
            self.store.publish(run['id'],'Coordinator')

    def test_failed_regeneration_preserves_previous_published_version(self):
        saved,run = self.generated()
        self.store.publish(run['id'],'Coordinator')
        self.data['loads'].pop()
        updated = self.store.save(self.data,saved['revision'])
        failed = self.store.generate(updated['id'],updated['revision'],2)
        self.assertEqual('failed',failed['status'])
        self.assertEqual(run['id'],self.store.published(saved['id'])['id'])
        self.assertEqual(12,len(self.store.run(run['id'])['result']['entries']))

    def test_only_one_version_is_published_atomically(self):
        saved,first = self.generated()
        self.store.publish(first['id'],'Coordinator')
        second = self.store.generate(saved['id'],saved['revision'],2)
        self.store.publish(second['id'],'Coordinator')
        self.assertEqual('superseded',self.store.run(first['id'])['status'])
        self.assertEqual(1,sum(r['status']=='published' for r in self.store.runs(saved['id'])))

    def test_unconfirmed_draft_cannot_be_published(self):
        self.data['confirmed'] = False
        _,run = self.generated()
        with self.assertRaises(ValueError):
            self.store.publish(run['id'],'Coordinator')

    def test_concurrent_save_requires_current_revision(self):
        saved,_ = self.generated()
        self.store.save(self.data,saved['revision'])
        with self.assertRaises(Conflict):
            self.store.save(self.data,saved['revision'])

    def test_malformed_working_copy_cannot_replace_saved_data(self):
        saved = self.store.save(self.data,None)
        broken = deepcopy(self.data)
        broken['loads'][0]['section'] = ['not', 'a', 'section']
        self.assertIsNone(validate(broken)[1])
        with self.assertRaises(ValueError):
            self.store.save(broken,saved['revision'])
        self.assertEqual(self.data,self.store.get_workspace(saved['id'])['data'])

    def test_other_period_does_not_overwrite_this_period(self):
        first = self.store.save(self.data,None)
        self.data['period'] = 'DEMO Term 3'
        second = self.store.save(self.data,None)
        self.assertNotEqual(first['id'],second['id'])
        self.assertEqual('DEMO Term 2',self.store.get_workspace(first['id'])['data']['period'])

    def test_tampered_persisted_meeting_is_reverified_before_publish(self):
        _,run = self.generated()
        result = run['result']
        result['entries'].pop()
        with self.store.connect() as db:
            db.execute('UPDATE runs SET result=? WHERE id=?',(json.dumps(result),run['id']))
        with self.assertRaises(ValueError):
            self.store.publish(run['id'],'Coordinator')


class ImportTests(unittest.TestCase):
    class Sheet:
        def __init__(self,rows):
            self.rows=rows; self.max_row=len(rows); self.max_column=max(map(len,rows))
        def iter_rows(self,min_row=1,max_row=None,values_only=True):
            return iter(self.rows[min_row-1:max_row])

    class Workbook(dict):
        @property
        def sheetnames(self): return list(self)
        def close(self): pass

    def fixture(self):
        records = {
            'Teachers': [['T01','Synthetic Teacher',1500,'No','']],
            'Sections': [[7,'G7 Demo','','','=arbitrary_formula()']],
            'Subjects': [['Math',7,'Core','']],
            'Teaching Loads': [['Synthetic Teacher','Math','=bad_derived_grade','G7 Demo','',2,1,'=bad_total','=bad_check'],
                               ['', '', '=formula_only_row', '', '', None, None,'=formula_only_row','=formula_only_row']],
            'Bell Schedule': [['7-8','Mon-Thu','P1','Class',7/24,8/24,'=bad_minutes']],
            'Unavailable Times': [],
        }
        return self.Workbook({name:self.Sheet([['Title'],[],headers]+records[name]) for name,headers in HEADERS.items()})

    def zip_bytes(self):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as archive: archive.writestr('placeholder','fixture')
        return stream.getvalue()

    def test_derived_formulas_are_ignored_but_real_inputs_are_preserved(self):
        with patch('workbook.openpyxl.load_workbook',return_value=self.fixture()):
            data=read_workbook(self.zip_bytes())
        self.assertEqual(1,len(data['loads']))
        self.assertEqual('T01',data['loads'][0]['teacher'])
        self.assertEqual(4,data['loads'][0]['_row'])
        self.assertEqual('07:00',data['bells'][0]['start'])
        self.assertEqual(2,data['loads'][0]['n60'])
        self.assertFalse(data['confirmed'])

    def test_formula_in_editable_numeric_cell_is_not_evaluated(self):
        wb=self.fixture(); wb['Teaching Loads'].rows[3][5]='=1+1'
        with patch('workbook.openpyxl.load_workbook',return_value=wb):
            data=read_workbook(self.zip_bytes())
        data.update(school_year='2026-2027',period='Test')
        self.assertTrue(any(e['code']=='NUMBER' for e in validate(data)[0]['errors']))

    def test_wrong_workbook_is_explained(self):
        with self.assertRaises(ValueError): read_workbook(b'%PDF example')
        with patch('workbook.openpyxl.load_workbook',return_value=self.Workbook()):
            with self.assertRaisesRegex(ValueError,'Missing SNCS input sheets'):
                read_workbook(self.zip_bytes())


class HttpTests(unittest.TestCase):
    def test_gateway_mode_requires_internal_secret_for_reads_and_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=make_server(Store(Path(tmp)/'gateway.sqlite3'),0,'test-gateway-secret-at-least-32-characters')
            worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
            url=f'http://127.0.0.1:{server.server_port}/api/health'
            try:
                for headers in [{},{'X-SNCS-Gateway':'wrong'}]:
                    with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(urllib.request.Request(url,headers=headers))
                    self.assertEqual(403,caught.exception.code)
                req=urllib.request.Request(url,headers={'X-SNCS-Gateway':'test-gateway-secret-at-least-32-characters'})
                with urllib.request.urlopen(req) as response:self.assertEqual('ready',json.load(response)['status'])
                blocked=urllib.request.Request(url.replace('/health','/save'),data=b'{}',headers={'Content-Type':'application/json','X-SNCS-Local':'1'})
                with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(blocked)
                self.assertEqual(403,caught.exception.code)
            finally:
                server.shutdown();server.server_close();worker.join()

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.server=make_server(Store(Path(self.tmp.name)/'http.sqlite3'),0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.url=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.tmp.cleanup()

    def call(self,path,payload=None,headers=None):
        body=json.dumps(payload).encode() if payload is not None else None
        req=urllib.request.Request(self.url+path,data=body,headers=headers or {'Content-Type':'application/json','X-SNCS-Local':'1'})
        with urllib.request.urlopen(req,timeout=10) as response:
            return json.load(response)

    def import_workbook(self, *, teacher='Synthetic Teacher', meetings=2):
        workbook = Workbook()
        workbook.remove(workbook.active)
        records = {
            'Teachers': [['T01', 'Synthetic Teacher', 1500, 'No', '']],
            'Sections': [[7, 'G7 Demo', '', '', '']],
            'Subjects': [['Math', 7, 'Core', '']],
            'Teaching Loads': [[teacher, 'Math', 7, 'G7 Demo', '', meetings, 1, '', '']],
            'Bell Schedule': [['7-8', 'Mon-Thu', 'P1', 'Class', '07:00', '08:00', '']],
            'Unavailable Times': [['Synthetic Teacher', 'Tue', '09:00', '10:00', 'Other assignment']],
        }
        for name, headings in HEADERS.items():
            sheet = workbook.create_sheet(name)
            sheet.append(headings)
            for row in records[name]:
                sheet.append(row)
        stream = io.BytesIO()
        workbook.save(stream)
        workbook.close()
        request = urllib.request.Request(self.url + '/api/import', data=stream.getvalue(), headers={
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'X-SNCS-Local': '1',
        })
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)

    def test_import_reports_sheet_row_and_field_without_saving_invalid_rows(self):
        for workbook_input, field in [({'teacher': 'Unknown'}, 'teacher'), ({'meetings': '=1+1'}, 'n60')]:
            with self.subTest(field=field):
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    self.import_workbook(**workbook_input)
                self.assertEqual(422, caught.exception.code)
                issues = json.load(caught.exception)['issues']
                self.assertIn(('Teaching Loads', 2, field),
                              [(issue['sheet'], issue['row'], issue['field']) for issue in issues])
                self.assertEqual([], self.call('/api/workspaces'))

    def test_valid_workbook_saves_atomically_and_invalid_edit_preserves_revision(self):
        preview = self.import_workbook()
        self.assertEqual([], self.call('/api/workspaces'))
        data = preview['data']
        data.update(school_year='2026-2027', period='Import QA')
        self.assertIn('CLASS_CAPACITY', [issue['code'] for issue in validate(data)[0]['errors']])
        saved = self.call('/api/save', {'data': data})
        path = '/api/workspace?id=' + saved['id']
        original = self.call(path)
        self.assertEqual('T01', original['data']['loads'][0]['teacher'])
        self.assertEqual(1, len(original['data']['unavailable']))

        data['loads'][0]['teacher'] = 'Unknown'
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/save', {'data': data, 'revision': saved['revision']})
        self.assertEqual(422, caught.exception.code)
        issue = next(issue for issue in json.load(caught.exception)['issues'] if issue['code'] == 'TEACHER')
        self.assertEqual(('Teaching Loads', 2, 'teacher'), (issue['sheet'], issue['row'], issue['field']))
        self.assertEqual(original, self.call(path))

    def test_workload_warning_allows_a_draft_and_requires_approval_to_publish(self):
        data = demo_data()
        data['confirmed'] = True
        data['teachers'][0]['limit'] = 100
        saved = self.call('/api/save', {'data': data})
        run = self.call('/api/generate', {**saved, 'seconds': 2})
        self.assertEqual('draft', run['status'])
        self.assertIn('WORKLOAD', [warning['code'] for warning in run['result']['report']['warnings']])
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/publish', {'id': run['id'], 'reviewer': 'Synthetic reviewer'})
        self.assertEqual(400, caught.exception.code)
        self.assertIn('before publication', json.load(caught.exception)['error'])
        self.assertIsNone(self.call('/api/published?id=' + saved['id']))

    def test_full_api_flow_and_local_published_read(self):
        data=self.call('/api/demo'); data['confirmed']=True
        self.assertEqual([],self.call('/api/validate',{'data':data})['errors'])
        saved=self.call('/api/save',{'data':data})
        run=self.call('/api/generate',{**saved,'seconds':2})
        self.assertIsNone(self.call('/api/published?id='+saved['id']))
        self.call('/api/publish',{'id':run['id'],'reviewer':'Demo Coordinator'})
        self.assertEqual(run['id'],self.call('/api/published?id='+saved['id'])['id'])

    def test_cross_origin_write_is_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/save',{'data':demo_data()},headers={'Content-Type':'application/json','X-SNCS-Local':'1','Origin':'https://example.org'})
        self.assertEqual(403,caught.exception.code)

    def test_manual_entry_endpoint_saves_edits_and_reports_field_errors(self):
        data=self.call('/api/demo')
        saved=self.call('/api/save',{'data':data})
        load={**data['loads'][0],'teacher':'T02'}
        result=self.call('/api/manual-load',{'data':data,'revision':saved['revision'],'load':load,'editing_id':'LOAD-1'})
        self.assertEqual('T02',result['load']['teacher'])
        reopened=self.call('/api/workspace?id='+result['id'])
        self.assertEqual('T02',reopened['data']['loads'][0]['teacher'])
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/manual-load',{'data':result['data'],'revision':result['revision'],'load':{**load,'n60':1.5},'editing_id':'LOAD-1'})
        self.assertEqual(422,caught.exception.code)
        self.assertIn('n60',json.load(caught.exception)['fields'])
        self.assertEqual(result['revision'],self.call('/api/workspace?id='+result['id'])['revision'])

    def test_invalid_drafts_can_be_saved_but_not_published(self):
        data=demo_data(); data['loads'][0]['n60']=1.5
        saved=self.call('/api/save',{'data':data})
        run=self.call('/api/generate',{**saved,'seconds':2})
        self.assertEqual('INVALID_INPUT',run['result']['status'])
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call('/api/publish',{'id':run['id'],'reviewer':'Coordinator'})
        self.assertEqual(400,caught.exception.code)


if __name__ == '__main__':
    unittest.main()
