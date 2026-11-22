"""Real solver checks for school shifts, adviser duties and automatic allocation."""
import unittest
from copy import deepcopy
from domain import solve, validate, verify
from school_day import coordinator_starting_times
from workbook import demo_data


def plan(group, recess, dismissal, lunch='no'):
    return dict(group=group, days='Mon-Fri', arrival='06:30', morning_end='07:00',
                recess_start=recess[0], recess_end=recess[1], lunch=lunch,
                lunch_start='', lunch_end='', dismissal_start=dismissal[0], dismissal_end=dismissal[1])


def with_days():
    d = demo_data()
    d['sections'][0]['advisers'] = 'T01'
    d['sections'][1]['advisers'] = 'T02'
    d['day_plans'] = [plan('7-8', ('10:30','10:50'), ('14:00','14:10')),
                      plan('9-10', ('10:50','11:10'), ('14:10','14:20'))]
    return d


class SchoolDayTests(unittest.TestCase):
    def test_five_pm_cutoff_rejects_late_periods_even_without_day_plans(self):
        d=demo_data();d['bells'].append(dict(group='7-8',days='Mon',kind='Class',label='Late',start='16:15',end='17:15'))
        self.assertIn('SCHOOL_CUTOFF',self.codes(d))
        self.assertEqual('INVALID_INPUT',solve(d)['status'])

    def test_five_pm_cutoff_includes_dismissal_and_cannot_be_bypassed_by_trial(self):
        d=with_days();d.update(trial=True,confirmed=True)
        d['day_plans'][0].update(dismissal_start='16:55',dismissal_end='17:05')
        self.assertIn('SCHOOL_CUTOFF',self.codes(d))
        self.assertTrue(verify(d,[],[]))

    def test_exactly_five_pm_is_allowed_and_staggering_still_applies(self):
        d=with_days();d['day_plans'][0].update(dismissal_start='16:50',dismissal_end='17:00')
        self.assertTrue(solve(d).get('verified'))
        d['day_plans'][1].update(dismissal_start='16:55',dismissal_end='17:00')
        self.assertIn('STAGGER',self.codes(d))

    def test_historical_late_result_is_flagged_and_not_returned_as_published(self):
        import tempfile,json
        from pathlib import Path
        from app import Store
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'history.sqlite3');d=with_days()
            w=store.save(d,None);r=store.generate(w['id'],w['revision'],3)
            self.assertTrue(r['result'].get('verified'))
            legacy=deepcopy(r['snapshot']);legacy['day_plans'][0].update(dismissal_start='17:00',dismissal_end='17:10')
            with store.connect() as db:
                db.execute("UPDATE runs SET snapshot=?,status='published' WHERE id=?",(json.dumps(legacy),r['id']))
            history=store.run(r['id'])
            self.assertTrue(history['policy_errors'])
            self.assertTrue(history['result']['verified'])  # Keep the historical record intact.
            self.assertIsNone(store.published(w['id']))

    def test_unused_shift_settings_can_remain_unfinished(self):
        d=with_days();d['day_plans']+=coordinator_starting_times()[2:]
        self.assertTrue(solve(d).get('verified'))

    def codes(self, d):
        return [i['code'] for i in validate(d)[0]['errors']]

    def test_supplied_starting_times_do_not_invent_breaks_or_dismissal(self):
        p = coordinator_starting_times()
        self.assertEqual(['7-8','9-10','11','12'],[r['group'] for r in p])
        self.assertEqual(('06:30','07:00'),(p[2]['arrival'],p[2]['morning_end']))
        self.assertEqual(('12:30','13:00'),(p[3]['arrival'],p[3]['morning_end']))
        self.assertTrue(all(not r['recess_start'] and not r['dismissal_start'] and r['lunch']=='unconfirmed' for r in p))

    def test_partial_or_invalid_day_settings_never_generate(self):
        d = with_days(); d['day_plans'][0]['dismissal_end']=''
        self.assertIn('DAY_PLAN',self.codes(d)); self.assertEqual('INVALID_INPUT',solve(d)['status'])
        d = with_days(); d['day_plans'][0]['arrival']='15:00'
        self.assertIn('DAY_PLAN',self.codes(d))

    def test_all_activities_are_returned_and_verified_separately_from_lessons(self):
        d = with_days(); r = solve(d)
        self.assertTrue(r.get('verified'),r)
        self.assertEqual(12,len(r['entries']))
        self.assertEqual(30,len(r['activities']))
        self.assertEqual([],verify(d,r['entries'],r['activities']))
        self.assertTrue(verify(d,r['entries'],r['activities'][:-1]))
        self.assertTrue(verify(d,r['entries'],None))

    def test_recess_and_lunch_cannot_overlap_other_groups(self):
        d=with_days(); d['day_plans'][1].update(recess_start='10:40',recess_end='11:00')
        self.assertIn('STAGGER',self.codes(d))
        d=with_days(); d['day_plans'][1].update(lunch='yes',lunch_start='10:30',lunch_end='10:50')
        self.assertIn('STAGGER',self.codes(d))

    def test_dismissal_must_be_staggered_and_classes_end_before_it(self):
        d=with_days(); d['day_plans'][1].update(dismissal_start='14:00',dismissal_end='14:15')
        self.assertIn('STAGGER',self.codes(d))
        d=with_days(); d['bells'].append(dict(group='7-8',days='Mon',label='Too late',kind='Class',start='13:30',end='14:30'))
        self.assertIn('SCHOOL_HOURS',self.codes(d))

    def test_classes_cannot_run_during_morning_routines(self):
        d=with_days(); d['day_plans'][0]['morning_end']='07:30'
        self.assertIn('SCHOOL_HOURS',self.codes(d))

    def test_all_class_days_need_a_day_setting_and_duplicates_are_rejected(self):
        d=with_days(); d['day_plans'][0]['days']='Mon-Thu'
        self.assertIn('DAY_PLAN',self.codes(d))
        d=with_days(); d['day_plans'].append(deepcopy(d['day_plans'][0]))
        self.assertIn('DAY_PLAN',self.codes(d))

    def test_missing_or_double_booked_advisers_are_actionable_errors(self):
        d=with_days(); d['sections'][0]['advisers']=''
        self.assertIn('ADVISER',self.codes(d))
        d=with_days(); d['sections'][1]['advisers']='T01'
        self.assertIn('ADVISER_CONFLICT',self.codes(d))

    def test_adviser_cannot_teach_another_grade_during_recess(self):
        d=with_days(); d['subjects']=d['subjects'][:1]
        d['requirements']=[r for r in d['requirements'] if r['subject']=='Demo Mathematics']
        d['loads']=[r for r in d['loads'] if r['subject']=='Demo Mathematics']
        for rows in [d['requirements'],d['loads']]:
            for row in rows: row.update(n60=1,n45=0)
        d['unavailable']=[]
        d['bells']=[dict(group=g,days='Tue',label='Class',kind='Class',start=a,end=b) for g,a,b in [('7-8','08:00','09:00'),('9-10','09:00','10:00'),('9-10','10:00','11:00')]]
        d['day_plans'][0].update(recess_start='09:00',recess_end='09:20')
        d['day_plans'][1].update(recess_start='11:00',recess_end='11:20')
        r=solve(d); self.assertTrue(r.get('verified'),r)
        self.assertEqual(600,next(e['start'] for e in r['entries'] if e['section']=='G9 Demo B'))
        d['bells'].pop()
        self.assertIn('CLASS_CAPACITY',self.codes(d))

    def test_homeroom_must_be_assigned_to_an_adviser(self):
        d=with_days(); d['subjects'][0]['kind']='Homeroom'
        self.assertIn('HOMEROOM_ADVISER',self.codes(d))

    def test_all_co_advisers_are_protected_during_homeroom(self):
        d=with_days();d['teachers'].append({**d['teachers'][1],'id':'T03','name':'Third adviser'})
        d['sections'][0]['advisers']='T01,T02';d['sections'][1]['advisers']='T03'
        d['subjects']=[dict(id='HR',grade=7,kind='Homeroom',strand=''),dict(id='Math',grade=9,kind='Core',strand='')]
        d['requirements']=[dict(id='R1',section='G7 Demo A',subject='HR',strand='',n60=1,n45=0),dict(id='R2',section='G9 Demo B',subject='Math',strand='',n60=1,n45=0)]
        d['loads']=[{**r,'teacher':t} for r,t in zip(d['requirements'],['T01','T02'])]
        d['bells']=[dict(group=g,days='Tue',label='P1',kind='Class',start=a,end=b) for g,a,b in [('7-8','08:00','09:00'),('9-10','08:00','09:00'),('9-10','09:00','10:00')]]
        r=solve(d);self.assertTrue(r.get('verified'),r)
        self.assertEqual(540,next(e['start'] for e in r['entries'] if e['subject']=='Math'))
        self.assertEqual('T02',next(a['advisers'] for a in r['activities'] if a['kind']=='Homeroom supervision'))
        self.assertEqual([],verify(d,r['entries'],r['activities']))

    def test_grade_11_morning_and_grade_12_afternoon_are_independent(self):
        d=demo_data(); d['sections']=[dict(id='AM',grade=11,advisers='T01',strands=''),dict(id='PM',grade=12,advisers='T02',strands='')]
        d['subjects']=d['subjects'][:1]; d['requirements']=[]; d['loads']=[]; d['bells']=[]; d['unavailable']=[]
        for i,(sec,g,a,b) in enumerate([('AM','11','07:00','08:00'),('PM','12','13:00','14:00')]):
            r=dict(id='R'+str(i),section=sec,subject=d['subjects'][0]['id'],strand='',n60=1,n45=0)
            d['requirements'].append(r);d['loads'].append({**r,'teacher':'T0'+str(i+1)})
            d['bells'].append(dict(group=g,days='Mon',kind='Class',label='P1',start=a,end=b))
        d['day_plans']=[plan('11',('09:00','09:20'),('11:30','11:40')),plan('12',('15:00','15:20'),('16:50','17:00'))]
        d['day_plans'][1].update(arrival='12:30',morning_end='13:00')
        r=solve(d);self.assertTrue(r.get('verified'),r)
        self.assertEqual({('AM',420),('PM',780)},{(e['section'],e['start']) for e in r['entries']})


