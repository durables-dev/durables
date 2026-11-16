/**
 * The Node.js built-in modules that can be imported without the `node:` prefix, which
 * Dependencies leaves out. Taken from Node 22's `builtinModules`, by top-level name, without
 * the private `_`-prefixed modules. A subpath such as `fs/promises` is read as its top-level
 * module. Anything imported with the `node:` prefix is a built-in whether or not it is listed.
 */
export const nodeBuiltinModules: ReadonlySet<string> = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/** Node's prefix for its built-in modules, as in `node:fs`. */
const nodePrefix = "node:";

/** Whether a module is a Node.js built-in: on the list, or imported with the `node:` prefix. */
export const isNodeBuiltin = (name: string) =>
  name.startsWith(nodePrefix) || nodeBuiltinModules.has(name);
