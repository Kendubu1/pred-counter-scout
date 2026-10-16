"""Observed native function-parameter descriptor profile; reports stay private.

Caller must establish the owning class getter independently. A return enum
constructor reference is metadata, not its values or execution behavior.
"""
from resolve_native_import import read_at


def parse_function_links(pe, address, count, owner_getter, descriptor_for_getter):
    """Read factory-first links, validating every name against owned metadata.

    The caller must independently establish table bounds and resolve each
    factory's descriptor. Native registration tables use a different order;
    do not infer either layout from an isolated string-pointer match.
    """
    if not 0 < count <= 256:
        raise ValueError('Unsupported function link count')
    links = []
    names = set()
    for i in range(count):
        getter, name_pointer = read_at(pe, address+16*i, '<QQ')
        if not getter:
            raise ValueError('Missing function factory')
        pe.offset(getter)
        pe.offset(name_pointer)
        name = pe.cstr(name_pointer)
        if not name or not name.isascii() or not name.isidentifier() or name in names:
            raise ValueError('Invalid function link name')
        descriptor = descriptor_for_getter(getter)
        metadata = parse_function(pe, descriptor, name, owner_getter)
        names.add(name)
        links.append({'getter':getter, 'descriptor':descriptor, 'metadata':metadata})
    return links


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
