# Run inside Linux (for example WSL Ubuntu). Downloads the exact CPython 3.14.2 build used for every capture,
# installs pinned pyelftools + capstone into a throwaway venv under /tmp, and writes the handler disassembly as JSON.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /tmp/eti && cd /tmp/eti
[ -x python/bin/python3 ] || { curl -sL "https://github.com/astral-sh/python-build-standalone/releases/download/20251205/cpython-3.14.2+20251205-x86_64-unknown-linux-gnu-install_only.tar.gz" -o py.tgz && tar xzf py.tgz; }
[ -x venv/bin/python ] || { python/bin/python3 -m venv venv >/dev/null && venv/bin/pip install -q pyelftools==0.33 capstone==5.0.9; }
echo "bdeee805c9267caee4c13c811de2082ca08c14e434280ef3bd7fcc31a90f7bd3  python/bin/python3.14" | sha256sum -c -
venv/bin/python "$HERE/extract-machine-code.py" "$HERE/../data/machine-code-cpython-3.14.2-linux-x86_64.json"
