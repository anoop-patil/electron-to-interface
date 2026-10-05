# Compares freshly captured data with the committed copy, for CI: python compare-data.py <committed dir> <new dir>
# Every file must match, except what changes from one machine or run to the next: how long a program took (the
# last line of the timing command's output), the platform it ran on, and the memory address Python prints for a
# code object (<code object greet at 0x7d70bfe76100, ...>). Exits 1 if anything else differs.
import json, pathlib, re, sys

def masked(value):
    if isinstance(value, dict):
        out = {k: masked(v) for k, v in value.items() if k != 'platform'}
        if isinstance(out.get('commands'), dict) and 'time' in out['commands']:
            lines = out['commands']['time'].rstrip('\n').split('\n')
            out['commands']['time'] = '\n'.join(lines[:-1] + ['<seconds>'])
        return out
    if isinstance(value, list): return [masked(v) for v in value]
    if isinstance(value, str): return re.sub(r' at 0x[0-9a-f]+', ' at 0x...', value)
    return value

committed, new = (pathlib.Path(arg) for arg in sys.argv[1:3])
names = sorted({p.name for p in committed.glob('*.json')} | {p.name for p in new.glob('*.json')})
differ = []
for name in names:
    one, other = committed / name, new / name
    if not one.exists() or not other.exists():
        differ.append(name + (' is new' if not one.exists() else ' was not captured'))
    elif masked(json.loads(one.read_text('utf-8'))) != masked(json.loads(other.read_text('utf-8'))):
        differ.append(name + ' differs')
for line in differ: print(line)
print('%d of %d files match' % (len(names) - len(differ), len(names)))
sys.exit(1 if differ else 0)
