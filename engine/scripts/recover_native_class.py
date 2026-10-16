"""Build-specific native class reflection probe. All generated output is private."""
import argparse, hashlib, json, mmap, struct
from pathlib import Path
from recover_native_structs import PE

def fold_fields(records):
    stack=[]
    for source in records:
        field=dict(source);kind=field['kind']
        if kind in (22,30,33):
            if not stack:raise ValueError('Missing inner property')
            inner=stack.pop()
            if kind==30 and inner['name']!='UnderlyingType':raise ValueError('Wrong enum helper')
            if kind in (22,33) and inner['name']!=field['name']:raise ValueError('Wrong collection helper')
            field['inner']=inner
        elif kind==23:
            if len(stack)<2:raise ValueError('Missing map helpers')
            key=stack.pop();value=stack.pop()
            if key['name']!=field['name']+'_Key' or value['name']!=field['name']:raise ValueError('Wrong map helpers')
            field.update(key=key,value=value)
        stack.append(field)
    if any(f['name']=='UnderlyingType' for f in stack):raise ValueError('Orphan helper')
    if len({f['name'] for f in stack})!=len(stack):raise ValueError('Duplicate top-level fields')
    return stack

def nested_name(pe, record, kind):
    fn=struct.unpack_from('<Q',pe.b,record+56)[0];off=pe.offset(fn)
    pos=pe.b.find(bytes.fromhex('488d15'),off,off+64)
    if pos<0:raise ValueError('Unsupported constructor shape')
    target=pe.address(pos)+7+struct.unpack_from('<i',pe.b,pos+3)[0]
    ref=pe.offset(target)+(24 if kind==25 else 16)
    return pe.cstr(struct.unpack_from('<Q',pe.b,ref)[0])

def recover(pe, params):
    off=pe.offset(params);packed=struct.unpack_from('<I',pe.b,off+56)[0]
    count=(packed>>15)&2047
    if not 0<count<=2047:raise ValueError('Invalid property count')
    array=pe.offset(struct.unpack_from('<Q',pe.b,off+40)[0]);records=[]
    for i in range(count):
        record=pe.offset(struct.unpack_from('<Q',pe.b,array+8*i)[0])
        kind,flags=struct.unpack_from('<II',pe.b,record+24)
        if flags!=0x45:raise ValueError('Unexpected property flags')
        item={'name':pe.cstr(struct.unpack_from('<Q',pe.b,record)[0]),'kind':kind,'recordOffset':record}
        if kind in (25,30):item['typeName']=nested_name(pe,record,kind)
        records.append(item)
    return {'registrationEntryCount':count,'fields':fold_fields(records)}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('executable',type=Path);p.add_argument('class_params_va',type=lambda s:int(s,0));p.add_argument('private_output',type=Path);a=p.parse_args()
    with a.executable.open('rb') as f,mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as b:
        result=recover(PE(b),a.class_params_va);result['executableSha256']=hashlib.sha256(b).hexdigest()
    a.private_output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print('Recovered',result['registrationEntryCount'],'registration entries as',len(result['fields']),'candidate fields; native superclass not recovered')
