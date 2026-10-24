// Windows-only client tests. Requires the existing Windhawk compiler or
// WINDHAWK_CXX pointing at a compatible x64 MinGW clang++.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
async function main(){
  if(process.platform!=='win32')throw Error('The client tests require Windows');
  const root=path.resolve(__dirname,'..');
  const fixture=require('./fixtures.cjs');
  const {PeImage,encodeMap}=require('../tools/symbol-map.cjs');
  const tempBase=process.env.BRAVE_TEST_TEMP||os.tmpdir();await fs.mkdir(tempBase,{recursive:true});
  const out=await fs.mkdtemp(path.join(tempBase,'brave-client-test-'));
  try {
    const bytes=fixture.fixturePe(),pe=new PeImage(bytes);
    await fs.writeFile(path.join(out,'fixture.dll'),bytes);
    await fs.writeFile(path.join(out,'map.bin'),encodeMap(pe,[0x1000,0x1100,0x1200].map(r=>pe.fingerprint(r))));
    const compiler=process.env.WINDHAWK_CXX||'C:/Program Files/Windhawk/Compiler/bin/clang++.exe';
    const exe=path.join(out,'client.exe');
    const result=cp.spawnSync(compiler,['--target=x86_64-w64-mingw32','-std=c++23','-O2','-municode','-static',
      '-I'+path.join(root,'tests/stubs'),path.join(root,'tests/client.cpp'),'-lshell32','-luser32','-lwinhttp','-o',exe],
    {encoding:'utf8',windowsHide:true,env:{...process.env,TEMP:out,TMP:out}});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
    if(result.status!==0)throw Error('Client test compilation failed');
    const test=cp.spawnSync(exe,[path.join(out,'fixture.dll'),path.join(out,'map.bin'),...process.argv.slice(2)],
      {encoding:'utf8',windowsHide:true,timeout:30000});
    process.stdout.write(test.stdout||'');process.stderr.write(test.stderr||'');
    if(test.status!==0)throw Error('Client tests failed: '+(test.error||test.status));
  } finally {
    const resolved=path.resolve(out),prefix=path.resolve(tempBase)+path.sep+'brave-client-test-';
    if(!resolved.startsWith(prefix))throw Error('Refused unexpected cleanup path');
    await fs.rm(resolved,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
