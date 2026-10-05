# Run inside Linux (for example WSL Ubuntu):  bash capture-example.sh greet
# Captures everything prototype v8 shows for the Example prototype/examples/<name>.py, on the exact
# CPython 3.14.2 build used for every capture (python-build-standalone 20251205, x86-64 Linux):
#   data/example-<name>-cpython-3.14.2.json                 facts Python records, plus Try it yourself outputs
#   data/handler-paths-<name>-cpython-3.14.2-linux-x86_64.json  which machine instructions ran, per step and run (gdb, 3 identical
#                                                               runs), and the numbers inc and dec instructions changed
#   data/machine-code-<name>-cpython-3.14.2-linux-x86_64.json   the machine code of every handler that ran
# gdb and strace are downloaded and unpacked under /tmp, never installed.
set -e
NAME="${1:?usage: capture-example.sh <example name>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/../data"
mkdir -p /tmp/eti && cd /tmp/eti
[ -x python/bin/python3 ] || { curl -sL "https://github.com/astral-sh/python-build-standalone/releases/download/20251205/cpython-3.14.2+20251205-x86_64-unknown-linux-gnu-install_only.tar.gz" -o py.tgz && tar xzf py.tgz; }
echo "bdeee805c9267caee4c13c811de2082ca08c14e434280ef3bd7fcc31a90f7bd3  python/bin/python3.14" | sha256sum -c -
[ -x venv/bin/python ] || { python/bin/python3 -m venv venv >/dev/null && venv/bin/pip install -q pyelftools==0.33 capstone==5.0.9; }
if [ ! -x tools/usr/bin/gdb ] || [ ! -x tools/usr/bin/strace ]; then
  mkdir -p debs && (cd debs && for p in gdb libbabeltrace1 libipt2 libsource-highlight4t64 libdebuginfod1t64 strace libunwind8; do apt-get download $p >/dev/null 2>&1 || echo "could not download $p" >&2; done)
  for d in debs/*.deb; do dpkg-deb -x "$d" tools; done
fi
export LD_LIBRARY_PATH=/tmp/eti/tools/usr/lib/x86_64-linux-gnu
tools/usr/bin/gdb --version | head -1
tools/usr/bin/strace -V | head -1

mkdir -p run && cp "$HERE/../examples/$NAME.py" run/ && cd run
PY=/tmp/eti/python/bin/python3.14
# Commands for "Try it yourself", with output going to a pseudo-terminal, as it would in a terminal window
cap() { script -qec "$2" /dev/null | tr -d '\r' > "/tmp/eti/out-$1.txt"; }
cap run "$PY $NAME.py"
cap bytes "$PY -c \"print(list(open('$NAME.py', 'rb').read()))\""
cap tokenize "$PY -m tokenize $NAME.py"
cap ast "$PY -m ast $NAME.py"
cap dis "$PY -m dis $NAME.py"
cap strace "/tmp/eti/tools/usr/bin/strace -e trace=write $PY $NAME.py"
cap time "$PY -c \"import time; t = time.perf_counter(); exec(open('$NAME.py').read()); print(time.perf_counter() - t)\""
$PY "$HERE/capture-example.py" "$NAME.py" /tmp/eti/facts.json

# Trace every handler the program can use: each step's generic form and its specialized variants
OPS="$($PY - <<'EOF'
import json
d = json.load(open('/tmp/eti/facts.json'))
ops = set()
for op, vs in d['variants'].items(): ops.add(op); ops.update(vs)
print(' '.join(sorted(ops)))
EOF
)"
for i in 1 2 3; do
  TRACE_FILE="$NAME.py" TRACE_OPS="$OPS" TRACE_OUT=/tmp/eti/trace$i.json \
    script -qec "/tmp/eti/tools/usr/bin/gdb -nx -batch -x '$HERE/trace-handler-paths.py' --args $PY $NAME.py" /dev/null
done
RAN="$($PY - "$DATA/handler-paths-$NAME-cpython-3.14.2-linux-x86_64.json" "$NAME" <<'EOF'
import json, sys
runs = [json.load(open('/tmp/eti/trace%d.json' % i))['runs'] for i in (1, 2, 3)]
path = lambda rs: [(r['op'], r['code'], r['offset'], [(s['pc'], s.get('value')) for s in r['steps']], [c['fn'] for c in r['calls']]) for r in rs]
same = path(runs[0]) == path(runs[1]) == path(runs[2])
print('3 runs took identical paths:', same, file=sys.stderr)
if not same: sys.exit(1)
for r in runs[0]:
    for c in r['calls']: c.pop('returned')  # heap addresses differ between runs; not needed on the page
src = open(sys.argv[2] + '.py').read()
json.dump({'binary': 'python-build-standalone 20251205, cpython-3.14.2, x86_64-unknown-linux-gnu',
           'program': src, 'how': 'gdb stepi through each handler, 3 identical runs, stdout to a pty',
           'runs': runs[0]}, open(sys.argv[1], 'w'), separators=(',', ':'))
print(' '.join(sorted({r['op'] for r in runs[0]})))
EOF
)"
echo "handlers that ran: $RAN"
EXTRACT_ALL_PARTS=1 /tmp/eti/venv/bin/python "$HERE/extract-machine-code.py" "$DATA/machine-code-$NAME-cpython-3.14.2-linux-x86_64.json" $RAN

PLATFORM="Linux ($(. /etc/os-release && echo "$NAME $VERSION_ID")$(grep -qi microsoft /proc/version && echo ' under WSL2' || true), x86-64), python-build-standalone 20251205"
$PY - "$DATA/example-$NAME-cpython-3.14.2.json" "$PLATFORM" <<'EOF'
import json, sys
d = json.load(open('/tmp/eti/facts.json'))
d['commands'] = {k: open('/tmp/eti/out-%s.txt' % k).read() for k in ('run', 'bytes', 'tokenize', 'ast', 'dis', 'strace', 'time')}
d['platform'] = sys.argv[2]
json.dump(d, open(sys.argv[1], 'w'), indent=1)
EOF
echo done
