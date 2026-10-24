'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const v6=require('../tools/symbol-map-v6.cjs');
const {fixtureMapV6,fixturePeV6,RVAS}=require('./fixtures-v6.cjs');
const {fixturePdb}=require('./fixtures.cjs');
const at=i=>40+i*80;
const names=()=>v6.SYMBOLS.map((name,i)=>({name,within:RVAS[i]-0x1000}));
async function resolve(t,pe,records=names()){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-v6-test-'));
 t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-v6-test-'));return fs.rm(dir,{recursive:true,force:true});});
 const file=path.join(dir,'test.pdb');await fs.writeFile(file,fixturePdb(pe,records));
 const pdb=await v6.Pdb.open(file);try{return await v6.resolveFunctions(pe,pdb);}finally{await pdb.close();}
}
test('v6 contains only thirteen native background functions and rejects older formats',()=>{
 const {pe,map}=fixtureMapV6(),parsed=v6.validateMap(map,pe);
 assert.equal(map.length,1080);assert.equal(parsed.entries.length,13);
 assert.equal(parsed.addresses[8],0x1300);assert.equal(parsed.addresses[12],0x15a0);
 assert.equal(v6.CLIENT_VERSION,'3.3');assert.equal(v6.FORMAT,6);
 assert.ok(v6.SYMBOLS.every(n=>!n.includes('ExecuteJavaScript')&&!n.includes('OnDidFinishLoad')&&!n.includes('SchemeIs')));
 for(const file of ['fixtures','fixtures-v2','fixtures-v3','fixtures-v4','fixtures-v5']){
  const f=require('./'+file+'.cjs'),create=f.fixtureMap||f.fixtureMapV2||f.fixtureMapV3||f.fixtureMapV4||f.fixtureMapV5;
  assert.throws(()=>v6.validateMap(create().map,pe),/format/);
 }
 for(const p of [0,4,8,24,28,32,36,at(12)+16]){const bad=Buffer.from(map);bad[p]^=1;assert.throws(()=>v6.validateMap(bad,pe));}
 for(const size of [0,40,1079,1081,1320])assert.throws(()=>v6.validateMap(Buffer.concat([map,Buffer.alloc(256)]).subarray(0,size),pe));
});
test('every native dependency is required, even when absent entries are entirely zero',async t=>{
 const {pe,map}=fixtureMapV6();
 for(const slot of v6.REQUIRED_SLOTS){
  const bad=Buffer.from(map);bad.fill(0,at(slot),at(slot)+80);assert.throws(()=>v6.validateMap(bad,pe));
  await assert.rejects(()=>resolve(t,pe,names().filter((_,i)=>i!==slot)),/Missing/);
 }
});
test('direct named E9 entries work across every hook/helper slot, including approved leaves',async t=>{
 for(const slot of v6.REQUIRED_SLOTS){
  const bytes=fixturePeV6(),body=slot===8?0x1300:RVAS[slot],stub=0x1700,raw=0x400+stub-0x1000;
  bytes[raw]=0xe9;bytes.writeInt32LE(body-stub-5,raw+1);
  const pe=new v6.PeImage(bytes),records=names();records[slot].within=stub-0x1000;
  const result=await resolve(t,pe,records),map=v6.encodeMap(pe,result.entries),parsed=v6.validateMap(map,pe);
  assert.equal(parsed.entries[slot].kind,3);assert.equal(parsed.entries[slot].rva,stub);assert.equal(parsed.addresses[slot],body);
 }
});
test('thunks still reject indirect/adjusting entries, chains, aliases and bad targets',async t=>{
 const records=names();records[0].within=0x700;
 for(const instruction of ['ff2500000000','4883c108e900000000','c3']){
  const bytes=fixturePeV6();Buffer.from(instruction,'hex').copy(bytes,0xb00);
  await assert.rejects(()=>resolve(t,new v6.PeImage(bytes),records));
 }
 for(const target of [0x1001,0x2000,0x1700,0x1720]){
  const bytes=fixturePeV6();bytes[0xb00]=0xe9;bytes.writeInt32LE(target-0x1700-5,0xb01);
  if(target===0x1720){bytes[0xb20]=0xe9;bytes.writeInt32LE(0x1000-0x1720-5,0xb21);}
  await assert.rejects(()=>resolve(t,new v6.PeImage(bytes),records));
 }
 const bytes=fixturePeV6();bytes[0xb00]=0xe9;bytes.writeInt32LE(0x1000-0x1700-5,0xb01);
 await assert.rejects(()=>resolve(t,new v6.PeImage(bytes),[...records,{name:'?ForeignAlias@@YAXXZ',within:0}]),/alias/i);
});
test('generation needs no scripting symbols and rejects ambiguous background functions',async t=>{
 const pe=new v6.PeImage(fixturePeV6()),result=await resolve(t,pe);
 assert.equal(result.entries.length,13);v6.validateMap(v6.encodeMap(pe,result.entries),pe);
 await assert.rejects(()=>resolve(t,pe,[...names(),{name:v6.SYMBOLS[0],within:0x700}]),/Ambiguous/i);
 await assert.rejects(()=>resolve(t,pe,[...names(),{name:'?ForeignCoreAlias@@YAXXZ',within:0}]),/alias/i);
});
