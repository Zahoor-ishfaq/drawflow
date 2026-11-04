// Help → Connect to AI apps: adds the installed DrawFlow to an AI app's MCP
// settings, so nobody has to edit a config file by hand.
//
// An MCP client starts this app's own exe in Node mode (ELECTRON_RUN_AS_NODE)
// on the bundled server, which needs no Node.js, clone or build. It has to be
// Node mode: a normal Electron start writes a blank line to stdout on Windows,
// and stdout belongs to the protocol.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function serverEntry(exe, script) {
  return { command: exe, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

/** The settings to paste into any other MCP client. */
function settingsText(entry) {
  return JSON.stringify({ mcpServers: { drawflow: entry } }, null, 2);
}

/** The AI apps on this computer, and where each keeps its MCP settings. */
function findApps({
  home = os.homedir(),
  appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
  localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
} = {}) {
  const apps = [];
  const add = (name, folder, file) => { if (fs.existsSync(folder)) apps.push({ name, file: path.join(folder, file) }); };
  add('Claude Desktop', path.join(appData, 'Claude'), 'claude_desktop_config.json');
  // the Microsoft Store version keeps its settings inside its own package folder
  const packages = path.join(localAppData, 'Packages');
  if (fs.existsSync(packages)) {
    for (const name of fs.readdirSync(packages)) {
      if (/^Claude_/i.test(name)) add('Claude Desktop', path.join(packages, name, 'LocalCache', 'Roaming', 'Claude'), 'claude_desktop_config.json');
    }
  }
  add('Cursor', path.join(home, '.cursor'), 'mcp.json');
  add('Windsurf', path.join(home, '.codeium', 'windsurf'), 'mcp_config.json');
  return apps;
}

/** Add DrawFlow to one settings file, leaving everything else in it alone. Keeps a copy of the file as it was. */
function connect(file, entry) {
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const textNow = (original ?? '').replace(/^﻿/, '').trim();
  const config = textNow ? JSON.parse(textNow) : {};
  if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new Error('it is not a settings object');
  config.mcpServers = { ...config.mcpServers, drawflow: entry };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backup = `${file}.before-drawflow`;
  if (original !== null && !fs.existsSync(backup)) fs.writeFileSync(backup, original);
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(temp, file);
}

module.exports = { serverEntry, settingsText, findApps, connect };
