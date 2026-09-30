# Disassembles the real opcode handlers from the CPython 3.14.2 binary used for all captures
# (python-build-standalone 20251205, x86_64-unknown-linux-gnu, with symbols) and writes JSON.
# Usage: extract-machine-code.py <out.json> [HANDLER ...]; without handler names, hello world's 7.
# With EXTRACT_ALL_PARTS=1 it also disassembles each handler's .warm and .cold parts (which BOLT moved
# elsewhere in the program) into 'more', since for some handlers most of the work happens there.
import json, os, sys
from elftools.elf.elffile import ELFFile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64
BIN = '/tmp/eti/python/bin/python3.14'
f = ELFFile(open(BIN, 'rb'))
st = f.get_section_by_name('.symtab')
allsyms = [s for s in st.iter_symbols() if s['st_value']]
funcs = [s for s in allsyms if s['st_info']['type'] == 'STT_FUNC']
name_at = {}
for s in funcs: name_at.setdefault(s['st_value'], s.name)
obj_at = {s['st_value']: s.name for s in allsyms if s['st_info']['type'] == 'STT_OBJECT'}
text = f.get_section_by_name('.text')
def code_of(s):
    f.stream.seek(s['st_value'] - text['sh_addr'] + text['sh_offset']); return f.stream.read(s['st_size'])
def clean(n):  # drop compiler suffixes such as .llvm.1234 / .cold / .warm
    return n.split('.llvm.')[0].split('.cold')[0].split('.warm')[0]
md = Cs(CS_ARCH_X86, CS_MODE_64)
OPS = sys.argv[2:] or ['RESUME', 'LOAD_NAME', 'PUSH_NULL', 'LOAD_CONST', 'CALL', 'POP_TOP', 'RETURN_VALUE']
out = {'binary': 'python-build-standalone 20251205, cpython-3.14.2, x86_64-unknown-linux-gnu', 'ops': {}}
table = None
for op in OPS:
    parts = {s.name: s for s in funcs if s.name == '_TAIL_CALL_' + op or s.name.startswith('_TAIL_CALL_' + op + '.')}
    main = next(s for n, s in parts.items() if not n.endswith(('.cold', '.warm', '.org.0')))
    warm = sum(s['st_size'] for n, s in parts.items() if n.endswith('.warm'))
    cold = sum(s['st_size'] for n, s in parts.items() if n.endswith('.cold'))
    lo, hi = main['st_value'], main['st_value'] + main['st_size']
    ins, calls = [], []
    for i in md.disasm(code_of(main), lo):
        note = ''
        if '*8 + 0x' in i.op_str and i.mnemonic == 'jmp':
            t = int(i.op_str.rsplit('0x', 1)[1].rstrip(']'), 16); table = table or obj_at.get(t, hex(t)); note = 'dispatch'
        elif i.mnemonic.startswith(('call', 'j')) and i.op_str.startswith('0x'):
            t = int(i.op_str, 16)
            if lo <= t < hi: note = 'here'
            else:
                nm = name_at.get(t)
                if nm and (nm == '_TAIL_CALL_' + op or nm.startswith('_TAIL_CALL_' + op + '.')): note = 'rare'
                elif nm: note = 'fn:' + clean(nm)
                else:
                    owner = next((s for s in parts.values() if s['st_value'] <= t < s['st_value'] + s['st_size']), None)
                    note = 'rare' if owner is not None else ''
            if i.mnemonic == 'call' and note.startswith('fn:'): calls.append(note[3:])
        elif i.mnemonic == 'call': note = 'indirect'
        ins.append([format(i.address, 'x'), ' '.join(str(b) for b in i.bytes), i.mnemonic, i.op_str, note])
    out['ops'][op] = {'sym': clean(main.name), 'addr': format(lo, 'x'), 'size': main['st_size'], 'warm': warm, 'cold': cold, 'calls': calls, 'ins': ins}
    if os.environ.get('EXTRACT_ALL_PARTS') == '1':
        more = {}
        for n, s in sorted(parts.items(), key=lambda kv: kv[1]['st_value']):
            kind = 'warm' if n.endswith('.warm') else 'cold' if n.endswith('.cold') else None
            if not kind: continue
            rows = []
            for i in md.disasm(code_of(s), s['st_value']):
                note = ''
                if '*8 + 0x' in i.op_str and i.mnemonic == 'jmp': note = 'dispatch'
                elif i.mnemonic.startswith(('call', 'j')) and i.op_str.startswith('0x'):
                    t = int(i.op_str, 16)
                    if any(q['st_value'] <= t < q['st_value'] + q['st_size'] for q in parts.values()): note = 'here'
                    elif name_at.get(t): note = 'fn:' + clean(name_at[t])
                elif i.mnemonic == 'call': note = 'indirect'
                rows.append([format(i.address, 'x'), ' '.join(str(b) for b in i.bytes), i.mnemonic, i.op_str, note])
            more.setdefault(kind, []).extend(rows)
        out['ops'][op]['more'] = more
    print(op, clean(main.name), main['st_size'], 'bytes,', len(ins), 'instructions, warm', warm, 'cold', cold, 'calls', sorted(set(calls)), file=sys.stderr)
out['table'] = table
json.dump(out, open(sys.argv[1], 'w'), separators=(',', ':'))
print('dispatch table:', table, file=sys.stderr)
