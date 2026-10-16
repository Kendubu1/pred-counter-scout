import struct, unittest
from recover_native_structs import parse_descriptor, PE

class NativeStructTest(unittest.TestCase):
    def fixture(self):
        b=bytearray(512)
        # Synthetic addresses map directly to offsets.
        b[300:317]=b'DataRegistryType\0'
        b[350:355]=b'Name\0'
        struct.pack_into('<QQH',b,32,300,80,1)
        struct.pack_into('<Q',b,80,128)
        struct.pack_into('<Q',b,128,350)
        struct.pack_into('<II',b,152,20,0x45)
        return b
    def parse(self,b):
        def offset(v):
            if not 0 <= v < len(b): raise ValueError('Unmapped')
            return v
        return parse_descriptor(b,offset,lambda v:bytes(b[v:b.index(0,v)]).decode(),32)
    def test_ordered_metadata(self):
        r=self.parse(self.fixture())
        self.assertEqual(r['fields'],[{'name':'Name','kind':20,'recordOffset':128}])
    def test_wrong_count_type_flags_and_address_rejected(self):
        for off,fmt,value in [(48,'H',2),(152,'I',10),(156,'I',0),(40,'Q',999)]:
            with self.subTest(offset=off):
                b=self.fixture();struct.pack_into('<'+fmt,b,off,value)
                with self.assertRaises(ValueError):self.parse(b)
    def test_empty_struct_requires_null_array(self):
        b=self.fixture()
        name=b'PointerToUberGraphFrame\0'
        b[300:300+len(name)]=name
        struct.pack_into('<QH',b,40,0,0)
        self.assertEqual(self.parse(b)['fields'],[])
        struct.pack_into('<Q',b,40,80)
        with self.assertRaises(ValueError):self.parse(b)
    def test_reject_non_pe(self):
        with self.assertRaises(ValueError):PE(b'not executable')

if __name__=='__main__':unittest.main()
