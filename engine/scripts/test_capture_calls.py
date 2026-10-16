import unittest
from recover_capture_calls import capture_setups


def setup(extra=()):
    rows=[('call','0x100'), ('mov','rcx, rsi'),
          ('lea','r9, [rbp - 0x48]'), ('lea','r8, [rbp + 0xf0]'),
          ('lea','rdx, [rax + 0x7e8]'), *extra, ('call','0x200')]
    return [dict(address=i*4,size=4,mnemonic=m,operands=o) for i,(m,o) in enumerate(rows)]


class CaptureTests(unittest.TestCase):
    def test_preserves_argument_order_signed_location_and_capture_offset(self):
        self.assertEqual(capture_setups(setup(),0x100,0x200),
            [{'call':20,'captureOffset':0x7e8,'output':{'base':'rbp','offset':-0x48}}])
    def test_rejects_clobbers_calls_branches_and_unknown_arithmetic(self):
        for instruction in [('mov','edx, 0'),('mov','r9d, 0'),('mov','eax, 0'),
                            ('call','0x300'),('jmp','0x14'),('add','rdx, 8'),
                            ('mov','rbp, rax'),('mov','qword ptr [rax], rdx')]:
            with self.subTest(instruction=instruction):
                self.assertEqual(capture_setups(setup([instruction]),0x100,0x200),[])
    def test_rejects_discontinuous_trace_and_does_not_reuse_arguments(self):
        rows=setup();rows[-1]['address']+=4
        self.assertEqual(capture_setups(rows,0x100,0x200),[])
        rows=setup()+[dict(address=24,size=4,mnemonic='call',operands='0x200')]
        self.assertEqual(len(capture_setups(rows,0x100,0x200)),1)
        rows=setup()+[dict(address=24,size=4,mnemonic='jne',operands='0xc')]
        self.assertEqual(capture_setups(rows,0x100,0x200),[])
    def test_zero_offset_and_reordered_arguments(self):
        rows=setup();rows[2]['operands']='rdx, [rax]';rows[4]['operands']='r9, [rsp + 8]'
        self.assertEqual(capture_setups(rows,0x100,0x200)[0]['output'],{'base':'rsp','offset':8})
        self.assertEqual(capture_setups(rows,0x100,0x200)[0]['captureOffset'],0)


if __name__=='__main__':unittest.main()
