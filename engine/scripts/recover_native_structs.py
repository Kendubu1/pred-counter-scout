"""Read-only, build-specific PE reflection probe. Output stays private.
Record layouts are an observed parser profile, not general Unreal ABI guarantees.
"""
import argparse, hashlib, json, mmap, struct
from pathlib import Path

EXPECTED = {
 'ScalableFloat': [('Value', 10), ('Curve', 25), ('RegistryType', 25)],
 'ActiveGameplayEffectHandle': [('Handle', 3), ('bPassedFiltersAndWasExecuted', 76)],
 'CurveTableRowHandle': [('CurveTable', 82), ('RowName', 20)],
 'DataRegistryType': [('Name', 20)],
}

def parse_descriptor(b, offset, cstr, ref):
    """Reject invalid ownership, bounds, count, flags or field shapes."""
    name = cstr(struct.unpack_from('<Q', b, ref)[0])
    if name not in EXPECTED: raise ValueError('Unknown owner')
    count = struct.unpack_from('<H', b, ref + 16)[0]
    if count != len(EXPECTED[name]): raise ValueError('Unexpected property count')
    array = offset(struct.unpack_from('<Q', b, ref + 8)[0])
    fields = []
    for i, (expected_name, expected_type) in enumerate(EXPECTED[name]):
        record = offset(struct.unpack_from('<Q', b, array + 8*i)[0])
        field = cstr(struct.unpack_from('<Q', b, record)[0])
        kind, flags = struct.unpack_from('<II', b, record + 24)
        if (field, kind, flags) != (expected_name, expected_type, 0x45):
            raise ValueError('Unexpected property metadata')
        fields.append({'name': field, 'kind': kind, 'recordOffset': record})
    return {'name': name, 'descriptorNameOffset': ref, 'fields': fields}

class PE:
    def __init__(self, b):
        self.b = b
        if b[:2] != b'MZ': raise ValueError('Not PE')
        pe = struct.unpack_from('<I', b, 0x3c)[0]
        if b[pe:pe+4] != b'PE\0\0': raise ValueError('Invalid PE signature')
        count = struct.unpack_from('<H', b, pe+6)[0]
        opt = pe+24
        if struct.unpack_from('<H', b, opt)[0] != 0x20b: raise ValueError('Expected PE32+')
        self.base = struct.unpack_from('<Q', b, opt+24)[0]
        start = opt + struct.unpack_from('<H', b, pe+20)[0]
        self.sections = [struct.unpack_from('<IIII', b, start+40*i+8) for i in range(count)]
    def offset(self, va):
        for _, rva, size, raw in self.sections:
            if self.base+rva <= va < self.base+rva+size:
                o = raw + va-self.base-rva
                if o < len(self.b): return o
        raise ValueError('Unmapped address')
    def address(self, off):
        for _, rva, size, raw in self.sections:
            if raw <= off < raw+size: return self.base+rva+off-raw
        raise ValueError('Unmapped offset')
    def cstr(self, va):
        o = self.offset(va); end = self.b.find(b'\0', o, min(o+128, len(self.b)))
        if end < 0: raise ValueError('Unterminated name')
        return self.b[o:end].decode('ascii')
    def hits(self, needle):
        pos = 0
        while True:
            pos = self.b.find(needle, pos)
            if pos < 0: return
            yield pos
            pos += 1
    def recover(self):
        result = {}
        for name in EXPECTED:
            candidates = []
            for string in self.hits(name.encode()+b'\0'):
                if string and self.b[string-1] != 0: continue
                for ref in self.hits(struct.pack('<Q', self.address(string))):
                    if ref % 8: continue
                    try:
                        candidates.append(parse_descriptor(self.b, self.offset, self.cstr, ref))
                    except (ValueError, UnicodeError, struct.error): pass
            if len(candidates) != 1: raise ValueError(f'{name}: {len(candidates)} candidates, expected exactly one')
            result[name] = candidates[0]
        return result

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('executable', type=Path)
    p.add_argument('output', type=Path, help='Private output path; contains native reflection metadata')
    args = p.parse_args()
    with args.executable.open('rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as b:
        result = {'sha256': hashlib.sha256(b).hexdigest(), 'scope': 'Four native reflected struct layouts; not runtime behavior', 'structs': PE(b).recover()}
    args.output.write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
    print('Recovered',len(result['structs']),'native struct layouts; private output written')
