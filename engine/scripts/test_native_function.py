import struct
import unittest
from recover_native_function import parse_function, parse_function_links


class Image:
    def __init__(self):
        self.b=bytearray(512)
        struct.pack_into('<6QHHII',self.b,16,999,0,300,0,0,100,1,1,0x45,0)
        struct.pack_into('<Q',self.b,100,160)
        struct.pack_into('<Q',self.b,160,320)
        struct.pack_into('<II',self.b,184,0,0x45)
        struct.pack_into('<Q',self.b,216,888)
        self.b[300:306]=b'Query\0'
        self.b[320:332]=b'ReturnValue\0'
    def offset(self,a):
        if not 0<=a<len(self.b):raise ValueError('Unmapped')
        return a
    def cstr(self,a):return bytes(self.b[a:self.b.index(0,a)]).decode('ascii')


class FunctionTest(unittest.TestCase):
    def test_factory_precedes_name_and_descriptor_must_agree(self):
        pe=Image();struct.pack_into('<QQ',pe.b,400,250,300)
        result=parse_function_links(pe,400,1,999,lambda getter:16 if getter==250 else 0)
        self.assertEqual(result[0]['metadata']['name'],'Query')
        self.assertEqual(result[0]['getter'],250)
        # Native registration order must not silently associate a neighbor.
        struct.pack_into('<QQ',pe.b,400,300,250)
        with self.assertRaises(ValueError):parse_function_links(pe,400,1,999,lambda _:16)
    def test_links_reject_duplicate_names_wrong_owner_and_bounds(self):
        pe=Image();struct.pack_into('<4Q',pe.b,400,250,300,251,300)
        for address,count,owner in [(400,2,999),(400,1,998),(505,1,999),(400,0,999),(400,257,999)]:
            with self.assertRaises(ValueError):parse_function_links(pe,address,count,owner,lambda _:16)
    def test_links_reject_neighbor_descriptor(self):
        pe=Image();struct.pack_into('<QQ',pe.b,400,250,320)
        with self.assertRaisesRegex(ValueError,'name mismatch'):
            parse_function_links(pe,400,1,999,lambda _:16)
    def test_owned_byte_return_retains_enum_reference(self):
        result=parse_function(Image(),16,'Query',999)
        self.assertEqual(result['fields'],[{'name':'ReturnValue','kind':0,'record':160,'enumGetter':888}])
    def test_rejects_wrong_identity_and_malformed_metadata(self):
        for name,owner in [('Wrong',999),('Query',998)]:
            with self.assertRaises(ValueError):parse_function(Image(),16,name,owner)
        for offset,fmt,value in [(68,'I',0),(64,'H',257),(56,'Q',0),(100,'Q',500)]:
            pe=Image();struct.pack_into('<'+fmt,pe.b,offset,value)
            with self.assertRaises(ValueError):parse_function(pe,16,'Query',999)
    def test_duplicate_fields_rejected_and_plain_byte_not_assigned_enum(self):
        pe=Image();struct.pack_into('<Q',pe.b,216,0)
        self.assertIsNone(parse_function(pe,16,'Query',999)['fields'][0]['enumGetter'])
        struct.pack_into('<H',pe.b,64,2)
        struct.pack_into('<Q',pe.b,108,160)
        with self.assertRaises(ValueError):parse_function(pe,16,'Query',999)


if __name__=='__main__':unittest.main()
