'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const v4=require('../tools/symbol-map-v4.cjs');
const {RVAS,fixturePeV4,fixtureMapV4,fixturePdbV4}=require('./fixtures-v4.cjs');
const at=i=>40+i*80;
test('v4 round trip fixes all sixteen slots and resolves the named thunk body',()=>{
 const {pe,map}=fixtureMapV4(),parsed=v4.validateMap(map,pe);
 assert.equal(map.length,1320);assert.equal(parsed.entries.length,16);
 assert.equal(parsed.entries[6].kind,2);assert.equal(parsed.entries[8].kind,3);
 assert.equal(parsed.entries[8].rva,0x12f0);assert.equal(parsed.addresses[8],0x1300);
 assert.equal(v4.CLIENT_VERSION,'3.1.1');assert.equal(v4.SYMBOLS[11],'?SetPageBaseBackgroundColor@WebContentsImpl@content@@UEAAXV?$optional@I@__Cr@std@@@Z');assert.equal(v4.SYMBOLS[15],'?SetWebContents@ContentsWebView@@UEAAXPEAVWebContents@content@@@Z');
 for(const old of [require('./fixtures.cjs').fixtureMap().map,require('./fixtures-v2.cjs').fixtureMapV2().map,require('./fixtures-v3.cjs').fixtureMapV3().map])
  assert.throws(()=>v4.validateMap(old),/format/);
});
test('v4 rejects foreign identities, malformed lengths, masks and reserved fields',()=>{
 const {pe,map}=fixtureMapV4();
 for(const size of [0,520,1319,1321])assert.throws(()=>v4.validateMap(Buffer.concat([map,Buffer.alloc(1)]).subarray(0,size),pe));
 for(const p of [0,4,8,24,28,32,36,at(14)+16]){
  const bad=Buffer.from(map);bad[p]^=1;assert.throws(()=>v4.validateMap(bad,pe));
 }
 for(const mutate of [b=>b.writeUInt32LE(1,at(14)+12),b=>b[at(14)+48]=1,
  b=>b.fill(0,at(14)+48,at(14)+80),b=>b.writeUInt32LE(33,at(14)+4)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v4.validateMap(bad,pe));
 }
});
test('focus leaf is confined to slot 6, its precise layout and all 32 fixed bytes',()=>{
 const {pe,map}=fixtureMapV4(),p=at(6);
 for(const mutate of [b=>b.writeUInt32LE(31,p+4),b=>b[p+48]=0,b=>b[p+16]=0x90,
  b=>b.writeUInt32LE(0,p+8),b=>b.writeUInt32LE(2,at(7)+8)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v4.validateMap(bad,pe));
 }
 const changed=Buffer.from(map);changed[p+19]^=1;
 assert.doesNotThrow(()=>v4.validateMap(changed));
 assert.throws(()=>v4.validateMap(changed,pe),/Fingerprint/);
 const bytes=fixturePeV4();bytes.writeUInt32LE(0x1260,0xc00+5*12);bytes.writeUInt32LE(0x1280,0xc04+5*12);
 assert.throws(()=>v4.validateMap(map,new v4.PeImage(bytes)),/unwind/);
});
test('named thunk must jump directly to a distinct exact unwind-backed body',()=>{
 const {pe,map}=fixtureMapV4(),p=at(8);
 for(const mutate of [b=>b.writeUInt32LE(0,p+12),b=>b.writeUInt32LE(0x1301,p+12),
  b=>b.writeUInt32LE(3,at(9)+8),b=>b.writeUInt32LE(0x1000,p+12),b=>b.writeUInt32LE(0x12f0,p+12)]){
  const bad=Buffer.from(map);mutate(bad);assert.throws(()=>v4.validateMap(bad,pe));
 }
 const bytes=fixturePeV4();bytes[0x400+RVAS[8]-0x1000+1]^=1;
 assert.throws(()=>v4.validateMap(map,new v4.PeImage(bytes)),/thunk/);
 const sourceOverlap=Buffer.from(map);sourceOverlap.writeUInt32LE(RVAS[8],at(14));
 assert.throws(()=>v4.validateMap(sourceOverlap),/Overlapping/);
});
async function resolved(t,pe,extra=[]){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-v4-test-'));
 t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-v4-test-'));return fs.rm(dir,{recursive:true,force:true});});
 const file=path.join(dir,'fixture.pdb');await fs.writeFile(file,fixturePdbV4(pe,extra));
 const pdb=await v4.Pdb.open(file);
 try{return await pdb.symbols(pe,{names:v4.SYMBOLS,rejectAliases:true,fingerprint:(rva,i)=>v4.fingerprint(pe,rva,i)});}
 finally{await pdb.close();}
}
test('public aliases at added functions, thunk bodies and other thunks fail generation',async t=>{
 const pe=new v4.PeImage(fixturePeV4());assert.equal((await resolved(t,pe)).entries.length,16);
 for(const rva of [...RVAS.slice(6),0x1300])
  await assert.rejects(()=>resolved(t,pe,[{name:'?ForeignAlias@@YAXXZ',within:rva-0x1000}]),/alias/i);
 const bytes=fixturePeV4(),rva=0x1700,p=0x400+rva-0x1000;
 bytes[p]=0xe9;bytes.writeInt32LE(0x1300-rva-5,p+1);
 await assert.rejects(()=>resolved(t,new v4.PeImage(bytes),[{name:'?ForeignThunk@@YAXXZ',within:rva-0x1000}]),/alias/i);
});
