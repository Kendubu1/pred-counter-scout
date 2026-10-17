import json
import tempfile
import unittest
from pathlib import Path

from select_schema_ancestors import resolve


def cls(name, parent):
    return {'$type': 'UAssetAPI.ExportTypes.ClassExport, UAssetAPI',
            'ObjectName': name, 'SuperIndex': parent}


def asset(name='Child_C', parent='Parent_C', package='/Game/Effects/Parent'):
    return {'Exports': [cls(name, -1)], 'Imports': [
        {'ClassName': 'BlueprintGeneratedClass', 'ObjectName': parent, 'OuterIndex': -2},
        {'ClassName': 'Package', 'ObjectName': package, 'OuterIndex': 0},
    ]}


def write(root, name, data):
    p = Path(root) / ('Predecessor/Content/Effects/' + name + '.uasset.json')
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data), encoding='utf8')


class SchemaAncestors(unittest.TestCase):
    def test_resolves_multilevel_chain_and_keeps_native_boundary_unresolved(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, 'Parent', asset('Parent_C', 'Base_C', '/Game/Effects/Base'))
            native = asset('Base_C', 'GameplayEffect', '/Script/GameplayAbilities')
            native['Imports'][0]['ClassName'] = 'Class'
            write(root, 'Base', native)
            rows = resolve(asset(), [root])
            self.assertEqual([r['class'] for r in rows], ['Base_C', 'Parent_C', 'Child_C'])
            self.assertEqual([r['status'] for r in rows],
                             ['native-schema-unresolved', 'decoded-parent-found', 'decoded-parent-found'])

    def test_missing_file_is_not_schema_success(self):
        self.assertEqual(resolve(asset(), [])[0]['status'], 'missing-decoded-parent')

    def test_local_parent_and_shared_parent_are_not_false_cycles(self):
        a = {'Imports': [], 'Exports': [cls('Parent_C', 0), cls('A_C', 1), cls('B_C', 1)]}
        rows = resolve(a, [])
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['status'], 'no-super-reference')

    def test_local_and_cross_package_cycles_fail(self):
        with self.assertRaisesRegex(ValueError, 'Cyclic'):
            resolve({'Imports': [], 'Exports': [cls('A', 2), cls('B', 1)]}, [])
        with tempfile.TemporaryDirectory() as root:
            write(root, 'Parent', asset('Parent_C'))
            with self.assertRaisesRegex(ValueError, 'Cyclic'):
                resolve(asset(), [root])

    def test_wrong_export_and_invalid_reference_fail(self):
        with tempfile.TemporaryDirectory() as root:
            write(root, 'Parent', {'Exports': [cls('Wrong_C', 0)], 'Imports': []})
            with self.assertRaisesRegex(ValueError, 'expected class'):
                resolve(asset(), [root])
        for index in [-100, 100, True]:
            a = asset(); a['Exports'][0]['SuperIndex'] = index
            with self.assertRaises(ValueError):
                resolve(a, [])

    def test_overlay_priority_is_explicit(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            write(first, 'Parent', {'Exports': [cls('Parent_C', 0)], 'Imports': []})
            write(second, 'Parent', asset('Parent_C'))  # lower-priority cyclic variant
            rows = resolve(asset(), [first, second])
            self.assertEqual(rows[0]['status'], 'no-super-reference')
            self.assertTrue(rows[-1]['schemaFile'].startswith(first))

    def test_native_label_requires_script_package_and_valid_outer_chain(self):
        for package in ['/Game/Effects/Parent', '/Script/Engine']:
            a = asset(package=package); a['Imports'][0]['ClassName'] = 'Class'
            if package.startswith('/Script/'):
                a['Imports'][1]['OuterIndex'] = -1
            with self.assertRaises(ValueError):
                resolve(a, [])

    def test_same_name_unrelated_import_does_not_override_indexed_parent(self):
        a = asset()
        a['Imports'] += [
            {'ClassName': 'BlueprintGeneratedClass', 'ObjectName': 'Parent_C', 'OuterIndex': -4},
            {'ClassName': 'Package', 'ObjectName': '/Game/Elsewhere/Parent', 'OuterIndex': 0},
        ]
        with tempfile.TemporaryDirectory() as root:
            write(root, 'Parent', {'Exports': [cls('Parent_C', 0)], 'Imports': []})
            rows = resolve(a, [root])
            self.assertEqual(rows[-1]['parentPackage'], 'Predecessor/Content/Effects/Parent.uasset')

    def test_no_classes_is_not_a_successful_empty_closure(self):
        with self.assertRaisesRegex(ValueError, 'no decoded class'):
            resolve({'Exports': [], 'Imports': []}, [])


if __name__ == '__main__':
    unittest.main()
