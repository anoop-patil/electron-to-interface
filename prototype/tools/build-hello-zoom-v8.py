# Builds prototype/hello-zoom-v8.html from hello-zoom-v8.template.html and the data capture-example.sh wrote
# to prototype/data/. It also takes v7's CSS and concept cards from hello-zoom-v7.html, patching the cards'
# hello-world facts with greet.py's. Every patch is asserted, so a changed input fails loudly.
# Usage: python build-hello-zoom-v8.py [body.html]   (body.html: the page without its first 6 wrapper lines,
# which is what gets published as an artifact)
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
ex = json.loads((ROOT / 'data/example-greet-cpython-3.14.2.json').read_text())
tr = json.loads((ROOT / 'data/handler-paths-greet-cpython-3.14.2-linux-x86_64.json').read_text())
mc = json.loads((ROOT / 'data/machine-code-greet-cpython-3.14.2-linux-x86_64.json').read_text())

SRC = ex['source']
CODES = ex['codes']
CI = {c['qualname']: i for i, c in enumerate(CODES)}

# ---------- Static steps ----------
STEPS = []
for ci, c in enumerate(CODES):
    for k, ins in enumerate(c['ins']):
        STEPS.append({'id': 'bc-%d-%d' % (ci, ins['off']), 'c': ci, 'k': k, 'off': ins['off'], 'op': ins['op'],
                      'arg': ins['arg'], 'argrepr': ins['argrepr'] if not ins['argrepr'].startswith('<code') else 'greet',
                      'line': ins['line'], 'span': ins['span'], 'caches': ins['caches']})
SI = {(s['c'], s['off']): i for i, s in enumerate(STEPS)}

# ---------- Timeline: one entry per step that ran, from the gdb trace ----------
runs = tr['runs']
groups = []
for ti, r in enumerate(runs):
    key = (CI[r['code']], r['offset'])
    if groups and groups[-1]['key'] == key and runs[ti - 1]['next'].split()[0].split('.')[0] == '_TAIL_CALL_' + r['op']:
        groups[-1]['h'].append(ti)
    else:
        groups.append({'key': key, 'h': [ti]})
# greet's RESUME on the second call has no handler run of its own: RESUME_CHECK's code ran at the end of
# CALL_PY_EXACT_ARGS (gdb recorded generated_cases.c.h lines 10543-10571 inside that handler).
TL = []
for g in groups:
    TL.append(g)
    last = runs[g['h'][-1]]
    if last['op'] == 'CALL_PY_EXACT_ARGS':
        assert any(s['src'] and s['src'][0] == 'generated_cases.c.h' and 10543 <= s['src'][1] <= 10571 for s in last['steps'])
        TL.append({'key': (CI['greet'], 0), 'h': [], 'folded': True})
# Cross-check with the Observed order from sys.monitoring (which doesn't report RESUME)
mon = [(CI[r['code']], r['off']) for r in ex['ran']]
assert [t['key'] for t in TL if STEPS[SI[t['key']]]['op'] != 'RESUME'] == mon, 'gdb order differs from sys.monitoring order'
printed = {}
j = 0
for t in TL:
    if STEPS[SI[t['key']]]['op'] == 'RESUME': continue
    if 'printed' in ex['ran'][j]: t['printed'] = ex['ran'][j]['printed']
    j += 1
OUTL = ex['stdout'].rstrip('\n').split('\n')

