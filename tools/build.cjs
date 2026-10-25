// Windows-only local Windhawk build. Does not install or restart Brave.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

function main() {
  if (process.platform !== 'win32') throw Error('Windhawk builds require Windows');
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'brave-acrylic.wh.cpp');
  const text = fs.readFileSync(source, 'utf8');
  const version = /^\/\/ @version\s+(\d+\.\d+(?:\.\d+)?)\s*$/m.exec(text)?.[1];
  if (!version) throw Error('Missing mod version');
  const out = path.resolve(process.env.BRAVE_BUILD_DIR || path.join(root, 'build'));
  fs.mkdirSync(path.join(out, 'temp'), {recursive:true});
  const compiler = process.env.WINDHAWK_CXX || 'C:/Program Files/Windhawk/Compiler/bin/clang++.exe';
  const library = process.env.WINDHAWK_LIB || 'C:/Program Files/Windhawk/Engine/1.7.3/64/windhawk.lib';
  const dll = path.join(out, `brave-acrylic-${version}.dll`);
  const result = spawnSync(compiler, [
    '--target=x86_64-w64-mingw32', '-std=c++23', '-O2', '-static', '-Werror', '-shared',
    '-DUNICODE', '-D_UNICODE', '-DWINVER=0x0A00', '-D_WIN32_WINNT=0x0A00',
    '-D_WIN32_IE=0x0A00', '-DNTDDI_VERSION=0x0A000008', '-D__USE_MINGW_ANSI_STDIO=0',
    '-DWH_MOD', '-DWH_MOD_ID=L"brave-acrylic"', `-DWH_MOD_VERSION=L"${version}"`,
    '-include', 'windhawk_api.h', library, source, '-Wl,--export-all-symbols',
    '-lshell32', '-luser32', '-o', dll,
  ], {encoding:'utf8', windowsHide:true,
    env:{...process.env, TEMP:path.join(out, 'temp'), TMP:path.join(out, 'temp')}});
  fs.writeFileSync(path.join(out, 'build.log'), (result.stdout || '') + (result.stderr || ''));
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw Error('Build failed: ' + (result.error || result.status));
  console.log(`Built ${dll} (${fs.statSync(dll).size} bytes). Not installed.`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
