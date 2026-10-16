import unittest
from recover_native_class import fold_fields

class NativeClassTest(unittest.TestCase):
 def test_helpers_do_not_shift_following_field(self):
  records=[{'name':'Items','kind':17},{'name':'Items','kind':22},{'name':'UnderlyingType','kind':0},{'name':'Mode','kind':30},{'name':'Lookup','kind':82},{'name':'Lookup_Key','kind':25},{'name':'Lookup','kind':23},{'name':'Damage','kind':10}]
  fields=fold_fields(records)
  self.assertEqual([f['name'] for f in fields],['Items','Mode','Lookup','Damage'])
  self.assertEqual(fields[2]['key']['name'],'Lookup_Key')
  self.assertEqual(fields[2]['value']['name'],'Lookup')
 def test_rejects_missing_wrong_or_orphan_helpers(self):
  for records in [[{'name':'A','kind':22}],[{'name':'X','kind':0},{'name':'Mode','kind':30}],[{'name':'UnderlyingType','kind':0}],[{'name':'A','kind':10},{'name':'A','kind':10}]]:
   with self.subTest(records=records):
    with self.assertRaises(ValueError):fold_fields(records)
 def test_optional_enums_preserve_inner_type_and_next_field(self):
  fields=fold_fields([{'name':'UnderlyingType','kind':0},{'name':'Modes','kind':30},
                      {'name':'Modes','kind':33},{'name':'After','kind':10}])
  self.assertEqual([f['name'] for f in fields],['Modes','After'])
  self.assertEqual(fields[0]['inner']['kind'],30)
  self.assertEqual(fields[0]['inner']['inner']['kind'],0)
  for records in [[{'name':'Modes','kind':33}],
                  [{'name':'Wrong','kind':0},{'name':'Modes','kind':33}]]:
   with self.assertRaises(ValueError):fold_fields(records)
if __name__=='__main__':unittest.main()
