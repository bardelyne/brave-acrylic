'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.BRAVE_UI_TEST_DIR||'D:/Work/windhawk/scratch/brave-native-ui-20261029/native-tests');
fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,'native-ui.exe');
const options={encoding:'utf8',cwd:root,windowsHide:true,timeout:120000,env:{...process.env,TEMP:out,TMP:out}};
let result=cp.spawnSync(process.env.WINDHAWK_CXX||'C:/Program Files/Windhawk/Compiler/bin/clang++.exe',[
  '--target=x86_64-w64-mingw32','-std=c++23','-O2','-static','-municode','-Werror','-DWINVER=0x0A00','-D_WIN32_WINNT=0x0A00',
  '-I'+path.join(root,'tests/stubs'),path.join(__dirname,'native-ui.cpp'),'-lgdi32','-lshell32','-luser32','-lwinhttp','-lbcrypt','-lcrypt32',
  '-lole32','-loleaut32','-lruntimeobject','-ldwmapi','-lcomctl32','-ladvapi32','-o',exe],options);
if(result.status!==0)throw Error((result.stdout||'')+(result.stderr||'')+(result.error||''));
result=cp.spawnSync(exe,process.argv.slice(2),{...options,timeout:30000});
fs.writeFileSync(path.join(out,'results.log'),(result.stdout||'')+(result.stderr||''));
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)console.error(result.error);process.exitCode=result.status??1;
