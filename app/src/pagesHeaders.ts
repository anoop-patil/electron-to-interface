/**
 * Reads a Cloudflare Pages `_headers` file: each line that isn't indented is a path, which may end in a `*` splat that
 * matches anything, and each indented `Name: value` line under it is a header for that path. Lines starting with `#`
 * are comments. Pages supports more, such as placeholders; this reads what public/_headers uses, and refuses the rest.
 */
export function readPagesHeaders(file: string) {
  const rules: { path: RegExp; headers: [string, string][] }[] = [];
  for (const line of file.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!/^\/[^:!*]*\*?$/.test(line)) throw new Error(`_headers: a path this reader can't match: ${line}`);
      const pattern = line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*');
      rules.push({ path: new RegExp(`^${pattern}$`), headers: [] });
      continue;
    }
    const header = /^\s+([\w-]+):\s*(.*)$/.exec(line);
    if (!header || !rules.length) throw new Error(`_headers: a line this reader can't read: ${line}`);
    rules.at(-1)!.headers.push([header[1], header[2].trim()]);
  }

  /** The headers Pages sends for `path`: where several rules set the same header, their values joined with a comma. */
  return (path: string) => {
    const headers = new Map<string, string>();
    for (const rule of rules) {
      if (!rule.path.test(path)) continue;
      for (const [name, value] of rule.headers) headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
    }
    return headers;
  };
}
