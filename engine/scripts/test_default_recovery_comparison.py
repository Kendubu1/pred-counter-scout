import copy
import unittest
from compare_default_recovery import compare_records, compare_roots, selected_struct_count
import json
import tempfile
from pathlib import Path


class RecoveryComparisonTest(unittest.TestCase):
    def setUp(self):
        self.before = [{'name': 'Synthetic', 'ended': False, 'values': [
            {'name': 'A', 'offset': 0, 'bytes': 4, 'exact': True, 'property': {'Value': 7}}]}]

    def test_schema_expansion_preserves_exact_values(self):
        after = copy.deepcopy(self.before)
        after[0]['ended'] = True
        after[0]['values'].append({'name': 'B', 'offset': 4, 'bytes': 0, 'exact': True, 'property': {'Value': 0}})
        self.assertEqual(compare_records(self.before, after), {'retainedExact': 1, 'gainedExact': 1, 'newlyEnded': 1,
                         'resolvedUnverifiedSpans': 0, 'newExactSpans': 1})

    def test_existing_unverified_span_is_not_a_new_property(self):
        before = copy.deepcopy(self.before)
        before[0]['values'][0]['exact'] = False
        result = compare_records(before, self.before)
        self.assertEqual(result['gainedExact'], 1)
        self.assertEqual(result['resolvedUnverifiedSpans'], 1)
        self.assertEqual(result['newExactSpans'], 0)
        changed_span = copy.deepcopy(self.before)
        changed_span[0]['values'][0]['bytes'] = 8
        self.assertEqual(compare_records(before, changed_span)['resolvedUnverifiedSpans'], 0)
        duplicate = copy.deepcopy(before)
        duplicate[0]['values'].append(copy.deepcopy(self.before[0]['values'][0]))
        with self.assertRaises(ValueError):
            compare_records(duplicate, self.before)

    def test_rejects_lost_or_reinterpreted_values(self):
        for key, value in [('exact', False), ('offset', 1), ('bytes', 8), ('property', {'Value': 8})]:
            after = copy.deepcopy(self.before)
            after[0]['values'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                compare_records(self.before, after)

    def test_rejects_duplicate_records_and_stream_regression(self):
        with self.assertRaises(ValueError):
            compare_records(self.before, self.before * 2)
        before = copy.deepcopy(self.before)
        before[0]['ended'] = True
        with self.assertRaises(ValueError):
            compare_records(before, self.before)

    def test_selected_struct_must_be_exact_and_present(self):
        rows = copy.deepcopy(self.before)
        rows[0]['values'][0]['property']['StructType'] = 'SyntheticStruct'
        self.assertEqual(selected_struct_count(rows, 'SyntheticStruct'), 1)
        rows[0]['values'][0]['exact'] = False
        with self.assertRaises(ValueError):
            selected_struct_count(rows, 'SyntheticStruct')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'sample.uasset.json').write_text(json.dumps(self.before), encoding='utf8')
            with self.assertRaises(ValueError):
                compare_roots(root, root, 'AbsentStruct')


if __name__ == '__main__':
    unittest.main()
