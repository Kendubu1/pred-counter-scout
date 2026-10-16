"""Private integration gate for the three reviewed projectile default records.

Requires exact property spans, inherited Actor properties and the recovered
Scattershot collision flags. Does not certify whole assets or gameplay behavior.
"""
import argparse
import json
from pathlib import Path


def verify(root):
    expected = {'Proj_Default': 13, 'Proj_Item_OnixianQuiver': 17, 'Proj_Item_Scattershot': 29}
    total = 0
    for asset, count in expected.items():
        files = list(root.rglob(asset + '.uasset.json'))
        if len(files) != 1:
            raise ValueError('Missing or ambiguous projectile input')
        records = json.loads(files[0].read_text(encoding='utf8'))
        if len(records) != 1 or not records[0]['ended']:
            raise ValueError('Incomplete projectile property stream')
        values = records[0]['values']
        if len(values) != count or not all(v['exact'] for v in values):
            raise ValueError('Projectile property span regression')
        by_name = {v['name']: v['property'] for v in values}
        if len(by_name) != len(values) or 'RootComponent' not in by_name:
            raise ValueError('Inherited Actor field missing or duplicate fields')
        if asset == 'Proj_Item_Scattershot':
            for field in ['bOnlyCollideWithLockOnActor', 'bDestroyWhenLockOnActorDies', 'bDestroyOnHitActor']:
                if by_name.get(field, {}).get('Value') is not True:
                    raise ValueError('Reviewed collision flag changed')
            timer = by_name['Timer_Handle']['Value']
            if len(timer) != 1 or 'UInt64PropertyData' not in timer[0]['$type']:
                raise ValueError('TimerHandle schema regression')
        total += len(values)
    return {'records': 3, 'exactPropertySpans': total, 'wholeAssetsCertified': 0}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('private_properties', type=Path)
    print(json.dumps(verify(p.parse_args().private_properties)))