# ---------- Plates (Derived): replay each step with Python's rules ----------
CONSTS = {('<module>', 0): 'K', ('<module>', 1): 'N', ('<module>', 2): 'T', ('greet', 0): 'H', ('greet', 1): 'N'}
frames = []
items = iter(['A', 'G'])
trip, outn = 0, 0
for i, t in enumerate(TL):
    s = STEPS[SI[t['key']]]
    code = CODES[s['c']]['qualname']
    op = s['op']
    if op == 'RESUME' and code == '<module>': frames.append({'c': s['c'], 'p': [], 'v': []})
    f = frames[-1]
    before = len(f['p'])
    if op == 'RESUME': pass
    elif op == 'LOAD_CONST': f['p'].append(CONSTS[(code, s['arg'])])
    elif op == 'MAKE_FUNCTION': f['p'].pop(); f['p'].append('F')
    elif op == 'STORE_NAME':
        v = f['p'].pop(); name = CODES[s['c']]['names'][s['arg']]
        f['v'] = [x for x in f['v'] if x[0] != name] + [[name, v]]
    elif op == 'GET_ITER': f['p'].pop(); f['p'].append('I')
    elif op == 'FOR_ITER':
        nxt = STEPS[SI[TL[i + 1]['key']]]
        if nxt['op'] == 'STORE_NAME': f['p'].append(next(items)); trip += 1
        else: t['exhausted'] = True; trip += 1
    elif op == 'LOAD_NAME': f['p'].append(dict(f['v'])[CODES[s['c']]['names'][s['arg']]])
    elif op == 'PUSH_NULL': f['p'].append('0')
    elif op == 'LOAD_GLOBAL': f['p'] += ['P', '0']
    elif op == 'LOAD_FAST_BORROW': f['p'].append(dict(f['v'])['name'])
    elif op == 'CALL':
        n = s['arg']; args = f['p'][-n:]; callee = f['p'][-n - 2]
        del f['p'][-n - 2:]
        if callee == 'F': frames.append({'c': CI['greet'], 'p': [], 'v': [['name', args[0]]]})
        else: f['p'].append('N'); t['out'] = outn; outn += 1
    elif op in ('POP_TOP', 'POP_ITER'): f['p'].pop()
    elif op == 'JUMP_BACKWARD': pass
    elif op == 'RETURN_VALUE':
        v = f['p'].pop(); frames.pop()
        if frames: frames[-1]['p'].append(v)
    else: raise SystemExit('no rule for ' + op)
    # Where Python's own stack effect applies directly, the replay must agree with it
    if op not in ('CALL', 'RETURN_VALUE', 'FOR_ITER', 'RESUME') and frames and frames[-1] is f:
        assert len(f['p']) - before == ex['stack_effects'][op][0], (op, len(f['p']) - before)
    t['frames'] = json.loads(json.dumps(frames))
    t['trip'] = trip
    t['s'] = SI[t['key']]
assert outn == len(OUTL) and not frames
for t in TL:
    if 'printed' in t: assert OUTL[t['out']] + '\n' == t['printed']
MAXP = max(len(f['p']) for t in TL for f in t['frames'])

# ---------- Which C lines each handler run shows (keys into CPAIRS) ----------
def ckey(r):
    op, calls, nxt = r['op'], [c['fn'] for c in r['calls']], r['next']
    if op == 'CALL':
        if '_Py_Specialize_Call' in calls: return 'CALL/spec'
        return 'CALL/py' if r['code'] == '<module>' else 'CALL/c'
    if op == 'LOAD_GLOBAL': return 'LOAD_GLOBAL/spec' if '_Py_Specialize_LoadGlobal' in calls else 'LOAD_GLOBAL'
    if op == 'FOR_ITER': return 'FOR_ITER/spec' if '_TAIL_CALL_FOR_ITER_TUPLE' in nxt else 'FOR_ITER'
    if op == 'FOR_ITER_TUPLE': return 'FOR_ITER_TUPLE/end' if '_TAIL_CALL_POP_ITER' in nxt else 'FOR_ITER_TUPLE'
    return op
TRACE = []
for r in runs:
    parts = {}
    for st in r['steps']: parts[st['part']] = parts.get(st['part'], 0) + 1
    cnt = {}
    for c in r['calls']:
        fn = c['fn'].split('.llvm.')[0]; cnt[fn] = cnt.get(fn, 0) + 1
    TRACE.append({'op': r['op'], 'key': ckey(r), 'pcs': ' '.join(st['pc'] for st in r['steps']),
                  'parts': parts, 'calls': [[k, v] for k, v in cnt.items()],
                  'next': r['next'].split()[0].split('.llvm.')[0].replace('_TAIL_CALL_', '')})

