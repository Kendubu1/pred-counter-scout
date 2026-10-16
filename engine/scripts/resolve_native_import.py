"""Resolve a PE32+ import slot without loading or executing the binary.

Generated import addresses and reports stay private. A named import identifies
the static dependency, not its runtime implementation, seed or callers.
"""
import argparse
import json
import mmap
import struct
from pathlib import Path
from recover_native_structs import PE


def read_at(pe, address, fmt):
    size = struct.calcsize(fmt)
    offset = pe.offset(address)
    if offset + size > len(pe.b):
        raise ValueError('Truncated import record')
    if any(pe.offset(address + i) != offset + i for i in range(size)):
        raise ValueError('Discontinuous import record')
    return struct.unpack_from(fmt, pe.b, offset)


def resolve_slot(pe, directory_rva, directory_size, slot):
    if not directory_rva or not directory_size:
        return None
    for delta in range(0, directory_size - 19, 20):
        original, stamp, forwarder, name, first = read_at(
            pe, pe.base + directory_rva + delta, '<IIIII')
        if not any((original, stamp, forwarder, name, first)):
            return None
        if not first or slot < pe.base + first or (slot - pe.base - first) % 8:
            continue
        index = (slot - pe.base - first) // 8
        # Bound the walk; never interpret a bound IAT as a name table.
        if not original or index > 65535:
            continue
        for i in range(index + 1):
            value, = read_at(pe, pe.base + original + i * 8, '<Q')
            if value == 0:
                break
            if i != index:
                continue
            dll = pe.cstr(pe.base + name)
            if value & (1 << 63):
                return {'library': dll, 'ordinal': value & 0xffff}
            return {'library': dll, 'name': pe.cstr(pe.base + value + 2)}
    raise ValueError('Import directory lacks a terminating descriptor')


def import_directory(pe):
    header, = struct.unpack_from('<I', pe.b, 0x3c)
    optional = header + 24
    count, = struct.unpack_from('<I', pe.b, optional + 108)
    if count < 2:
        return 0, 0
    return struct.unpack_from('<II', pe.b, optional + 120)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    parser.add_argument('slot', type=lambda value: int(value, 0))
    parser.add_argument('private_output', type=Path)
    args = parser.parse_args()
    with args.executable.open('rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as data:
        pe = PE(data)
        result = resolve_slot(pe, *import_directory(pe), args.slot)
    args.private_output.write_text(json.dumps({'slot': args.slot, 'import': result}, indent=2) + '\n')
    print('Import resolved.' if result else 'No named/ordinal import resolved.')
