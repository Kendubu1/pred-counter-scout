import copy
import unittest
from recover_native_tags import bind_tag_cache


class Image:
    def cstr(self, address):
        if address != 900:raise ValueError('Unmapped string')
        return 'GameplayEffect.BasicDamage'


def getter():
    ops=[('mov','rax, qword ptr [rip + 1]'),('mov','qword ptr [rbx], rax'),('mov','rax, rbx'),
         ('lea','rdx, [rip + 1]'),('lea','rcx, [rsp + 0x38]'),('call','0x100'),
         ('mov','r8b, 1'),('lea','rcx, [rip + 1]'),('mov','rdx, qword ptr [rax]'),
         ('mov','qword ptr [rsp + 0x30], rdx'),('lea','rdx, [rsp + 0x30]'),('call','0x200')]
    return {'instructions':[dict(address=i*4,size=4,mnemonic=m,operands=o) for i,(m,o) in enumerate(ops)],
            'ripReferences':[dict(address=0,target=800,addressOnly=False),
                             dict(address=12,target=900,addressOnly=True),
                             dict(address=28,target=800,addressOnly=True)]}


class TagTests(unittest.TestCase):
    def test_binds_literal_through_both_constructors_to_returned_cache(self):
        self.assertEqual(bind_tag_cache(Image(),getter(),0x100,0x200),
                         {'tag':'GameplayEffect.BasicDamage','cache':800,'nameSetup':12})
    def test_rejects_unrelated_cache_and_unmapped_literal(self):
        for index in (1,2):
            t=getter();t['ripReferences'][index]['target']=999
            with self.assertRaises(ValueError):bind_tag_cache(Image(),t,0x100,0x200)
    def test_rejects_wrong_constructor_stack_source_and_output(self):
        for index,operand in [(5,'0x999'),(11,'0x999'),(10,'rdx, [rsp + 0x28]'),(1,'qword ptr [rbx], rcx')]:
            t=getter();t['instructions'][index]['operands']=operand
            with self.assertRaises(ValueError):bind_tag_cache(Image(),t,0x100,0x200)
    def test_rejects_gap_intervening_branch_or_ambiguous_setup(self):
        for mode in ['gap','branch','duplicate']:
            t=getter()
            if mode=='gap':t['instructions'][6]['address']+=1
            elif mode=='branch':t['instructions'][6]['mnemonic']='jmp'
            else:
                extra=copy.deepcopy(t['instructions'][3:])
                for row in extra:row['address']+=100
                t['instructions']+=extra
                t['ripReferences'] += [dict(address=112,target=900,addressOnly=True),dict(address=128,target=800,addressOnly=True)]
            with self.assertRaises(ValueError):bind_tag_cache(Image(),t,0x100,0x200)


if __name__=='__main__':unittest.main()
