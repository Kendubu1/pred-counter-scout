"""Observed ASCII-name/tag-cache getter profile. Generated reports stay private.

The caller independently identifies both constructors. A literal is accepted
only when the observed setup builds the same cache read by the getter.
This is a static binding, not a runtime tag or damage-policy guarantee.
"""
import re


def bind_tag_cache(pe, trace, name_constructor, tag_constructor):
    instructions = trace['instructions']
    refs = {r['address']:r for r in trace['ripReferences']}
    matches = []
    for index, ins in enumerate(instructions):
        if ins['mnemonic'] != 'lea' or not ins['operands'].startswith('rdx, [rip '):
            continue
        rows = instructions[index:index+9]
        if len(rows) != 9 or any(a['address']+a['size'] != b['address'] for a,b in zip(rows,rows[1:])):
            continue
        expected = [('lea',r'rdx, \[rip [^]]+\]'), ('lea',r'rcx, \[rsp \+ [^]]+\]'),
                    ('call',re.escape(hex(name_constructor))), ('mov',r'r8b, 1'),
                    ('lea',r'rcx, \[rip [^]]+\]'), ('mov',r'rdx, qword ptr \[rax\]'),
                    ('mov',r'qword ptr (\[rsp \+ [^]]+\]), rdx'),
                    ('lea',r'rdx, \[rsp \+ [^]]+\]'), ('call',re.escape(hex(tag_constructor)))]
        if not all(row['mnemonic']==mnemonic and re.fullmatch(pattern,row['operands'])
                   for row,(mnemonic,pattern) in zip(rows,expected)):
            continue
        if rows[6]['operands'][10:].split(',')[0] != rows[7]['operands'][5:]:
            continue
        literal_ref, cache_ref = refs.get(ins['address']), refs.get(rows[4]['address'])
        if not literal_ref or not cache_ref or not literal_ref['addressOnly'] or not cache_ref['addressOnly']:
            continue
        literal = pe.cstr(literal_ref['target'])
        if not literal.startswith('GameplayEffect.'):
            continue
        cache = cache_ref['target']
        returned = False
        for j, read in enumerate(instructions[:-2]):
            ref = refs.get(read['address'])
            after, result = instructions[j+1:j+3]
            if (ref and ref['target']==cache and not ref['addressOnly'] and read['mnemonic']=='mov'
                and read['operands'].startswith('rax, qword ptr [rip ')
                and after['address']==read['address']+read['size'] and result['address']==after['address']+after['size']
                and (after['mnemonic'],after['operands'])==('mov','qword ptr [rbx], rax')
                and (result['mnemonic'],result['operands'])==('mov','rax, rbx')):
                returned = True
        if returned:
            matches.append({'tag':literal, 'cache':cache, 'nameSetup':ins['address']})
    if len(matches) != 1:
        raise ValueError('No unique supported tag cache binding')
    return matches[0]
