"""Bounded static native control-flow trace. Generated instructions stay PRIVATE.
Install capstone in a private analysis environment. Calls are recorded, not followed.
"""
import argparse, hashlib, json, mmap
from pathlib import Path
from capstone import Cs, CS_ARCH_X86, CS_MODE_64, CS_GRP_JUMP, CS_GRP_RET, CS_GRP_CALL
from capstone.x86 import X86_OP_IMM, X86_OP_MEM, X86_REG_RIP
from recover_native_structs import PE

def trace(pe, entry, limit=3000):
    if limit<1:raise ValueError('Positive instruction limit required')
    md=Cs(CS_ARCH_X86,CS_MODE_64);md.detail=True
    queue=[entry];instructions={};occupied={};calls=[];unresolved=[];references=[]
    while queue:
        address=queue.pop()
        while address not in instructions:
            if len(instructions)>=limit:raise ValueError('Instruction budget exceeded')
            offset=pe.offset(address)
            ins=next(md.disasm(pe.b[offset:offset+15],address,count=1),None)
            if ins is None:raise ValueError('Invalid instruction')
            for byte in range(address,address+ins.size):
                if byte in occupied:raise ValueError('Overlapping instruction boundaries')
                if pe.offset(byte)!=offset+byte-address:raise ValueError('Instruction crosses mapping boundary')
                occupied[byte]=address
            instructions[address]={'address':address,'size':ins.size,'mnemonic':ins.mnemonic,'operands':ins.op_str}
            for index, operand in enumerate(ins.operands):
                if operand.type == X86_OP_MEM and operand.mem.base == X86_REG_RIP:
                    target = ins.address + ins.size + operand.mem.disp
                    # A reference is not a dereferenced value or a resolved call.
                    # LEA computes an address; other opcodes may read or write it.
                    try:
                        file_offset = pe.offset(target)
                    except ValueError:
                        file_offset = None
                    references.append({'address':address,'operandIndex':index,
                        'target':target,'fileOffset':file_offset,'operandSize':operand.size,
                        'addressOnly':ins.mnemonic == 'lea'})
            if ins.group(CS_GRP_CALL):
                calls.append({'address':address,'target':ins.operands[0].imm if ins.operands[0].type==X86_OP_IMM else None,'operand':ins.op_str})
            if ins.group(CS_GRP_RET):break
            if ins.mnemonic in ('int3','ud2'):
                unresolved.append({'address':address,'reason':'trap termination'});break
            if ins.group(CS_GRP_JUMP):
                if ins.operands[0].type==X86_OP_IMM:queue.append(ins.operands[0].imm)
                else:unresolved.append({'address':address,'reason':'indirect branch'})
                if ins.mnemonic=='jmp':break
            address+=ins.size
    return {'entry':entry,'instructions':[instructions[a] for a in sorted(instructions)],'calls':calls,'unresolvedBranches':unresolved,
            'ripReferences':sorted(references,key=lambda r:(r['address'],r['operandIndex'])),
            'limits':['Static reachability is not runtime behavior. Calls, including virtual dispatch, are not resolved.','Direct tail jumps may enter another function. Exception-table entries can be fragments, not entire functions.','Generated instructions and addresses must remain private.']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('executable',type=Path);p.add_argument('entry',type=lambda s:int(s,0));p.add_argument('private_output',type=Path);p.add_argument('--limit',type=int,default=3000);a=p.parse_args()
    with a.executable.open('rb') as f,mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as b:
        result=trace(PE(b),a.entry,a.limit);result['executableSha256']=hashlib.sha256(b).hexdigest()
    a.private_output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(len(result['instructions']),'instructions;',len(result['calls']),'call sites;',len(result['unresolvedBranches']),'unresolved branch ends; no runtime certification')
