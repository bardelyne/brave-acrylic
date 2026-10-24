'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const v3=require('../tools/symbol-map-v3.cjs');
const {RVAS,fixturePeV3,fixtureMapV3,fixturePdbV3}=require('./fixtures-v3.cjs');
const at=i=>40+i*80;
test('v3 round trip fixes all fifteen slots and resolves the named thunk body',()=>{
 const {pe,map}=fixtureMapV3(),parsed=v3.validateMap(map,pe);
 assert.equal(map.length,1240);assert.equal(parsed.entries.length,15);
 assert.equal(parsed.entries[6].kind,2);assert.equal(parsed.entries[8].kind,3);
 assert.equal(parsed.entries[8].rva,0x12f0);assert.equal(parsed.addresses[8],0x1300);
 assert.equal(v3.CLIENT_VERSION,'3.1');
 for(const old of [require('./fixtures.cjs').fixtureMap().map,require('./fixtures-v2.cjs').fixtureMapV2().map])
  assert.throws(()=>v3.validateMap(old),/format/);
});
test('v3 rejects foreign identities, malformed lengths, masks and reserved fields',()=>{
 const {pe,map}=fixtureMapV3();
 for(const size of [0,520,1239,1241])assert.throws(()=>v3.validateMap(Buffer.concat([map,Buffer.alloc(1)]).subarray(0,size),pe));
 for(const p of [0,4,8,24,28,32,36,at(14)+16]){
  const bad=Buffer.from(map);bad[p]^=1;assert.throws(()=>v3.validateMap(bad,pe));
 }
 for(const mutate of [b=>b.writeUInt32LE(1,at(14)+12),b=>b[at(14)+48]=1,
  b=>b.fill(0,at(14)+48,at(14)+80),b=>b.writeUInt32LE(33,at(14)+4)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v3.validateMap(bad,pe));
 }
});
test('focus leaf is confined to slot 6, its precise layout and all 32 fixed bytes',()=>{
 const {pe,map}=fixtureMapV3(),p=at(6);
 for(const mutate of [b=>b.writeUInt32LE(31,p+4),b=>b[p+48]=0,b=>b[p+16]=0x90,
  b=>b.writeUInt32LE(0,p+8),b=>b.writeUInt32LE(2,at(7)+8)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v3.validateMap(bad,pe));
 }
 const changed=Buffer.from(map);changed[p+19]^=1;
 assert.doesNotThrow(()=>v3.validateMap(changed));
 assert.throws(()=>v3.validateMap(changed,pe),/Fingerprint/);
 const bytes=fixturePeV3();bytes.writeUInt32LE(0x1260,0xc00+5*12);bytes.writeUInt32LE(0x1280,0xc04+5*12);
 assert.throws(()=>v3.validateMap(map,new v3.PeImage(bytes)),/unwind/);
});
test('named thunk must jump directly to a distinct exact unwind-backed body',()=>{
 const {pe,map}=fixtureMapV3(),p=at(8);
 for(const mutate of [b=>b.writeUInt32LE(0,p+12),b=>b.writeUInt32LE(0x1301,p+12),
  b=>b.writeUInt32LE(3,at(9)+8),b=>b.writeUInt32LE(0x1000,p+12),b=>b.writeUInt32LE(0x12f0,p+12)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v3.validateMap(bad,pe));
 }
 const bytes=fixturePeV3();bytes[0x400+RVAS[8]-0x1000+1]^=1;
 assert.throws(()=>v3.validateMap(map,new v3.PeImage(bytes)),/thunk/);
 const sourceOverlap=Buffer.from(map);sourceOverlap.writeUInt32LE(RVAS[8],at(14));
 assert.throws(()=>v3.validateMap(sourceOverlap),/Overlapping/);
});
async function resolved(t,pe,extra=[]){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-v3-test-'));
 t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-v3-test-'));return fs.rm(dir,{recursive:true,force:true});});
 const file=path.join(dir,'fixture.pdb');await fs.writeFile(file,fixturePdbV3(pe,extra));
 const pdb=await v3.Pdb.open(file);
 try{return await pdb.symbols(pe,{names:v3.SYMBOLS,rejectAliases:true,fingerprint:(rva,i)=>v3.fingerprint(pe,rva,i)});}
 finally{await pdb.close();}
}
test('public aliases at added functions, thunk bodies and other thunks fail generation',async t=>{
 const pe=new v3.PeImage(fixturePeV3());assert.equal((await resolved(t,pe)).entries.length,15);
 for(const rva of [...RVAS.slice(6),0x1300])
  await assert.rejects(()=>resolved(t,pe,[{name:'?ForeignAlias@@YAXXZ',within:rva-0x1000}]),/alias/i);
 const bytes=fixturePeV3(),rva=0x15c0,p=0x400+rva-0x1000;
 bytes[p]=0xe9;bytes.writeInt32LE(0x1300-rva-5,p+1);
 await assert.rejects(()=>resolved(t,new v3.PeImage(bytes),[{name:'?ForeignThunk@@YAXXZ',within:rva-0x1000}]),/alias/i);
});
