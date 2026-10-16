import struct, unittest
from recover_native_dependencies import recover, constructor_params

class FakePE:
 def __init__(self):
  self.b=bytearray(1024)
 def offset(self,va):
  if not 0<=va<len(self.b):raise ValueError('Unmapped')
  return va
 def address(self,off):return self.offset(off)
 def cstr(self,va):return self.b[va:self.b.index(0,va)].decode('ascii')

def fixture():
 p=FakePE();p.b[700:706]=b'Shape\0';p.b[710:716]=b'Count\0'
 struct.pack_into('<QQH',p.b,124,700,200,1)
 struct.pack_into('<Q',p.b,200,300);struct.pack_into('<Q',p.b,300,710)
 struct.pack_into('<II',p.b,324,3,0x45)
 return p

class DependencyTest(unittest.TestCase):
 def test_scalar_layout_and_repeat_root(self):
  r=recover(fixture(),[100,100]);self.assertEqual(list(r),['Shape'])
  self.assertEqual(r['Shape']['fields'][0]['kind'],3)
 def test_reject_flags_and_count(self):
  for offset,fmt,value in [(328,'<I',0),(140,'<H',257)]:
   p=fixture();struct.pack_into(fmt,p.b,offset,value)
   with self.assertRaises(ValueError):recover(p,[100])
 def test_missing_constructor_is_not_an_address(self):
  p=fixture();struct.pack_into('<Q',p.b,356,400)
  with self.assertRaises(ValueError):constructor_params(p,300)
 def test_empty_layout_requires_null_array(self):
  p=fixture();struct.pack_into('<H',p.b,140,0)
  with self.assertRaises(ValueError):recover(p,[100])
if __name__=='__main__':unittest.main()
