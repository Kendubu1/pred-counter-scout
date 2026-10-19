import unittest
from inspect_scalable_bindings import inspect


def prop(name, value): return {'Name':name,'Value':value}
def fixture(index=-1, row='Damage', coefficient=1, registry=None, exact=True):
    scalar=prop('Scalar', [prop('Value',coefficient), prop('Curve',[
        prop('CurveTable',index),prop('RowName',row)]),prop('RegistryType',[prop('Name',registry)])])
    scalar['StructType']='ScalableFloat'
    return [{'name':'Default','values':[{'name':'Outer','exact':exact,'property':prop('Outer',[scalar])}]}]

asset={'Imports':[{'ObjectName':'Stats','ClassName':'CurveTable','OuterIndex':-2},
                  {'ObjectName':'/Game/Stats','ClassName':'Package','OuterIndex':0}],
       'Exports':[{'ObjectName':'LocalStats'}]}

class ScalarBindings(unittest.TestCase):
    def test_import_binding_and_nested_path(self):
        row=inspect(fixture(),asset)['bindings'][0]
        self.assertEqual(row['package'],'/Game/Stats')
        self.assertEqual(row['propertyPath'],['Outer','Scalar'])
        self.assertEqual(row['coefficient'],1)
        self.assertEqual(row['status'],'imported-curve-binding')
    def test_null_table_does_not_resolve_by_row(self):
        row=inspect(fixture(index=0),asset)['bindings'][0]
        self.assertEqual(row['status'],'no-curve-table')
        self.assertNotIn('table',row)
    def test_local_and_registry_remain_unresolved(self):
        row=inspect(fixture(index=1,registry='Runtime'),asset)['bindings'][0]
        self.assertEqual(row['status'],'local-table-type-unresolved')
        self.assertEqual(row['registryResolution'],'unresolved')
    def test_zero_coefficient_retained_and_absence_not_default(self):
        self.assertEqual(inspect(fixture(coefficient=0),asset)['bindings'][0]['coefficient'],0)
        self.assertEqual(inspect([],asset)['bindings'],[])
    def test_local_native_curve_class_resolved_without_name_guess(self):
        local={'Imports':[{'ObjectName':'CurveTable','ClassName':'Class','OuterIndex':-2},
                          {'ObjectName':'/Script/Engine','ClassName':'Package','OuterIndex':0}],
               'Exports':[{'ObjectName':'UnhelpfulName','ClassIndex':-1}]}
        self.assertEqual(inspect(fixture(index=1),local)['bindings'][0]['status'],'local-curve-binding')
        for package, name in [('/Script/Other','CurveTable'),('/Script/Engine','Texture')]:
            local['Imports'][0]['ObjectName']=name
            local['Imports'][1]['ObjectName']=package
            self.assertEqual(inspect(fixture(index=1),local)['bindings'][0]['status'],'local-table-type-unresolved')
    def test_invalid_local_class_reference_fails(self):
        for index in [True,-4,2]:
            with self.assertRaises(ValueError):
                inspect(fixture(index=1),{'Imports':asset['Imports'],'Exports':[{'ObjectName':'CurveTable','ClassIndex':index}]})
    def test_serialized_decimal_strings_and_missing_fields(self):
        for value, expected in [('+0',0),('-0.25',-.25),('2e-3',.002)]:
            self.assertEqual(inspect(fixture(coefficient=value),asset)['bindings'][0]['coefficient'],expected)
        for value in ['NaN','Infinity','1e999','false','1+2']:
            with self.assertRaises(ValueError): inspect(fixture(coefficient=value),asset)
        records=fixture()
        records[0]['values'][0]['property']['Value'][0]['Value']=[]
        row=inspect(records,asset)['bindings'][0]
        self.assertIsNone(row['coefficient'])
        self.assertEqual(row['status'],'curve-reference-unresolved')
        self.assertEqual(row['registryResolution'],'unresolved')
        self.assertIn('Value',row['unresolvedFields'])
    def test_invalid_spans_numbers_and_indices_fail(self):
        for kw in [dict(exact=False),dict(coefficient=float('nan')),dict(coefficient=True),
                   dict(index=True),dict(index=-3),dict(index=2)]:
            with self.assertRaises(ValueError): inspect(fixture(**kw),asset)
    def test_wrong_import_kind_and_cyclic_outer_fail(self):
        for entry in [{'ObjectName':'Stats','ClassName':'Texture','OuterIndex':-2},
                      {'ObjectName':'Stats','ClassName':'CurveTable','OuterIndex':-1}]:
            with self.assertRaises(ValueError): inspect(fixture(),{'Imports':[entry]+asset['Imports'][1:]})

if __name__=='__main__': unittest.main()
