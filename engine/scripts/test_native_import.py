import struct
import unittest
from resolve_native_import import resolve_slot


class Image:
    base = 0
    def __init__(self):
        self.b = bytearray(256)
        struct.pack_into('<IIIII', self.b, 20, 80, 0, 0, 120, 160)
        struct.pack_into('<Q', self.b, 80, 140)
        self.b[120:125] = b'x.dll'
        self.b[142:146] = b'rand'
    def offset(self, address):
        if not 0 <= address < len(self.b):
            raise ValueError('Unmapped')
        return address
    def cstr(self, address):
        return bytes(self.b[address:self.b.index(0, address)]).decode('ascii')


class ImportTest(unittest.TestCase):
    def test_named_and_ordinal_slots(self):
        pe = Image()
        self.assertEqual(resolve_slot(pe, 20, 40, 160), {'library':'x.dll','name':'rand'})
        struct.pack_into('<Q', pe.b, 80, (1 << 63) | 42)
        self.assertEqual(resolve_slot(pe, 20, 40, 160), {'library':'x.dll','ordinal':42})
    def test_no_guess_from_bound_or_unaligned_slots(self):
        pe = Image()
        for slot in [161, 168, 8]:
            self.assertIsNone(resolve_slot(pe, 20, 40, slot))
        struct.pack_into('<I', pe.b, 20, 0)
        self.assertIsNone(resolve_slot(pe, 20, 40, 160))
    def test_rejects_missing_terminator_and_unmapped_thunk(self):
        pe = Image()
        with self.assertRaises(ValueError): resolve_slot(pe, 20, 20, 168)
        struct.pack_into('<I', pe.b, 20, 254)
        with self.assertRaises(ValueError): resolve_slot(pe, 20, 40, 160)


if __name__ == '__main__': unittest.main()
