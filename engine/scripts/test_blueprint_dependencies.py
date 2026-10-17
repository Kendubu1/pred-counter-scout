import tempfile
import unittest
from pathlib import Path
from select_blueprint_dependencies import select


def asset(outer=-2, package='/Game/Hero/Drone'):
    return {'Imports': [
        {'ClassName': 'BlueprintGeneratedClass', 'ObjectName': 'Drone_C', 'OuterIndex': outer},
        {'ClassName': 'Package', 'ObjectName': package, 'OuterIndex': 0},
        {'ClassName': 'Texture2D', 'ObjectName': 'Icon', 'OuterIndex': -2},
    ]}


class BlueprintDependencies(unittest.TestCase):
    def test_selects_packaged_class_without_prefix_assumption(self):
        path = 'Predecessor/Content/Hero/Drone.uasset'
        self.assertEqual(select(asset(), {path}), [dict(path=path, classes=['Drone_C'], packaged=True)])

    def test_absent_package_is_not_silently_selected_as_available(self):
        self.assertFalse(select(asset(), set())[0]['packaged'])

    def test_native_package_excluded(self):
        self.assertEqual(select(asset(package='/Script/Engine'), set()), [])

    def test_rejects_bad_outer_graph_and_traversal(self):
        for outer in [-1, -9, 2]:
            with self.assertRaises(ValueError):
                select(asset(outer=outer), set())
        with self.assertRaises(ValueError):
            select(asset(package='/Game/../escape'), set())

    def test_decoded_presence_and_duplicate_class_package(self):
        data = asset()
        data['Imports'].append(dict(data['Imports'][0], ObjectName='DroneChild_C'))
        with tempfile.TemporaryDirectory() as root:
            self.assertFalse(select(data, set(), root)[0]['decoded'])
            path = Path(root) / 'Predecessor/Content/Hero/Drone.uasset.json'
            path.parent.mkdir(parents=True)
            path.write_text('{}')
            row = select(data, set(), root)[0]
            self.assertTrue(row['decoded'])
            self.assertEqual(row['classes'], ['Drone_C', 'DroneChild_C'])


if __name__ == '__main__':
    unittest.main()
