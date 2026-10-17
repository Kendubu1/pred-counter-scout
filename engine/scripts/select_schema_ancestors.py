"""Resolve Blueprint superclass schemas from existing decoded assets, privately.

This follows class inheritance only, not runtime dependencies or default values.
Native boundaries remain explicit: reaching one does not recover its schema.
"""
import argparse
import json
from pathlib import Path

from select_blueprint_dependencies import blueprint_path, import_package


def classes(asset):
    exports = asset.get('Exports', [])
    rows = [(i + 1, e) for i, e in enumerate(exports)
            if e.get('$type', '').split(',')[0].endswith('.ClassExport')]
    names = [e['ObjectName'] for _, e in rows]
    if len(names) != len(set(names)):
        raise ValueError('Ambiguous exported class name')
    return dict(rows)


def resolve(asset, decoded_roots):
    """Roots are explicit highest-to-lowest priority overlays, like the reader."""
    roots = [Path(root) for root in decoded_roots]
    result, visiting, visited, cache = [], set(), set(), {}

    def walk(data, index, source):
        exported = classes(data)
        if index not in exported:
            raise ValueError('Superclass does not reference a class export')
        cls = exported[index]
        key = (source, cls['ObjectName'])
        if key in visiting:
            raise ValueError('Cyclic Blueprint superclass graph')
        if key in visited:
            return
        visiting.add(key)
        parent = cls.get('SuperIndex', 0)
        if type(parent) is not int:
            raise ValueError('Invalid superclass index')
        row = {'source': source, 'class': cls['ObjectName']}
        if parent == 0:
            row['status'] = 'no-super-reference'
        elif parent > 0:
            row['status'] = 'local-parent'
            if parent not in exported:
                raise ValueError('Invalid local superclass')
            row['parentClass'] = exported[parent]['ObjectName']
            walk(data, parent, source)
        else:
            imports = data.get('Imports', [])
            if -parent > len(imports):
                raise ValueError('Invalid imported superclass')
            entry = imports[-parent - 1]
            row['parentClass'] = entry['ObjectName']
            if entry.get('ClassName') == 'Class':
                package = import_package(imports, entry)
                if not package.startswith('/Script/'):
                    raise ValueError('Native superclass must reference a script package')
                row['parentPackage'] = package
                row['status'] = 'native-schema-unresolved'
            elif entry.get('ClassName') == 'BlueprintGeneratedClass':
                # Resolve the indexed import, not unrelated classes sharing its name.
                package = blueprint_path(import_package(imports, entry))
                if package is None:
                    raise ValueError('Unsupported Blueprint parent package')
                row['parentPackage'] = package
                filename = next((root / (package + '.json') for root in roots
                                 if (root / (package + '.json')).is_file()), None)
                if filename is None:
                    row['status'] = 'missing-decoded-parent'
                else:
                    if package not in cache:
                        cache[package] = json.loads(filename.read_text(encoding='utf8'))
                    parent_data = cache[package]
                    candidates = [i for i, e in classes(parent_data).items()
                                  if e['ObjectName'] == entry['ObjectName']]
                    if len(candidates) != 1:
                        raise ValueError('Decoded parent does not export expected class')
                    row.update(status='decoded-parent-found', schemaFile=str(filename))
                    walk(parent_data, candidates[0], package)
            else:
                raise ValueError('Unsupported superclass import type')
        result.append(row)
        visiting.remove(key)
        visited.add(key)

    initial = classes(asset)
    if not initial:
        raise ValueError('Input has no decoded class exports')
    for index in initial:
        walk(asset, index, '<input>')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_json', type=Path)
    parser.add_argument('private_output', type=Path)
    parser.add_argument('--decoded-root', type=Path, action='append', required=True)
    args = parser.parse_args()
    rows = resolve(json.loads(args.asset_json.read_text(encoding='utf8')), args.decoded_root)
    args.private_output.write_text(json.dumps({'ancestry': rows, 'limits': [
        'Class inheritance only; imported runtime dependencies are not traversed.',
        'Decoded class presence does not verify schema completeness or defaults.',
        'Native boundaries and missing parents remain unresolved.',
        'Decoded roots use explicit first-match overlay priority.',
    ]}, indent=2) + '\n', encoding='utf8')
    print(f'{len(rows)} ancestry records; paths retained in private output')
