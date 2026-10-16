import unittest
from trace_native_control_flow import trace
class Bytes:
 def __init__(self,b):self.b=b
 def offset(self,address):
  if not 0<=address<len(self.b):raise ValueError('Unmapped address')
  return address
class TraceTest(unittest.TestCase):
 def test_conditional_branch_beyond_first_return(self):
  r=trace(Bytes(bytes.fromhex('7501c390c3')),0)
  self.assertEqual([x['address'] for x in r['instructions']],[0,2,3,4])
 def test_calls_are_not_followed_and_indirect_is_explicit(self):
  r=trace(Bytes(bytes.fromhex('e8ffffff7fffe0')),0)
  self.assertEqual(len(r['instructions']),2)
  self.assertIsNotNone(r['calls'][0]['target'])
  self.assertEqual(r['unresolvedBranches'][0]['reason'],'indirect branch')
 def test_loop_terminates_without_inventing_exit(self):
  r=trace(Bytes(bytes.fromhex('ebfe')),0)
  self.assertEqual(len(r['instructions']),1)
 def test_rejects_overlap_budget_and_unmapped_target(self):
  for data,limit in [('75ffc3',10),('9090c3',1),('eb7f',10)]:
   with self.subTest(data=data):
    with self.assertRaises(ValueError):trace(Bytes(bytes.fromhex(data)),0,limit)
if __name__=='__main__':unittest.main()
