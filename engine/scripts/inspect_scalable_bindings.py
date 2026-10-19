"""Inspect packaged ScalableFloat bindings; output stays private, not evaluated math."""
import argparse
import json
import math
import re
from pathlib import Path
from inspect_effect_executions import compact
from select_blueprint_dependencies import import_package


def inspect(records, asset):
    result = []
    def walk(node, path, record, exact):
        if not isinstance(node, dict):
            return
        if node.get('StructType') == 'ScalableFloat':
            if exact is not True:
                raise ValueError('ScalableFloat has no exact span verification')
            value = compact(node)
            if value == []:
                value = {}
            missing = []
            coefficient = value.get('Value')
            # UAssetAPI emits some floats as decimal strings, including '+0'.
            if isinstance(coefficient, str) and re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', coefficient):
                coefficient = float(coefficient)
            if 'Value' not in value:
                missing.append('Value')
            elif type(coefficient) not in (int, float) or not math.isfinite(coefficient):
                raise ValueError('Invalid scalar coefficient')
            curve = value.get('Curve') or {}
            index, row = curve.get('CurveTable'), curve.get('RowName')
            for key in ['CurveTable', 'RowName']:
                if key not in curve:
                    missing.append('Curve.' + key)
            if ('CurveTable' in curve and type(index) is not int) or (row is not None and not isinstance(row, str)):
                raise ValueError('Invalid curve reference')
            registry_data = value.get('RegistryType') or {}
            registry = registry_data.get('Name')
            if 'Name' not in registry_data:
                missing.append('RegistryType.Name')
            if registry is not None and not isinstance(registry, str):
                raise ValueError('Invalid registry type')
            item = dict(default=record, propertyPath=path, coefficient=coefficient,
                        rowName=row, registryType=registry, curveTableIndex=index,
                        unresolvedFields=missing)
            if index is None:
                item['status'] = 'curve-reference-unresolved'
            elif index == 0:
                item['status'] = 'no-curve-table'
                # A nonempty row is not a lookup key without its table.
            elif index < 0:
                imports = asset.get('Imports', [])
                if -index > len(imports):
                    raise ValueError('Curve import out of range')
                entry = imports[-index-1]
                if entry.get('ClassName') != 'CurveTable':
                    raise ValueError('Curve reference is not a CurveTable import')
                item.update(status='imported-curve-binding', table=entry['ObjectName'],
                            package=import_package(imports, entry))
            else:
                exports = asset.get('Exports', [])
                if index > len(exports):
                    raise ValueError('Curve export out of range')
                # Resolve the index but do not infer class from an object's name.
                export = exports[index-1]
                item.update(status='local-table-type-unresolved', table=export['ObjectName'])
                class_index = export.get('ClassIndex')
                if class_index is not None:
                    if type(class_index) is not int:
                        raise ValueError('Invalid local export class index')
                    if class_index < 0:
                        imports = asset.get('Imports', [])
                        if -class_index > len(imports):
                            raise ValueError('Local export class import out of range')
                        class_entry = imports[-class_index-1]
                        package = import_package(imports, class_entry)
                        if (class_entry.get('ClassName') == 'Class'
                                and class_entry.get('ObjectName') == 'CurveTable'
                                and package == '/Script/Engine'):
                            item['status'] = 'local-curve-binding'
                    elif class_index > len(exports):
                        raise ValueError('Local export class reference out of range')
            if 'RegistryType.Name' in missing or registry not in (None, '', 'None'):
                item['registryResolution'] = 'unresolved'
            result.append(item)
            return
        for child in node.get('Value', []) if isinstance(node.get('Value'), list) else []:
            if isinstance(child, dict):
                walk(child, path + [child.get('Name')], record, exact)
    for record in records:
        for field in record['values']:
            walk(field['property'], [field['name']], record['name'], field.get('exact'))
    return {'bindings': result, 'limits': [
        'Serialized bindings only; no curve interpolation or runtime overrides evaluated.',
        'Missing fields do not imply zero, inherited defaults or complete recovery.',
        'Null tables are never matched to unrelated rows by row name.',
        'Local table types require the native Engine CurveTable class; other types and registry lookups remain unresolved.',
        'Traversal includes serialized inactive magnitude arms; presence does not prove runtime use.',
        'Paths, names and recovered bindings must remain private.',
    ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('properties', type=Path)
    parser.add_argument('asset', type=Path)
    parser.add_argument('private_output', type=Path)
    args = parser.parse_args()
    report = inspect(json.loads(args.properties.read_text(encoding='utf8')),
                     json.loads(args.asset.read_text(encoding='utf8')))
    args.private_output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(len(report['bindings']), 'bindings inspected; private output only')
