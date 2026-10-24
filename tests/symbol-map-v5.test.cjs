'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const v5=require('../tools/symbol-map-v5.cjs');
const {fixtureMapV5,fixturePeV5,RVAS}=require('./fixtures-v5.cjs');
const {fixturePdb}=require('./fixtures.cjs');
const at=i=>40+i*80;
const names=()=>v5.SYMBOLS.map((name,i)=>({name,within:RVAS[i]-0x1000}));
async function resolve(t,pe,records=names()){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-v5-test-'));
 t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-v5-test-'));return fs.rm(dir,{recursive:true,force:true});});
 const file=path.join(dir,'test.pdb');await fs.writeFile(file,fixturePdb(pe,records));
 const pdb=await v5.Pdb.open(file);try{return await v5.resolveGroups(pe,pdb);}finally{await pdb.close();}
}
test('v5 preserves the native ABI and rejects older formats',()=>{
 const {pe,map}=fixtureMapV5(),parsed=v5.validateMap(map,pe);
 assert.equal(map.length,1320);assert.equal(parsed.websiteCode,true);assert.equal(parsed.entries.length,16);
 assert.equal(parsed.addresses[8],0x1300);assert.equal(v5.CLIENT_VERSION,'3.2');
 assert.deepEqual(v5.REQUIRED_SLOTS,[0,1,2,3,4,5,6,7,8,9,10,11,15]);
 for(const file of ['fixtures','fixtures-v2','fixtures-v3','fixtures-v4']){
  const f=require('./'+file+'.cjs'),create=f.fixtureMap||f.fixtureMapV2||f.fixtureMapV3||f.fixtureMapV4;
  assert.throws(()=>v5.validateMap(create().map,pe),/format/);
 }
 for(const p of [0,4,8,24,28,32,36,at(15)+16]){const bad=Buffer.from(map);bad[p]^=1;assert.throws(()=>v5.validateMap(bad,pe));}
 for(const size of [0,40,1319,1321])assert.throws(()=>v5.validateMap(Buffer.concat([map,Buffer.alloc(1)]).subarray(0,size),pe));
});
test('only a completely absent, all-zero scripting group is optional',()=>{
 const {pe,map}=fixtureMapV5(),partial=Buffer.from(map);
 partial.fill(0,at(12),at(15));const parsed=v5.validateMap(partial,pe);
 assert.equal(parsed.websiteCode,false);assert.deepEqual(parsed.addresses.slice(12,15),[0,0,0]);
 for(const slot of v5.REQUIRED_SLOTS){const bad=Buffer.from(partial);bad.fill(0,at(slot),at(slot)+80);assert.throws(()=>v5.validateMap(bad,pe),/required/);}
 for(const slots of [[12],[13],[14],[12,13],[12,14],[13,14]]){
  const bad=Buffer.from(map);for(const slot of slots)bad.fill(0,at(slot),at(slot)+80);
  assert.throws(()=>v5.validateMap(bad,pe),/Incomplete/);
 }
 for(const p of [at(12)+4,at(13)+16,at(14)+79]){const bad=Buffer.from(partial);bad[p]=1;assert.throws(()=>v5.validateMap(bad,pe),/absent/);}
});
test('direct named E9 entries work across every hook/helper slot, including approved leaves',async t=>{
 for(const slot of v5.SYMBOLS.map((_,i)=>i)){
  const bytes=fixturePeV5(),body=slot===8?0x1300:RVAS[slot],stub=0x1700,raw=0x400+stub-0x1000;
  bytes[raw]=0xe9;bytes.writeInt32LE(body-stub-5,raw+1);
  const pe=new v5.PeImage(bytes),records=names();records[slot].within=stub-0x1000;
  const result=await resolve(t,pe,records),map=v5.encodeMap(pe,result.entries),parsed=v5.validateMap(map,pe);
  assert.equal(parsed.entries[slot].kind,3);assert.equal(parsed.entries[slot].rva,stub);assert.equal(parsed.addresses[slot],body);
 }
});
test('thunks still reject indirect/adjusting entries, chains, aliases and bad targets',async t=>{
 const records=names();records[0].within=0x700;
 for(const instruction of ['ff2500000000','4883c108e900000000','c3']){
  const bytes=fixturePeV5();Buffer.from(instruction,'hex').copy(bytes,0xb00);
  await assert.rejects(()=>resolve(t,new v5.PeImage(bytes),records));
 }
 for(const target of [0x1001,0x2000,0x1700,0x1720]){
  const bytes=fixturePeV5();bytes[0xb00]=0xe9;bytes.writeInt32LE(target-0x1700-5,0xb01);
  if(target===0x1720){bytes[0xb20]=0xe9;bytes.writeInt32LE(0x1000-0x1720-5,0xb21);}
  await assert.rejects(()=>resolve(t,new v5.PeImage(bytes),records));
 }
 const bytes=fixturePeV5();bytes[0xb00]=0xe9;bytes.writeInt32LE(0x1000-0x1700-5,0xb01);
 await assert.rejects(()=>resolve(t,new v5.PeImage(bytes),[...records,{name:'?ForeignAlias@@YAXXZ',within:0}]),/alias/i);
});
test('missing, renamed, ambiguous or aliased scripting symbols preserve native discovery',async t=>{
 const pe=new v5.PeImage(fixturePeV5());
 for(const slot of v5.OPTIONAL_SCRIPT)for(const mode of ['missing','renamed','ambiguous','alias']){
  let records=names();
  if(mode==='missing')records=records.filter((_,i)=>i!==slot);
  if(mode==='renamed')records[slot].name='?NewUnsupportedABI@@YAXXZ';
  if(mode==='ambiguous')records.push({name:v5.SYMBOLS[slot],within:0x700});
  if(mode==='alias')records.push({name:'?ForeignScriptAlias@@YAXXZ',within:RVAS[slot]-0x1000});
  const result=await resolve(t,pe,records),parsed=v5.validateMap(v5.encodeMap(pe,result.entries),pe);
  assert.equal(parsed.websiteCode,false);assert.ok(result.websiteCodeError);
  assert.equal(parsed.addresses[0],RVAS[0]);assert.equal(parsed.addresses[15],RVAS[15]);
 }
});
test('an unsupported scripting leaf is omitted; a required failure still stops generation',async t=>{
 const bytes=fixturePeV5();const table=[];
 for(let p=0xc00;p<0xc00+14*12;p+=12){if(bytes.readUInt32LE(p)!==RVAS[13])table.push(Buffer.from(bytes.subarray(p,p+12)));}
 bytes.fill(0,0xc00,0xe00);table.forEach((entry,i)=>entry.copy(bytes,0xc00+i*12));
 bytes.writeUInt32LE(table.length*12,0x98+116+3*8);bytes.writeUInt32LE(table.length*12,0x98+240+40+8);
 const pe=new v5.PeImage(bytes),result=await resolve(t,pe);assert.equal(v5.validateMap(v5.encodeMap(pe,result.entries),pe).websiteCode,false);
 const good=new v5.PeImage(fixturePeV5());
 await assert.rejects(()=>resolve(t,good,names().slice(1)),/Missing/);
 await assert.rejects(()=>resolve(t,good,[...names(),{name:'?ForeignCoreAlias@@YAXXZ',within:0}]),/alias/i);
 const shared=names();shared[13].within=0;await assert.rejects(()=>resolve(t,good,shared),/alias/i);
});
