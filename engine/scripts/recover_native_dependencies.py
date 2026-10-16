"""Recover reviewed native struct roots and dependencies; output MUST stay private.
Observed installed-build registration profile, not a general Unreal ABI parser.
"""
import argparse, hashlib, json, mmap, struct
from pathlib import Path
from recover_native_structs import PE
from recover_native_class import fold_fields, nested_name

BUILTINS={'GameplayTagContainer','GameplayTag','ScalableFloat','DataRegistryType','CurveTableRowHandle','Vector','Rotator','Color'}

def constructor_params(pe, record):
    off=pe.offset(struct.unpack_from('<Q',pe.b,record+56)[0])
    pos=pe.b.find(bytes.fromhex('488d15'),off,off+64)
    if pos<0:raise ValueError('Unsupported struct constructor')
    return pe.address(pos)+7+struct.unpack_from('<i',pe.b,pos+3)[0]

def recover(pe, roots):
    queue=list(roots);result={};owners={}
    while queue:
        param=queue.pop();off=pe.offset(param)
        name=pe.cstr(struct.unpack_from('<Q',pe.b,off+24)[0])
        if name in owners and owners[name]!=param:raise ValueError('Ambiguous struct owner')
        owners[name]=param
        if name in result or name in BUILTINS:continue
        count=struct.unpack_from('<H',pe.b,off+40)[0]
        if count>256:raise ValueError('Unexpected struct property count')
        ptr=struct.unpack_from('<Q',pe.b,off+32)[0]
        if not count and ptr:raise ValueError('Non-null empty property array')
        array=pe.offset(ptr) if count else 0;records=[]
        for i in range(count):
            record=pe.offset(struct.unpack_from('<Q',pe.b,array+8*i)[0])
            kind,flags=struct.unpack_from('<II',pe.b,record+24)
            if flags!=0x45:raise ValueError('Unexpected property flags')
            field={'name':pe.cstr(struct.unpack_from('<Q',pe.b,record)[0]),'kind':kind,'recordOffset':record}
            if kind in (25,30):field['typeName']=nested_name(pe,record,kind)
            if kind==25:queue.append(constructor_params(pe,record))
            records.append(field)
        result[name]={'paramsVA':param,'registrationEntryCount':count,'fields':fold_fields(records)}
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('executable',type=Path);p.add_argument('private_output',type=Path)
    p.add_argument('--root',type=lambda s:int(s,0),action='append',required=True);a=p.parse_args()
    with a.executable.open('rb') as f,mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as b:
        result=recover(PE(b),a.root);digest=hashlib.sha256(b).hexdigest()
    for value in result.values():value['executableSha256']=digest
    a.private_output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print('Recovered',len(result),'candidate struct layouts; defaults and behavior remain separate evidence')
