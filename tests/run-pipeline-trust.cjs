'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.argv[2]||'D:/Work/windhawk/scratch/brave-pipeline-gate-20261027/trust-tests');
fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,'pipeline-trust.exe');
const args=['--target=x86_64-w64-mingw32','-std=c++23','-O2','-static','-municode','-Werror','-DWINVER=0x0A00','-D_WIN32_WINNT=0x0A00',
 '-I'+path.join(root,'tests/stubs'),path.join(root,'tests/pipeline-trust.cpp'),'-lshell32','-luser32','-lwinhttp','-lbcrypt','-lcrypt32','-lole32','-loleaut32','-lruntimeobject','-o',exe];
const options={encoding:'utf8',cwd:root,windowsHide:true,env:{...process.env,TEMP:out,TMP:out},timeout:120000};
let result=cp.spawnSync(process.env.WINDHAWK_CXX||'C:/Program Files/Windhawk/Compiler/bin/clang++.exe',args,options);
if(result.status!==0){console.error(result.stdout||'',result.stderr||'',result.error||'');process.exit(result.status??1);}
result=cp.spawnSync(exe,process.argv.slice(3),options);
fs.writeFileSync(path.join(out,'results.log'),(result.stdout||'')+(result.stderr||''));
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)console.error(result.error);process.exit(result.status??1);
