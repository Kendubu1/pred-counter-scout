import struct, unittest
from recover_native_enums import parse_enum

class SyntheticPE:
 def __init__(self):
  self.b=bytearray(512)
  for pos,text in [(300,b'Example'),(320,b'Example::A'),(350,b'Example::B')]:self.b[pos:pos+len(text)+1]=text+b'\0'
  struct.pack_into('<QQQIH',self.b,32,300,300,100,0x45,2)
  struct.pack_into('<QqQq',self.b,100,320,0,350,1)
 def offset(self,v):
  if not 0<=v<len(self.b):raise ValueError('unmapped')
  return v
 def cstr(self,v):
  o=self.offset(v);return bytes(self.b[o:self.b.index(0,o)]).decode('ascii')

class EnumTest(unittest.TestCase):
 def test_preserves_explicit_values(self):
  self.assertEqual(parse_enum(SyntheticPE(),32,'Example'),[{'name':'Example::A','value':0},{'name':'Example::B','value':1}])
 def test_rejects_duplicate_sparse_wrong_owner_and_flags(self):
  for off,fmt,value in [(124,'q',0),(124,'q',3),(56,'I',0),(48,'Q',999)]:
   with self.subTest(offset=off,value=value):
    pe=SyntheticPE();struct.pack_into('<'+fmt,pe.b,off,value)
    with self.assertRaises(ValueError):parse_enum(pe,32,'Example')
  with self.assertRaises(ValueError):parse_enum(SyntheticPE(),32,'Wrong')
 def test_rejects_truncated_table(self):
  pe=SyntheticPE();struct.pack_into('<Q',pe.b,48,510)
  with self.assertRaises(struct.error):parse_enum(pe,32,'Example')
if __name__=='__main__':unittest.main()