# ---------- Tokens and syntax tree ----------
TOK = []
for t in ex['tokens']:
    if t['type'] == 'ENCODING': continue
    TOK.append({'id': 'tok-%d' % (len(TOK) + 1), 'type': t['type'], 'exact': t['exact'], 'text': t['text'],
                'span': t['span'], 'start': t['start'], 'end': t['end']})
AST = []
for i, n in enumerate(ex['ast']):
    AST.append({'id': 'ast-%d' % (i + 1), 'type': n['type'], 'parent': None if n['parent'] is None else 'ast-%d' % (n['parent'] + 1),
                'field': n['field'], 'kids': [[f, 'ast-%d' % (k + 1)] for f, k in n['kids']], 'span': n['span'],
                'label': n.get('id') or n.get('name') or n.get('arg') or n.get('value') or '', 'ctx': n.get('ctx')})

def strip_ansi(s): return re.sub(r'\x1b\[[0-9;]*m', '', s)
cmd = dict(ex['commands'])
st = strip_ansi(cmd['strace'])
for line in OUTL: st = st.replace(line + '\n', '', 1)   # the program's own output, printed into the middle of strace's lines
cmd['strace'] = st
cmd['tokenize'] = '\n'.join(l.rstrip() for l in cmd['tokenize'].split('\n'))
for k in cmd: cmd[k] = cmd[k].rstrip('\n')

sizes = ex['sizes']
OBJS = {'K': {'name': 'greet\u2019s recipe card', 'sz': CODES[1]['sizeof']},
        'F': {'name': 'the function greet', 'sz': sizes['function']},
        'T': {'name': '("Ada", "Grace")', 'sz': sizes["('Ada', 'Grace')"]},
        'I': {'name': 'a walker through ("Ada", "Grace")', 'sz': sizes['tuple_iterator']},
        'A': {'name': '"Ada"', 'sz': sizes["'Ada'"]}, 'G': {'name': '"Grace"', 'sz': sizes["'Grace'"]},
        'P': {'name': 'the print function', 'sz': sizes['print']}, 'H': {'name': '"Hello,"', 'sz': sizes["'Hello,'"]},
        'N': {'name': 'None', 'sz': sizes['None']}}

MCD = {'binary': mc['binary'], 'table': mc['table'], 'ops': mc['ops']}
used = {r['op'] for r in runs}
assert used == set(MCD['ops']), used ^ set(MCD['ops'])

def js(name, v): return 'var %s = %s;\n' % (name, json.dumps(v, separators=(',', ':'), ensure_ascii=True))
data = (js('SRC', SRC) + js('FILE', ex['file']) + js('OUTL', OUTL) + js('TOK', TOK) + js('AST', AST)
        + js('CODES', [{'name': c['name'], 'names': c['names'], 'consts': c['consts'], 'locals': c['locals'],
                        'sizeof': c['sizeof'], 'nbytes': c['size_code_bytes']} for c in CODES])
        + js('STEPS', STEPS) + js('AFTER', ex['after_run'])
        + js('TL', [{k: t[k] for k in ('s', 'h', 'frames', 'trip', 'folded', 'out', 'exhausted', 'printed') if k in t} for t in TL])
        + js('TRACE', TRACE) + js('OBJS', OBJS) + js('MAXP', MAXP) + js('CMD', cmd) + js('SIZES', sizes))
mcd = js('MCD', MCD)
print('steps', len(STEPS), 'timeline', len(TL), 'handler runs', len(TRACE), 'max plates', MAXP, file=sys.stderr)

# ---------- Assemble ----------
v7 = (ROOT / 'hello-zoom-v7.html').read_text(encoding='utf-8')
css = v7[v7.index('<style>\n/* Layout') + len('<style>\n'):v7.index('</style>\n\n<div class="app">')]
tpl = (HERE / 'hello-zoom-v8.template.html').read_text(encoding='utf-8')
def put(s, mark, val):
    assert s.count(mark) == 1, mark; return s.replace(mark, val)
