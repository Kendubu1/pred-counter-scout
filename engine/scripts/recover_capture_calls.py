"""Recover only observed straight-line native capture argument setups.

Input is a private trace_native_control_flow report. Results are private offsets,
not attribute names, evaluated values, capture success or runtime guarantees.
Caller must independently identify the singleton getter and evaluator.
"""
import re


def capture_setups(instructions, getter, evaluator):
    branch_targets = {int(i['operands'], 16) for i in instructions
                      if i['mnemonic'].startswith('j') and re.fullmatch(r'0x[0-9a-f]+', i['operands'])}
    active = False
    capture = output = None
    result = []
    previous_end = None
    for ins in instructions:
        address, mnemonic, operands = ins['address'], ins['mnemonic'], ins['operands']
        if previous_end != address or address in branch_targets:
            active = False
        previous_end = address + ins['size']
        if mnemonic == 'call':
            if operands == hex(evaluator) and active and capture is not None and output is not None:
                result.append({'call':address, 'captureOffset':capture, 'output':output})
            active = operands == hex(getter)
            capture = output = None
            continue
        if not active:
            continue
        # Deliberately narrow: no crossing branches, writes to the singleton
        # result, arithmetic or another call while associating arguments.
        if mnemonic not in ('mov', 'lea', 'nop'):
            active = False
            continue
        destination = operands.split(',', 1)[0]
        if '[' in destination or destination in ('rax', 'eax', 'ax', 'al', 'ah',
                                                 'rbp', 'ebp', 'bp', 'bpl', 'rsp', 'esp', 'sp', 'spl'):
            active = False
            continue
        if destination in ('rdx', 'edx', 'dx', 'dl', 'dh'):
            capture = None
            match = re.fullmatch(r'rdx, \[rax(?: \+ (0x[0-9a-f]+|[0-9]+))?\]', operands)
            if mnemonic == 'lea' and match:
                capture = int(match[1], 0) if match[1] else 0
        if destination in ('r9', 'r9d', 'r9w', 'r9b'):
            output = None
            match = re.fullmatch(r'r9, \[(rbp|rsp)(?: ([+-]) (0x[0-9a-f]+|[0-9]+))?\]', operands)
            if mnemonic == 'lea' and match:
                displacement = int(match[3], 0) if match[3] else 0
                output = {'base':match[1], 'offset':-displacement if match[2] == '-' else displacement}
    return result
