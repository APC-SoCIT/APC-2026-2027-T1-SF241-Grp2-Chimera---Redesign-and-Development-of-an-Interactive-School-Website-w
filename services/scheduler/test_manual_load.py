"""Coordinator manual entry must be atomic and use the import validation rules."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from app import Conflict, Store
from domain import shape_error, validate
from manual_load import LoadInputError, empty_data, prepare_load
from workbook import demo_data


class ManualLoadTests(unittest.TestCase):
    def setUp(self):
        self.data = demo_data()
        self.values = {k: self.data['loads'][0][k] for k in ['teacher', 'section', 'subject', 'strand', 'n60', 'n45']}

    def unassign_first(self, remove_requirement=False):
        self.data['loads'].pop(0)
        if remove_requirement:
            self.data['requirements'].pop(0)

    def test_empty_period_has_no_sample_records(self):
        data = empty_data()
        self.assertIsNone(shape_error(data))
        self.assertFalse(data['demo'])
        self.assertEqual([], data['loads'])
        self.assertEqual([], data['teachers'])
        self.assertEqual([], data['requirements'])

    def test_add_assignment_for_existing_curriculum_without_mutating_inputs(self):
        self.unassign_first()
        original = deepcopy(self.data)
        self.data['confirmed'] = True
        proposed, load = prepare_load(self.data, self.values)
        self.assertEqual(4, len(proposed['loads']))
        self.assertEqual(4, len(proposed['requirements']))
        self.assertFalse(proposed['confirmed'])
        self.assertTrue(self.data['confirmed'])
        self.assertEqual(original['loads'], self.data['loads'])
        self.assertEqual(2, load['n60'])
        self.assertEqual([], validate(proposed)[0]['errors'])

    def test_new_curriculum_is_only_created_when_explicitly_selected(self):
        self.unassign_first(remove_requirement=True)
        with self.assertRaises(LoadInputError) as caught:
            prepare_load(self.data, self.values)
        self.assertIn('curriculum', caught.exception.fields)
        proposed, _ = prepare_load(self.data, self.values, add_requirement=True)
        self.assertEqual(4, len(proposed['requirements']))
        self.assertEqual(3, len(self.data['requirements']))
        self.assertEqual([], validate(proposed)[0]['errors'])

    def test_new_assignment_cannot_duplicate_a_class_even_for_a_different_teacher(self):
        with self.assertRaises(LoadInputError):
            prepare_load(self.data, {**self.values, 'teacher': 'T02'})
        self.assertEqual(4, len(self.data['loads']))

    def test_edit_preserves_load_identity_and_does_not_duplicate_requirement(self):
        proposed, load = prepare_load(self.data, {**self.values, 'teacher': 'T02'}, editing_id='LOAD-1')
        self.assertEqual('LOAD-1', load['id'])
        self.assertEqual(4, len(proposed['loads']))
        self.assertEqual(4, len(proposed['requirements']))
        self.assertEqual('T01', self.data['loads'][0]['teacher'])
        self.assertEqual('T02', proposed['loads'][0]['teacher'])

    def test_edit_cannot_move_onto_an_already_assigned_class(self):
        with self.assertRaises(LoadInputError):
            prepare_load(self.data, {**self.values, 'section': 'G9 Demo B'}, editing_id='LOAD-1')

    def test_edit_never_silently_changes_curriculum_frequency(self):
        with self.assertRaises(LoadInputError) as caught:
            prepare_load(self.data, {**self.values, 'n60': 3}, editing_id='LOAD-1')
        self.assertIn('curriculum', caught.exception.fields)
        self.assertEqual(2, self.data['requirements'][0]['n60'])

    def test_invalid_numbers_and_empty_fields_have_field_errors(self):
        for values, field in [({'n60': 1.5}, 'n60'), ({'n45': -1}, 'n45'), ({'n60': ''}, 'n60'),
                              ({'teacher': ''}, 'teacher'), ({'teacher': 'unknown'}, 'teacher'),
                              ({'section': ''}, 'section'), ({'n60': 0, 'n45': 0}, 'n60')]:
            with self.subTest(values=values), self.assertRaises(LoadInputError) as caught:
                prepare_load(self.data, {**self.values, **values}, editing_id='LOAD-1')
            self.assertIn(field, caught.exception.fields)

    def test_subject_must_match_the_section_grade(self):
        self.data['subjects'][0]['grade'] = 7
        self.data['loads'] = []
        with self.assertRaises(LoadInputError):
            prepare_load(self.data, {**self.values, 'section': 'G9 Demo B'})

    def test_overload_is_rejected_even_while_bell_inputs_are_incomplete(self):
        self.unassign_first()
        self.data['bells'] = []
        self.data['teachers'][0]['limit'] = 300
        with self.assertRaises(LoadInputError) as caught:
            prepare_load(self.data, self.values)
        self.assertIn('teacher', caught.exception.fields)
        self.assertIn('exceeds', caught.exception.fields['teacher'])

    def test_unrelated_incomplete_rows_do_not_prevent_valid_assignment_entry(self):
        self.unassign_first()
        self.data['bells'] = []
        self.data['loads'][-1]['section'] = ''
        proposed, _ = prepare_load(self.data, self.values)
        self.assertEqual('', proposed['loads'][-2]['section'])
        self.assertIsNone(validate(proposed)[1])  # remains blocked from generation

    def test_missing_or_malformed_edit_does_not_create_an_assignment(self):
        with self.assertRaises(ValueError):
            prepare_load(self.data, self.values, editing_id='does-not-exist')
        with self.assertRaises(ValueError):
            prepare_load(self.data, [], add_requirement=True)
        self.assertEqual(4, len(self.data['loads']))

    def test_strand_is_derived_from_subject_and_validated_against_section(self):
        self.data['sections'].append(dict(id='G11 ABM ICT', grade=11, strands='ABM, ICT'))
        self.data['subjects'].append(dict(id='Business', grade=11, kind='Strand', strand='ABM'))
        values = dict(teacher='T01', section='G11 ABM ICT', subject='Business', strand='', n60=1, n45=0)
        proposed, load = prepare_load(self.data, values, add_requirement=True)
        self.assertEqual('ABM', load['strand'])
        self.assertEqual('ABM', proposed['requirements'][-1]['strand'])
        with self.assertRaises(LoadInputError):
            prepare_load(self.data, {**values, 'strand': 'ICT'}, add_requirement=True)

    def test_saved_form_survives_reopening_and_conflicting_saves_are_rejected(self):
        self.unassign_first()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'manual.sqlite3'
            store = Store(path)
            saved = store.save(self.data, None)
            result = store.save_load(self.data, saved['revision'], self.values)
            reopened = Store(path).get_workspace(saved['id'])
            self.assertEqual(result['data'], reopened['data'])
            self.assertEqual(4, len(reopened['data']['loads']))
            with self.assertRaises(Conflict):
                store.save_load(self.data, saved['revision'], self.values)
            self.assertEqual(result['revision'], store.get_workspace(saved['id'])['revision'])

    def test_rejected_form_cannot_change_saved_working_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'manual.sqlite3')
            saved = store.save(self.data, None)
            with self.assertRaises(LoadInputError):
                store.save_load(self.data, saved['revision'], {**self.values, 'n60': 'bad'}, editing_id='LOAD-1')
            self.assertEqual(self.data, store.get_workspace(saved['id'])['data'])
            self.assertEqual(saved['revision'], store.get_workspace(saved['id'])['revision'])


if __name__ == '__main__':
    unittest.main()