class AllocationTests(unittest.TestCase):
    def test_full_school_search_keeps_every_hard_requirement_active(self):
        d=demo_data();template=d['teachers'][0]
        d['teachers']=[{**template,'id':f'T{i:03}','name':f'Synthetic teacher {i}'} for i in range(101)]
        d['sections']=[dict(id=f'S{i:03}',grade=7,strands='') for i in range(101)]
        d['subjects']=d['subjects'][:1];d['requirements']=[];d['loads']=[];d['unavailable']=[]
        d['bells']=[dict(group='7-8',days='Mon',kind='Class',label='P1',start='07:30',end='08:30')]
        for i in range(101):
            r=dict(id=f'R{i}',section=f'S{i:03}',subject=d['subjects'][0]['id'],strand='',n60=1,n45=0)
            d['requirements'].append(r);d['loads'].append({**r,'teacher':f'T{i:03}'})
        result=solve(d,time_limit=5)
        self.assertTrue(result.get('verified'),result)
        self.assertEqual(101,len(result['entries']));self.assertEqual(4,result['search_workers'])
        self.assertEqual([],verify(d,result['entries'],result['activities']))

    def test_manual_auto_assignment_batch_is_atomic_and_respects_workload(self):
        import tempfile
        from pathlib import Path
        from app import Store
        from manual_load import LoadInputError
        d=demo_data();d['loads']=[]
        values=dict(teacher='T01',subject='Demo Mathematics',section='',strand='',allocation='auto',n60=2,n45=1,section_count=2)
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'test.sqlite3'); saved=store.save(d,None)
            result=store.save_load(d,saved['revision'],values)
            self.assertEqual(2,len(result['data']['loads']))
            bad={**values,'section_count':10}
            with self.assertRaises(LoadInputError):store.save_load(result['data'],result['revision'],bad)
            self.assertEqual(result['revision'],store.get_workspace(result['id'])['revision'])

    def test_pool_rows_are_allocated_once_and_all_curriculum_is_covered(self):
        d=demo_data()
        for row in d['loads']: row.update(section='',allocation='auto')
        r=solve(d);self.assertTrue(r.get('verified'),r)
        self.assertEqual(12,len(r['entries']));self.assertEqual([],verify(d,r['entries']))
        for load in d['loads']:
            self.assertEqual(1,len({e['section'] for e in r['entries'] if e['load']==load['id']}))

    def test_extra_pool_load_does_not_create_an_unapproved_class(self):
        d=demo_data()
        for row in d['loads']:row.update(section='',allocation='auto')
        d['loads'].append({**d['loads'][0],'id':'EXTRA'})
        r=solve(d);self.assertEqual('INFEASIBLE',r['status']);self.assertFalse(r.get('verified'))

    def test_allowed_sections_are_enforced_and_split_meetings_rejected(self):
        d=demo_data(); d['loads'][0].update(section='',allocation='auto',candidate_sections='G7 Demo A')
        r=solve(d);self.assertTrue(r.get('verified'),r)
        self.assertTrue(all(e['section']=='G7 Demo A' for e in r['entries'] if e['load']=='LOAD-1'))
        e=deepcopy(r['entries']);next(x for x in e if x['load']=='LOAD-1')['section']='G9 Demo B'
        self.assertTrue(verify(d,e))

    def test_unknown_candidate_and_frequency_mismatch_are_not_guessed(self):
        d=demo_data();d['loads'][0].update(section='',allocation='auto',candidate_sections='missing')
        self.assertIn('ALLOCATION',[i['code'] for i in validate(d)[0]['errors']])
        d=demo_data();d['loads'][0].update(section='',allocation='auto',n60=1)
        self.assertEqual('INVALID_INPUT',solve(d)['status'])