page = put(tpl, '/*@V7CSS@*/', css)
page = put(page, '/*@DATA@*/', data)
page = put(page, '/*@MCD@*/', mcd)
cards = v7[v7.index('var UTF8_TABLE'):v7.index('\n\n/* ---------- Elements')]
c0, c1 = CODES
def cr(old, new):
    global cards
    assert cards.count(old) == 1, old; cards = cards.replace(old, new)
cr('which is why your file might be 21 bytes instead of 22.', 'which is why your file might be %d bytes instead of %d.' % (len(ex['bytes']) - 1, len(ex['bytes'])))
cr('a name like print, a piece of punctuation like (, a piece of text like "Hello World!"', 'a name like greet, a piece of punctuation like (, a piece of text like "Ada"')
cr('That bookkeeping is why the 12-letter text "Hello World!" takes 53 bytes.', 'That bookkeeping is why the 3-letter text "Ada" takes %d bytes.' % sizes["'Ada'"])
cr('Where files live: your hello.py,', 'Where files live: your greet.py,')
cr(' A small Python program like yours uses roughly 10 MB of RAM, almost all of it for Python itself.', ' For a small program like yours, almost all of it goes to Python itself.')
cr("what:'Your 8 steps (22 bytes of bytecode), plus two small lists: the names your code uses (just print) and the fixed values it uses (\"Hello World!\" and None). Python keeps them together in one object of 232 bytes.",
   "what:'Your program has two recipe cards. Your file\\u2019s card has %d steps (%d bytes of bytecode), the names it uses (greet and person) and its fixed values (greet\\u2019s card, None and (\"Ada\", \"Grace\")), all in one object of %d bytes. greet has its own card: %d steps (%d bytes), the name print, the fixed values \"Hello,\" and None, and one variable, name, in %d bytes." % (
       len(c0['ins']), c0['size_code_bytes'], c0['sizeof'], len(c1['ins']), c1['size_code_bytes'], c1['sizeof']))
cr("size:'232 bytes for your program'", "size:'%d + %d bytes for your program'" % (c0['sizeof'], c1['sizeof']))
cr("Your program uses three: the print function (72 bytes), the text \"Hello World!\" (53 bytes: 12 for the letters, 41 for Python\\u2019s bookkeeping) and None (16 bytes; there is only one None in all of Python).",
   "Your program uses nine: greet\\u2019s recipe card (%d bytes), the function greet (%d), the pair (\"Ada\", \"Grace\") (%d), a walker that goes through it (%d), \"Ada\" (%d bytes: 3 for the letters, %d for Python\\u2019s bookkeeping), \"Grace\" (%d), the print function (%d), \"Hello,\" (%d) and None (%d; there is only one None in all of Python)." % (
       c1['sizeof'], sizes['function'], sizes["('Ada', 'Grace')"], sizes['tuple_iterator'], sizes["'Ada'"], sizes["'Ada'"] - 3, sizes["'Grace'"], sizes['print'], sizes["'Hello,'"], sizes['None']))
cr("Your program never needs more than 3 plates.", "Each running piece of code has its own stack, in its own [[frame|frame]]. Your program never needs more than %d plates in one frame." % MAXP)
cr("size:'3 plates for your program'", "size:'%d plates for your program'" % MAXP)
cr('We used one called gdb to run your program one instruction at a time inside each handler, and wrote down every instruction that ran.', 'We used one called gdb to run your program one instruction at a time inside each handler, every time a handler ran, and wrote down every instruction that ran.')
assert 'Hello World' not in cards and 'hello.py' not in cards, [l for l in cards.split('\n') if 'Hello World' in l or 'hello.py' in l]
page = put(page, '/*@CARDS@*/', cards)
body = page
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>body{margin:0}</style>\n')
out_local = ROOT / 'hello-zoom-v8.html'
out_local.write_text(head + body, encoding='utf-8', newline='\n')
if len(sys.argv) > 1: pathlib.Path(sys.argv[1]).write_text(body, encoding='utf-8', newline='\n')
print('wrote', out_local.relative_to(ROOT.parent), len(head + body), 'chars', file=sys.stderr)
