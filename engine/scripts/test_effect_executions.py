import unittest
from inspect_effect_executions import compact, inspect


def prop(name, value):
    return {'Name': name, 'Value': value}


def fixture(mode='AttributeBased', exact=True):
    magnitude = prop('ModifierMagnitude', [
        prop('MagnitudeCalculationType', 'EGameplayEffectMagnitudeCalculation::' + mode),
        prop('AttributeBasedMagnitude', [prop('Coefficient', 0.4)]),
        prop('ScalableFloatMagnitude', 999),
        prop('CustomMagnitude', 888),
        prop('SetByCallerMagnitude', 'unused'),
    ])
    modifier = prop('0', [prop('CapturedAttribute', 'Damage'), prop('AggregatorType', 'Captured'),
                          prop('ModifierOp', 0), magnitude, prop('TargetTags', ['Minion'])])
    execution = prop('0', [prop('CalculationClass', -8), prop('CalculationModifiers', [modifier])])
    return [{'name': 'SyntheticDefault', 'values': [
        {'name': 'Executions', 'exact': exact, 'property': prop('Executions', [execution])}]}]


class EffectInspectionTest(unittest.TestCase):
    def test_only_active_union_arm_and_tag_conditions_survive(self):
        row = inspect(fixture())['executions'][0]['modifiers'][0]
        self.assertEqual(row['magnitude'], {'Coefficient': 0.4})
        self.assertEqual(row['targetTags'], ['Minion'])
        self.assertNotIn('999', str(row))
        self.assertEqual(inspect(fixture('ScalableFloat'))['executions'][0]['modifiers'][0]['magnitude'], 999)

    def test_unknown_union_or_unverified_span_fails(self):
        with self.assertRaises(ValueError): inspect(fixture('Unknown'))
        with self.assertRaises(ValueError): inspect(fixture(exact=False))

    def test_duplicate_names_fail_and_empty_array_is_not_a_mapping(self):
        with self.assertRaises(ValueError): compact(prop('x', [prop('same', 1), prop('same', 2)]))
        self.assertEqual(compact(prop('empty', [])), [])


if __name__ == '__main__': unittest.main()
