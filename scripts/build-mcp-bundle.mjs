// Bundles the MCP server into one file for the installer, which ships no
// node_modules except the native ONNX runtime and playwright-core:
//
//   electron/mcp/server.cjs
//
// The installed DrawFlow.exe runs it in Node mode (ELECTRON_RUN_AS_NODE=1), so
// an MCP client needs nothing else: no Node.js, no clone, no build. See mcp/README.md.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'mcp/server.mjs')],
  outfile: path.join(root, 'electron/mcp/server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // playwright-core and the native runtime ship as files (see "build.files" in package.json)
  external: ['playwright-core', 'onnxruntime-node', 'electron'],
  // transformers.js pulls in sharp for images; a voice never needs it
  alias: { sharp: path.join(root, 'scripts/sharp-stub.cjs') },
  // the sources are ES modules: give the CommonJS bundle what they read at startup
  define: { 'import.meta.url': '__bundleUrl' },
  banner: { js: "const __bundleUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'warning',
  legalComments: 'eof',
});
console.log('MCP server bundled');
