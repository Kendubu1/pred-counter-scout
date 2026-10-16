"""Compare private default-recovery passes without exporting property contents.

Every previously exact property must retain its identity, span and decoded value.
This guards schema expansion; it does not verify native gameplay behavior.
"""
import argparse
import json
from pathlib import Path


def compare_records(before, after):
    old = {r['name']: r for r in before}
    new = {r['name']: r for r in after}
    if len(old) != len(before) or len(new) != len(after) or old.keys() != new.keys():
        raise ValueError('Default record identities changed')
    retained = gained = ended = resolved = 0
    for name, record in old.items():
        def exact_values(r):
            identities = [(v['name'], v['offset']) for v in r['values']]
            if len(set(identities)) != len(identities):
                raise ValueError('Duplicate property identity')
            rows = [v for v in r['values'] if v['exact']]
            mapped = {(v['name'], v['offset']): v for v in rows}
            if len(mapped) != len(rows):
                raise ValueError('Duplicate exact property identity')
            return mapped
        prior, current = exact_values(record), exact_values(new[name])
        previously_unverified = {(v['name'], v['offset']): v for v in record['values'] if not v['exact']}
        for key, value in prior.items():
            candidate = current.get(key)
            if candidate is None or any(candidate[k] != value[k] for k in ('bytes', 'property')):
                raise ValueError('Previously exact property lost or changed')
        if record['ended'] and not new[name]['ended']:
            raise ValueError('Previously completed property stream regressed')
        retained += len(prior)
        gained += len(current) - len(prior)
        resolved += sum(key in current and current[key]['bytes'] == value['bytes']
                        for key, value in previously_unverified.items())
        ended += int(new[name]['ended']) - int(record['ended'])
    return {'retainedExact': retained, 'gainedExact': gained, 'newlyEnded': ended,
            'resolvedUnverifiedSpans': resolved, 'newExactSpans': gained - resolved}


def selected_struct_count(records, struct_name):
    values = [v for r in records for v in r['values']
              if v.get('property', {}).get('StructType') == struct_name]
    if any(not v['exact'] for v in values):
        raise ValueError('Selected struct contains an unverified property span')
    return len(values)


def compare_roots(before, after, require_struct=None):
    totals = {'files': 0, 'retainedExact': 0, 'gainedExact': 0, 'newlyEnded': 0,
              'resolvedUnverifiedSpans': 0, 'newExactSpans': 0}
    selected = 0
    for file in sorted(after.rglob('*.uasset.json')):
        baseline = before / file.relative_to(after)
        records = json.loads(file.read_text(encoding='utf8'))
        result = compare_records(json.loads(baseline.read_text(encoding='utf8')),
                                 records)
        if require_struct:
            selected += selected_struct_count(records, require_struct)
        totals['files'] += 1
        for key, value in result.items():
            totals[key] += value
    if not totals['files']:
        raise ValueError('No comparison inputs')
    if require_struct:
        if not selected:
            raise ValueError('Required struct absent from follow-up')
        totals['exactSelectedStructProperties'] = selected
    return totals


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('followup', type=Path)
    parser.add_argument('--require-struct', help='Require exact top-level spans of this struct type')
    args = parser.parse_args()
    print(json.dumps(compare_roots(args.baseline, args.followup, args.require_struct)))
