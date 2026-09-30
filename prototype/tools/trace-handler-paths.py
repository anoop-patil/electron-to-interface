# gdb script: records which machine instructions of each opcode handler actually run for hello.py.
# Run by trace-handler-paths.sh:  gdb -nx -batch -x trace-handler-paths.py --args python3.14 hello.py
# capture-example.sh runs it for an Example instead, setting TRACE_FILE (the program's file name) and
# TRACE_OPS (space-separated handler names, including specialized variants such as CALL_PY_EXACT_ARGS).
#
# A breakpoint sits at the start of each handler used by hello.py. It only stops when the frame being run
# belongs to hello.py, so the thousands of handler runs during Python's own startup are skipped. From there
# gdb single-steps (stepi) through the handler and logs every instruction until the handler jumps to the next
# one. Calls to other functions (print itself, PyDict_GetItemRef, ...) are stepped over and logged by name;
# their insides are not recorded.
import gdb, json, os, subprocess

BIN = gdb.current_progspace().filename
OUT = os.environ['TRACE_OUT']
OPS = os.environ.get('TRACE_OPS', 'RESUME LOAD_NAME PUSH_NULL LOAD_CONST CALL POP_TOP RETURN_VALUE').split()
FILE = os.environ.get('TRACE_FILE', 'hello.py')

# Address ranges of every handler part: main, .warm and .cold (split off by BOLT), .org.0 (5-byte entry stub)
parts = []
for line in subprocess.check_output(['nm', '-S', '--defined-only', BIN], text=True).splitlines():
    f = line.split()
    if len(f) == 4 and f[3].startswith('_TAIL_CALL_'):
        n = f[3]
        part = 'cold' if n.endswith('.cold') else 'warm' if n.endswith('.warm') else 'stub' if n.endswith('.org.0') else 'main'
        lo = int(f[0], 16)
        parts.append((lo, lo + int(f[1], 16), n.split('.')[0][len('_TAIL_CALL_'):], part))

def owner(pc):
    for lo, hi, op, part in parts:
        if lo <= pc < hi: return op, part
    return None

def reg(r): return int(gdb.parse_and_eval('$' + r)) & 0xffffffffffffffff

def unicode_text(addr):  # a compact ASCII str object, e.g. a code object's co_filename
    o = gdb.parse_and_eval('(PyASCIIObject *)%d' % addr)
    n = int(o['length'])
    data = addr + gdb.lookup_type('PyASCIIObject').sizeof
    return bytes(gdb.selected_inferior().read_memory(data, n)).decode()

def where():  # (filename, bytecode offset, code name) of the frame the handler is running; frame is in r12, next_instr in r15
    fr = gdb.parse_and_eval('(struct _PyInterpreterFrame *)%d' % reg('r12'))
    code = int(fr['f_executable']['bits']) & ~7
    co = gdb.parse_and_eval('(PyCodeObject *)%d' % code)
    fname = unicode_text(int(co['co_filename']))
    start = int(co['co_code_adaptive'].address)
    return fname, (reg('r15') - start), unicode_text(int(co['co_qualname']))

def src(pc):  # C source line and the chain of inlined functions at this instruction, innermost first
    sal = gdb.find_pc_line(pc)
    line = [os.path.basename(sal.symtab.filename), sal.line] if sal.symtab else None
    chain, b = [], gdb.block_for_pc(pc)
    while b is not None:
        if b.function is not None and (not chain or chain[-1] != b.function.name): chain.append(b.function.name)
        b = b.superblock
    return line, chain

class Entry(gdb.Breakpoint):
    def __init__(self, addr, op):
        super().__init__('*0x%x' % addr, internal=True); self.op = op
    def stop(self):
        try: return where()[0].endswith(FILE)
        except gdb.error: return False

arch = None
def trace(op):
    global arch
    arch = arch or gdb.selected_frame().architecture()
    fname, offset, qual = where()
    frame_ok = None
    try: frame_ok = int(gdb.parse_and_eval('frame')) == reg('r12')  # confirm r12 really is the frame (DWARF)
    except gdb.error: pass
    steps, calls = [], []
    while True:
        pc = reg('pc')
        o = owner(pc)
        if o is None or o[0] != op:
            nxt = gdb.execute('info symbol 0x%x' % pc, to_string=True).strip()
            return {'op': op, 'file': fname, 'code': qual, 'offset': offset, 'frame_in_r12': frame_ok,
                    'steps': steps, 'calls': calls, 'next': nxt}
        ins = arch.disassemble(pc)[0]
        line, chain = src(pc)
        steps.append({'pc': format(pc, 'x'), 'part': o[1], 'asm': ins['asm'], 'src': line, 'inl': chain})
        if ins['asm'].startswith('call'):
            rsp = reg('rsp'); back = pc + ins['length']
            gdb.execute('stepi', to_string=True)
            callee = gdb.execute('info symbol 0x%x' % reg('pc'), to_string=True).split(' in section')[0].strip()
            bp = gdb.Breakpoint('*0x%x' % back, internal=True)
            while not (reg('pc') == back and reg('rsp') == rsp):
                gdb.execute('continue', to_string=True)
            bp.delete()
            calls.append({'at': format(pc, 'x'), 'fn': callee, 'returned': format(reg('rax'), 'x')})
        else:
            gdb.execute('stepi', to_string=True)

gdb.execute('set pagination off')
gdb.execute('set confirm off')
entries = {}
for lo, hi, op, part in parts:
    if op in OPS and part == 'main': entries[lo] = op; Entry(lo, op)

runs = []
gdb.execute('run', to_string=True)
while gdb.selected_inferior().pid:
    pc = reg('pc')
    # A handler can jump straight onto the next handler's breakpoint; 'continue' would skip it, so check first
    if pc in entries and where()[0].endswith(FILE):
        runs.append(trace(entries[pc])); continue
    try: gdb.execute('continue', to_string=True)
    except gdb.error: break

json.dump({'runs': runs}, open(OUT, 'w'), indent=1)
print('traced', len(runs), 'handler runs:', ', '.join('%s@%d (%d instructions)' % (r['op'], r['offset'], len(r['steps'])) for r in runs))
