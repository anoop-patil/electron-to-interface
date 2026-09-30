# Captures the facts prototype v8 shows for an Example program, using the pinned CPython 3.14.2.
# Run by capture-example.sh:  python3.14 capture-example.py <program.py> <out.json>
#
# Observed: bytes, tokens (tokenize), syntax tree (ast), bytecode of every code object (dis), the order
# the steps ran in (sys.monitoring INSTRUCTION events) and which step printed what. Also records object
# sizes (sys.getsizeof) and the specialized form each step has after a normal run (dis, adaptive=True).
import ast, contextlib, dis, io, json, opcode, sys, tokenize

path, out = sys.argv[1], sys.argv[2]
raw = open(path, 'rb').read()
assert raw.isascii(), 'columns below assume one byte per character'
src = raw.decode()
starts = [0] + [i + 1 for i, b in enumerate(raw) if b == 10]
def off(line, col): return starts[line - 1] + col if line >= 1 else None
def span(a, b): return [off(*a), off(*b)] if a[0] >= 1 else None

# Tokens, exactly as tokenize reports them
tokens = [{'type': tokenize.tok_name[t.type], 'exact': tokenize.tok_name[t.exact_type], 'text': t.string,
           'start': list(t.start), 'end': list(t.end), 'span': span(t.start, t.end)}
          for t in tokenize.tokenize(io.BytesIO(raw).readline)]

# Syntax tree, pre-order, with each node's children by field
tree = ast.parse(raw, path)
nodes, ids = [], {}
def visit(n, parent, field):
    i = len(nodes); ids[id(n)] = i
    rec = {'type': type(n).__name__, 'parent': parent, 'field': field, 'kids': []}
    if hasattr(n, 'lineno'): rec['span'] = span((n.lineno, n.col_offset), (n.end_lineno, n.end_col_offset))
    else: rec['span'] = [0, len(raw)]
    for k in ('id', 'arg', 'name'):
        v = getattr(n, k, None)
        if isinstance(v, str): rec[k] = v
    if isinstance(n, ast.Constant): rec['value'] = repr(n.value)
    if isinstance(n, (ast.Load, ast.Store, ast.Del)): return None
    nodes.append(rec)
    for fname, val in ast.iter_fields(n):
        for c in (val if isinstance(val, list) else [val]):
            if isinstance(c, ast.AST) and not isinstance(c, (ast.Load, ast.Store, ast.Del)):
                rec['kids'].append([fname, visit(c, i, fname)])
    if hasattr(n, 'ctx'): rec['ctx'] = type(n.ctx).__name__
    return i
visit(tree, None, None)

# Bytecode of every code object: the file's own, and each function inside it
module = compile(raw, path, 'exec')
codes = []
def collect(co):
    codes.append(co)
    for c in co.co_consts:
        if hasattr(c, 'co_code'): collect(c)
collect(module)
def const_repr(c): return '<code %s>' % c.co_name if hasattr(c, 'co_code') else repr(c)
def code_facts(co):
    ins = []
    for i in dis.get_instructions(co):
        p = i.positions
        sp = span((p.lineno, p.col_offset), (p.end_lineno, p.end_col_offset)) if p and p.lineno else None
        ins.append({'off': i.offset, 'op': i.opname, 'arg': i.arg, 'argrepr': i.argrepr, 'line': i.line_number,
                    'span': sp, 'caches': i.cache_info and sum(n for _, n, _ in i.cache_info) or 0,
                    'bytes': list(co.co_code[i.offset:i.offset + 2]), 'jump': i.jump_target})
    return {'name': co.co_name, 'qualname': co.co_qualname, 'names': list(co.co_names),
            'consts': [const_repr(c) for c in co.co_consts], 'locals': list(co.co_varnames),
            'size_code_bytes': len(co.co_code), 'sizeof': sys.getsizeof(co), 'ins': ins}

# The order the steps ran in, and which step printed what. sys.monitoring reports every instruction of
# these code objects as it is about to run; text printed in between belongs to the step before it.
M = sys.monitoring
TOOL = M.DEBUGGER_ID
M.use_tool_id(TOOL, 'eti-capture')
ran, buf, seen = [], io.StringIO(), [0]
def note_output():
    n = len(buf.getvalue())
    if n > seen[0] and ran: ran[-1]['printed'] = ran[-1].get('printed', '') + buf.getvalue()[seen[0]:n]
    seen[0] = n
def on_instruction(co, offset):
    note_output(); ran.append({'code': co.co_qualname, 'off': offset})
M.register_callback(TOOL, M.events.INSTRUCTION, on_instruction)
for co in codes: M.set_local_events(TOOL, co, M.events.INSTRUCTION)
with contextlib.redirect_stdout(buf):
    exec(module, {'__name__': '__main__', '__builtins__': __builtins__})
note_output()
for co in codes: M.set_local_events(TOOL, co, 0)
M.register_callback(TOOL, M.events.INSTRUCTION, None)
M.free_tool_id(TOOL)
stack_effects = {}
for co in codes:
    for i in dis.get_instructions(co):
        if i.opcode in dis.hasjump or i.opname.startswith('FOR_ITER'):
            stack_effects[i.opname] = [dis.stack_effect(i.opcode, i.arg, jump=False), dis.stack_effect(i.opcode, i.arg, jump=True)]
        else:
            stack_effects[i.opname] = [dis.stack_effect(i.opcode, i.arg)]

# After a normal run (no monitoring), which specialized form each step has
module2 = compile(raw, path, 'exec')
g = {'__name__': '__main__', '__builtins__': __builtins__}
with contextlib.redirect_stdout(io.StringIO()):
    exec(module2, g)
after = {}
for co in [module2] + [v.__code__ for v in g.values() if hasattr(v, '__code__') and v.__code__.co_filename == path]:
    after[co.co_qualname] = {i.offset: i.opname for i in dis.get_instructions(co, adaptive=True)}

# Sizes of the objects the plates point to
sizes = {repr(k): sys.getsizeof(v) for k, v in {
    'Hello,': 'Hello,', 'Ada': 'Ada', 'Grace': 'Grace', ('Ada', 'Grace'): ('Ada', 'Grace'), None: None}.items()}
sizes['print'] = sys.getsizeof(print)
sizes['function'] = sys.getsizeof(g.get('greet'))
sizes['tuple_iterator'] = sys.getsizeof(iter(('Ada', 'Grace')))

variants = {}
for co in codes:
    for i in dis.get_instructions(co):
        variants[i.opname] = sorted(opcode._specializations.get(i.opname, []))

json.dump({'python': sys.version, 'file': path.rsplit('/', 1)[-1], 'source': src, 'bytes': list(raw),
           'tokens': tokens, 'ast': nodes, 'codes': [code_facts(c) for c in codes], 'ran': ran,
           'stdout': buf.getvalue(), 'stack_effects': stack_effects, 'after_run': after,
           'sizes': sizes, 'variants': variants}, open(out, 'w'), indent=1)
print('captured', len(tokens), 'tokens,', len(nodes), 'nodes,', sum(len(c.co_code) // 2 for c in codes), 'code units,',
      len(ran), 'steps ran', file=sys.stderr)
