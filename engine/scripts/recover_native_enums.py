"""Recover selected native enum registration tables into PRIVATE metadata."""
import argparse, hashlib, json, mmap, struct
from pathlib import Path
from recover_native_structs import PE

NAMES=('EGameplayTargetingConfirmation','EDrawDebugTrace','EPredMuzzleSocket','ECharacterHoverMovement','ECollisionEnabled')

def parse_enum(pe, ref, expected, allow_aliases=False):
    b=pe.b
    name=pe.cstr(struct.unpack_from('<Q',b,ref)[0])
    cpp=pe.cstr(struct.unpack_from('<Q',b,ref+8)[0])
    if name!=expected or cpp not in (name,name+'::Type'):raise ValueError('Owner mismatch')
    flags=struct.unpack_from('<I',b,ref+24)[0]
    count=struct.unpack_from('<H',b,ref+28)[0]
    if flags!=0x45 or not 1<=count<=256:raise ValueError('Unsupported enum descriptor')
    array=pe.offset(struct.unpack_from('<Q',b,ref+16)[0])
    values=[];labels=set();numbers=set()
    for i in range(count):
        ptr,value=struct.unpack_from('<Qq',b,array+i*16)
        label=pe.cstr(ptr)
        if not label.startswith(name+'::') or label in labels or (value in numbers and not allow_aliases):raise ValueError('Invalid enum entry')
        labels.add(label);numbers.add(value);values.append({'name':label,'value':value})
    if numbers!=set(range(len(numbers))):raise ValueError('Sparse enum profile unsupported by this reader')
    if not allow_aliases:return values
    canonical={}
    for entry in values:
        number=entry['value']
        if number not in canonical:canonical[number]=entry
        else:canonical[number].setdefault('aliases',[]).append(entry['name'])
    return [canonical[n] for n in sorted(canonical)]

def recover(pe, allow_aliases=False):
    result={}
    for name in NAMES:
        candidates=[]
        for string in pe.hits(name.encode()+b'\0'):
            for ref in pe.hits(struct.pack('<Q',pe.address(string))):
                if ref%8:continue
                try:candidates.append(parse_enum(pe,ref,name,allow_aliases))
                except (ValueError,UnicodeError,struct.error):pass
        if len(candidates)!=1:raise ValueError(f'{name}: expected one descriptor, found {len(candidates)}')
        result[name]=candidates[0]
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('executable',type=Path);p.add_argument('private_output',type=Path);p.add_argument('--additional-name',action='append',default=[]);p.add_argument('--allow-aliases',action='store_true');args=p.parse_args()
    NAMES=tuple(dict.fromkeys((*NAMES,*args.additional_name)))
    with args.executable.open('rb') as f,mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as b:
        result={'executableSha256':hashlib.sha256(b).hexdigest(),'enums':recover(PE(b),args.allow_aliases)}
    args.private_output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print('Recovered',len(result['enums']),'enum tables with',sum(map(len,result['enums'].values())),'explicit values; output stays private')
