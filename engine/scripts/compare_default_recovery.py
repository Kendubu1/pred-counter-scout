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
    retained = gained = ended = 0
    for name, record in old.items():
        def exact_values(r):
            rows = [v for v in r['values'] if v['exact']]
            mapped = {(v['name'], v['offset']): v for v in rows}
            if len(mapped) != len(rows):
                raise ValueError('Duplicate exact property identity')
            return mapped
        prior, current = exact_values(record), exact_values(new[name])
        for key, value in prior.items():
            candidate = current.get(key)
            if candidate is None or any(candidate[k] != value[k] for k in ('bytes', 'property')):
                raise ValueError('Previously exact property lost or changed')
        if record['ended'] and not new[name]['ended']:
            raise ValueError('Previously completed property stream regressed')
        retained += len(prior)
        gained += len(current) - len(prior)
        ended += int(new[name]['ended']) - int(record['ended'])
    return {'retainedExact': retained, 'gainedExact': gained, 'newlyEnded': ended}


def compare_roots(before, after):
    totals = {'files': 0, 'retainedExact': 0, 'gainedExact': 0, 'newlyEnded': 0}
    for file in sorted(after.rglob('*.uasset.json')):
        baseline = before / file.relative_to(after)
        result = compare_records(json.loads(baseline.read_text(encoding='utf8')),
                                 json.loads(file.read_text(encoding='utf8')))
        totals['files'] += 1
        for key, value in result.items():
            totals[key] += value
    if not totals['files']:
        raise ValueError('No comparison inputs')
    return totals


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('followup', type=Path)
    args = parser.parse_args()
    print(json.dumps(compare_roots(args.baseline, args.followup)))
