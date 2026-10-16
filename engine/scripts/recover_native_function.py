"""Observed native function-parameter descriptor profile; reports stay private.

Caller must establish the owning class getter independently. A return enum
constructor reference is metadata, not its values or execution behavior.
"""
from resolve_native_import import read_at


def parse_function(pe, address, expected_name, owner_getter):
    owner, delegate, name, rpc, response, properties = read_at(pe, address, '<6Q')
    count, parameter_size, profile, function_flags = read_at(pe, address+48, '<HHII')
    if not owner_getter or owner != owner_getter:
        raise ValueError('Function owner mismatch')
    if pe.cstr(name) != expected_name:
        raise ValueError('Function name mismatch')
    if profile != 0x45 or count > 256 or bool(count) != bool(properties):
        raise ValueError('Unsupported parameter descriptor')
    fields = []
    seen = set()
    for i in range(count):
        record, = read_at(pe, properties+8*i, '<Q')
        field_name, = read_at(pe, record, '<Q')
        kind, field_profile = read_at(pe, record+24, '<II')
        label = pe.cstr(field_name)
        if not label or label in seen or field_profile != 0x45:
            raise ValueError('Invalid parameter field')
        seen.add(label)
        field = {'name':label, 'kind':kind, 'record':record}
        # Observed ByteProperty registration profile, including enum getter.
        if kind == 0:
            enum_getter, = read_at(pe, record+56, '<Q')
            field['enumGetter'] = enum_getter or None
        fields.append(field)
    return {'name':expected_name, 'ownerGetter':owner, 'parameterSize':parameter_size,
            'flags':function_flags, 'fields':fields}
