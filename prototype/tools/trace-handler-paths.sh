# Run inside Linux (for example WSL Ubuntu). Records which machine instructions of each opcode handler run
# for hello.py, using gdb on the exact CPython 3.14.2 build used for every capture on the page.
# gdb is downloaded and unpacked under /tmp, never installed. Output goes to a pseudo-terminal, as in the
# timing captures. The trace runs 3 times; the script fails unless all 3 runs took the same path and saw the
# same values. It also times hello.py once, for Try it yourself:
#   data/handler-paths-cpython-3.14.2-linux-x86_64.json  which machine instructions ran (gdb, 3 identical runs)
#   data/example-hello-cpython-3.14.2.json               the timing command's output, and the platform
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /tmp/eti && cd /tmp/eti
[ -x python/bin/python3 ] || { curl -sL "https://github.com/astral-sh/python-build-standalone/releases/download/20251205/cpython-3.14.2+20251205-x86_64-unknown-linux-gnu-install_only.tar.gz" -o py.tgz && tar xzf py.tgz; }
echo "bdeee805c9267caee4c13c811de2082ca08c14e434280ef3bd7fcc31a90f7bd3  python/bin/python3.14" | sha256sum -c -
if [ ! -x gdb/usr/bin/gdb ]; then
  mkdir -p debs && (cd debs && for p in gdb libbabeltrace1 libipt2 libsource-highlight4t64 libdebuginfod1t64; do apt-get download $p >/dev/null 2>&1 || echo "could not download $p" >&2; done)
  for d in debs/*.deb; do dpkg-deb -x "$d" gdb; done
fi
export LD_LIBRARY_PATH=/tmp/eti/gdb/usr/lib/x86_64-linux-gnu
gdb/usr/bin/gdb --version | head -1
printf 'print("Hello World!")\n' > hello.py
for i in 1 2 3; do
  TRACE_OUT=/tmp/eti/run$i.json script -qec "gdb/usr/bin/gdb -nx -batch -x '$HERE/trace-handler-paths.py' --args python/bin/python3.14 hello.py" /dev/null
done
python/bin/python3 - "$HERE/../data/handler-paths-cpython-3.14.2-linux-x86_64.json" <<'EOF'
import json, sys
runs = [json.load(open('/tmp/eti/run%d.json' % i))['runs'] for i in (1, 2, 3)]
path = lambda rs: [(r['op'], r['offset'], [(s['pc'], s.get('value')) for s in r['steps']], [c['fn'] for c in r['calls']]) for r in rs]
same = path(runs[0]) == path(runs[1]) == path(runs[2])
print('3 runs took identical paths:', same)
if not same: sys.exit(1)
for r in runs[0]:
    for c in r['calls']: c.pop('returned')  # heap addresses differ between runs; not needed on the page
json.dump({'binary': 'python-build-standalone 20251205, cpython-3.14.2, x86_64-unknown-linux-gnu',
           'program': 'print("Hello World!")', 'how': 'gdb stepi through each handler, 3 identical runs, stdout to a pty',
           'runs': runs[0]}, open(sys.argv[1], 'w'), separators=(',', ':'))
EOF
# The timing command of Try it yourself, with output going to a pseudo-terminal, as it would in a terminal window
TIME="$(script -qec "python/bin/python3.14 -c \"import time; t = time.perf_counter(); exec(open('hello.py').read()); print(time.perf_counter() - t)\"" /dev/null | tr -d '\r')"
PLATFORM="Linux ($(. /etc/os-release && echo "$NAME $VERSION_ID")$(grep -qi microsoft /proc/version && echo ' under WSL2'), x86-64), python-build-standalone 20251205"
python/bin/python3 - "$HERE/../data/example-hello-cpython-3.14.2.json" "$TIME" "$PLATFORM" <<'EOF'
import json, sys
json.dump({'file': 'hello.py', 'commands': {'time': sys.argv[2] + '\n'}, 'platform': sys.argv[3]}, open(sys.argv[1], 'w'), indent=1)
EOF
