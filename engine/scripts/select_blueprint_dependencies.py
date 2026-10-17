"""Select imported Blueprint classes omitted by filename-prefix recovery.

Writes private dependency paths, not proof that a dependency executes at runtime.
Only packaged /Game classes are selected; native /Script classes are excluded.
"""
import argparse
import json
from pathlib import Path


def select(asset, inventory, decoded_root=None):
    imports = asset['Imports']
    result = {}
    for entry in imports:
        if entry.get('ClassName') != 'BlueprintGeneratedClass':
            continue
        current, seen = entry, set()
        while current.get('OuterIndex', 0):
            index = current['OuterIndex']
            if not isinstance(index, int) or index >= 0 or -index > len(imports) or index in seen:
                raise ValueError('Invalid or cyclic Blueprint import outer chain')
            seen.add(index)
            current = imports[-index - 1]
        package = current['ObjectName']
        if not package.startswith('/Game/'):
            continue
        relative = package[len('/Game/'):]
        if any(part in ('', '.', '..') for part in relative.split('/')) or '\\' in relative:
            raise ValueError('Invalid package path')
        path = 'Predecessor/Content/' + relative + '.uasset'
        row = result.setdefault(path, {'path': path, 'classes': [], 'packaged': path in inventory})
        row['classes'].append(entry['ObjectName'])
        if decoded_root is not None:
            row['decoded'] = (Path(decoded_root) / (path + '.json')).is_file()
    return sorted(result.values(), key=lambda row: row['path'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_json', type=Path)
    parser.add_argument('package_inventory', type=Path)
    parser.add_argument('private_output', type=Path)
    parser.add_argument('--decoded-root', type=Path)
    args = parser.parse_args()
    rows = select(json.loads(args.asset_json.read_text(encoding='utf8')),
                  set(args.package_inventory.read_text(encoding='utf-8-sig').splitlines()),
                  args.decoded_root)
    args.private_output.write_text(json.dumps({'dependencies': rows, 'limits': [
        'Import presence does not prove runtime use; review the referring instruction or property.',
        'Decoded-file presence does not establish complete properties or gameplay behavior.',
        'This selects direct imported Blueprint classes, not textures, native classes or recursive closure.',
    ]}, indent=2) + '\n', encoding='utf8')
    print(f'{len(rows)} Blueprint dependencies selected; paths retained in private output')
