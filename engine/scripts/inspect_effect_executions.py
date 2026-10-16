"""Inspect exact recovered execution properties. Output contains private game data.

Select the active magnitude union arm; inactive fields are serialized too and
must never be mistaken for additional damage. This does not evaluate effects.
"""
import argparse
import json
from pathlib import Path


def compact(node):
    if not isinstance(node, dict) or 'Value' not in node:
        raise ValueError('Expected property node')
    value = node['Value']
    if not isinstance(value, list):
        return value
    if not value:
        return []
    if not all(isinstance(v, dict) and 'Name' in v for v in value):
        return value
    names = [v['Name'] for v in value]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate nested property names')
    return {v['Name']: compact(v) for v in value}


ARMS = {'ScalableFloat': 'ScalableFloatMagnitude',
        'AttributeBased': 'AttributeBasedMagnitude',
        'CustomCalculationClass': 'CustomMagnitude',
        'SetByCaller': 'SetByCallerMagnitude'}


def inspect(records):
    result = []
    for record in records:
        for prop in record['values']:
            if prop['name'] != 'Executions':
                continue
            if not prop['exact']:
                raise ValueError('Execution property has no exact span verification')
            executions = compact(prop['property'])
            if executions == []:
                continue
            for index, execution in executions.items():
                modifiers = execution.get('CalculationModifiers', [])
                selected = []
                for modifier in ([] if modifiers == [] else modifiers.values()):
                    magnitude = modifier['ModifierMagnitude']
                    mode = magnitude['MagnitudeCalculationType'].split('::')[-1]
                    if mode not in ARMS:
                        raise ValueError('Unknown magnitude calculation')
                    selected.append({
                        'capture': modifier['CapturedAttribute'],
                        'aggregatorType': modifier['AggregatorType'],
                        'operation': modifier['ModifierOp'],
                        'calculation': mode,
                        'magnitude': magnitude[ARMS[mode]],
                        'sourceTags': modifier.get('SourceTags'),
                        'targetTags': modifier.get('TargetTags'),
                    })
                result.append({'default': record['name'], 'execution': index,
                               'calculationClass': execution['CalculationClass'],
                               'modifiers': selected,
                               'conditionalEffects': execution.get('ConditionalGameplayEffects')})
    return {'executions': result, 'limits': [
        'Private output: object indices are local to the source asset and need resolution.',
        'Exact serialized properties do not verify native defaults, aggregation or runtime behavior.',
        'Only the selected magnitude arm is included. Null curve tables must not be resolved by row name alone.',
    ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recovered_properties', type=Path)
    parser.add_argument('private_output', type=Path)
    args = parser.parse_args()
    report = inspect(json.loads(args.recovered_properties.read_text(encoding='utf8')))
    args.private_output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(len(report['executions']), 'execution definitions inspected; output must stay private')