class PublicationSchoolDayTests(unittest.TestCase):
    def test_verified_trial_cannot_be_published_even_when_confirmed(self):
        import tempfile
        from pathlib import Path
        from app import Store
        with tempfile.TemporaryDirectory() as tmp:
            d=with_days();d.update(trial=True,confirmed=True)
            store=Store(Path(tmp)/'trial.sqlite3');w=store.save(d,None);r=store.generate(w['id'],w['revision'],3)
            self.assertTrue(r['result'].get('verified'))
            with self.assertRaisesRegex(ValueError,'trial cannot be published'):store.publish(r['id'],'Test coordinator')
            self.assertIsNone(store.published(w['id']))

    def test_corrupted_adviser_activities_cannot_replace_a_publication(self):
        import tempfile,json
        from pathlib import Path
        from app import Store
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'test.sqlite3');d=with_days();d['confirmed']=True
            w=store.save(d,None); first=store.generate(w['id'],w['revision'],3)
            store.publish(first['id'],'Test coordinator')
            second=store.generate(w['id'],w['revision'],3)
            corrupt={**second['result'],'activities':None}
            with store.connect() as db:db.execute('UPDATE runs SET result=? WHERE id=?',(json.dumps(corrupt),second['id']))
            with self.assertRaises(ValueError):store.publish(second['id'],'Test coordinator')
            self.assertEqual(first['id'],store.published(w['id'])['id'])


