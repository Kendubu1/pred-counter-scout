import copy
import unittest
from compare_default_recovery import compare_records


class RecoveryComparisonTest(unittest.TestCase):
    def setUp(self):
        self.before = [{'name': 'Synthetic', 'ended': False, 'values': [
            {'name': 'A', 'offset': 0, 'bytes': 4, 'exact': True, 'property': {'Value': 7}}]}]

    def test_schema_expansion_preserves_exact_values(self):
        after = copy.deepcopy(self.before)
        after[0]['ended'] = True
        after[0]['values'].append({'name': 'B', 'offset': 4, 'bytes': 0, 'exact': True, 'property': {'Value': 0}})
        self.assertEqual(compare_records(self.before, after), {'retainedExact': 1, 'gainedExact': 1, 'newlyEnded': 1})

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


if __name__ == '__main__':
    unittest.main()
