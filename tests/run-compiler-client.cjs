'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),[dll,cache,outArg]=process.argv.slice(2);
if(!dll||!cache)throw Error('Usage: node tests/run-compiler-client.cjs chrome.dll cache.txt [output-directory]');
const out=path.resolve(outArg||'D:/Work/windhawk/scratch/brave-compiler-client-20261029');fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,'compiler-client.exe'),options={encoding:'utf8',cwd:root,windowsHide:true,timeout:120000,env:{...process.env,TEMP:out,TMP:out}};
let r=cp.spawnSync(process.env.WINDHAWK_CXX||'C:/Program Files/Windhawk/Compiler/bin/clang++.exe',[
 '--target=x86_64-w64-mingw32','-std=c++23','-O2','-static','-municode','-Werror','-DWINVER=0x0A00','-D_WIN32_WINNT=0x0A00',
 '-I'+path.join(root,'tests/stubs'),path.join(root,'tests/compiler-client.cpp'),'-lshell32','-luser32','-lwinhttp','-lbcrypt','-lcrypt32','-lole32','-loleaut32','-lruntimeobject','-ldwmapi','-lcomctl32','-ladvapi32','-o',exe],options);
if(r.status!==0)throw Error((r.stdout||'')+(r.stderr||'')+(r.error||''));
r=cp.spawnSync(exe,[path.resolve(dll),path.resolve(cache)],options);process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
fs.writeFileSync(path.join(out,'results.log'),(r.stdout||'')+(r.stderr||''));process.exitCode=r.status??1;