class TrialPriorityTests(unittest.TestCase):
    def data(self):
        d=with_days();d.update(trial=True,elementary_after_secondary=True)
        d['teachers'][0].update(elementary=True,extra_minutes=60,availability_confirmed=False)
        d['unavailable'].append(dict(teacher='T01',days='',start='',end='',reason='Future elementary class',deferred=True))
        return d

    def test_secondary_first_trial_retains_external_minutes_and_known_fixed_times(self):
        d=self.data();report,model=validate(d)
        self.assertEqual([],report['errors']);self.assertIsNotNone(model)
        self.assertEqual(390,next(x['required'] for x in report['capacity'] if x['teacher']=='Demo Teacher A'))
        self.assertTrue(any(b['reason']=='Demo fixed duty' for b in model['blocks']))
        self.assertTrue(solve(d).get('verified'))

    def test_deferred_policy_is_not_silently_enabled_for_school_inputs(self):
        d=self.data();d['trial']=False
        self.assertIn('POLICY',[e['code'] for e in validate(d)[0]['errors']])

    def test_known_fixed_commitments_cannot_be_deferred(self):
        d=self.data();d['unavailable'][0]['deferred']=True
        self.assertIn('TIME',[e['code'] for e in validate(d)[0]['errors']])

    def test_unknown_external_minutes_remain_blocked(self):
        d=self.data();d['teachers'][0]['extra_minutes']=0
        self.assertIn('EXTERNAL_COMMITMENTS',[e['code'] for e in validate(d)[0]['errors']])

    def test_changed_day_settings_make_a_draft_stale_and_failure_preserves_publication(self):
        import tempfile
        from pathlib import Path
        from app import Store,Conflict
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'test.sqlite3');d=with_days();d['confirmed']=True
            w=store.save(d,None);first=store.generate(w['id'],w['revision'],3);store.publish(first['id'],'Test coordinator')
            draft=store.generate(w['id'],w['revision'],3)
            d['day_plans'][1].update(dismissal_start='14:00',dismissal_end='14:15')
            w=store.save(d,w['revision'])
            with self.assertRaises(Conflict):store.publish(draft['id'],'Test coordinator')
            failed=store.generate(w['id'],w['revision'],3)
            self.assertEqual('INVALID_INPUT',failed['result']['status'])
            self.assertEqual(first['id'],store.published(w['id'])['id'])


if __name__=='__main__':unittest.main()
