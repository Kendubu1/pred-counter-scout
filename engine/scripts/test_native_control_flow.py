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
 def test_rip_reference_uses_next_instruction_and_signed_displacement(self):
  r=trace(Bytes(bytes.fromhex('488d05f9fffffff30f100500000000c3')),0)
  refs=r['ripReferences']
  self.assertEqual([(x['target'],x['fileOffset']) for x in refs],[(0,0),(15,15)])
  self.assertEqual([x['addressOnly'] for x in refs],[True,False])
  self.assertEqual([x['operandSize'] for x in refs],[8,4])
 def test_unmapped_indirect_call_slot_is_not_a_resolved_target(self):
  r=trace(Bytes(bytes.fromhex('ff15ffffff7fc3')),0)
  self.assertIsNone(r['ripReferences'][0]['fileOffset'])
  self.assertIsNone(r['calls'][0]['target'])
  self.assertEqual(r['ripReferences'][0]['target'],0x80000005)
 def test_rejects_overlap_budget_and_unmapped_target(self):
  for data,limit in [('75ffc3',10),('9090c3',1),('eb7f',10)]:
   with self.subTest(data=data):
    with self.assertRaises(ValueError):trace(Bytes(bytes.fromhex(data)),0,limit)
if __name__=='__main__':unittest.main()
