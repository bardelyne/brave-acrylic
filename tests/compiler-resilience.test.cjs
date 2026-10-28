'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PeImage,Pdb,SYMBOLS,HOOK_SLOTS,BACKGROUND_UPDATE_ALIAS,allowCompilerAlias,resolveFunctions,encodeMap}=require('../tools/symbol-map-v6.cjs');
const {fixturePeV6,fixturePdbV6,RVAS}=require('./fixtures-v6.cjs');
async function exercise(t,bytes,aliases){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-role-alias-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const pe=new PeImage(bytes),file=path.join(dir,'test.pdb');await fs.writeFile(file,fixturePdbV6(pe,aliases));
 const pdb=await Pdb.open(file);try{const result=await resolveFunctions(pe,pdb);encodeMap(pe,result.entries);return result;}finally{await pdb.close();}
}
function removeUnwind(bytes,rva){
 const opt=0x98,sizeAt=opt+116+3*8,count=bytes.readUInt32LE(sizeAt)/12,raw=0xc00;
 const kept=[];for(let i=0;i<count;i++)if(bytes.readUInt32LE(raw+i*12)!==rva)kept.push(Buffer.from(bytes.subarray(raw+i*12,raw+(i+1)*12)));
 bytes.fill(0,raw,raw+count*12);Buffer.concat(kept).copy(bytes,raw);
 bytes.writeUInt32LE(kept.length*12,sizeAt);bytes.writeUInt32LE(kept.length*12,opt+240+40+8);
}
function helperThunk(slot){
 const b=fixturePeV6(),rva=RVAS[slot],p=0x400+rva-0x1000;
 removeUnwind(b,rva);b.fill(0xcc,p,p+32);b[p]=0xe9;b.writeInt32LE(0x1480-rva-5,p+1);return b;
}
test('all call-only slots tolerate unrelated folded public names without weakening hook slots',async t=>{
 for(let slot=0;slot<SYMBOLS.length;slot++){
  const run=()=>exercise(t,fixturePeV6(),[{name:'?UnrelatedMethod@OtherClass@@QEAAXXZ',within:RVAS[slot]-0x1000}]);
  if(HOOK_SLOTS.includes(slot))await assert.rejects(run,/alias/);else await run();
 }
});
test('call-only named thunks tolerate body aliases and other forwarding helpers',async t=>{
 for(const slot of [1,2,5,7,11]){
  const b=helperThunk(slot),aliasRva=0x1540,raw=0x400+aliasRva-0x1000;
  b[raw]=0xe9;b.writeInt32LE(0x1480-aliasRva-5,raw+1);
  const result=await exercise(t,b,[{name:'HelperFoldedBody',within:0x480},{name:'AnotherHelperThunk',within:aliasRva-0x1000}]);
  assert.equal(result.entries[slot].kind,3);assert.equal(result.entries[slot].reserved,0x1480);
 }
});
test('known same-class background forwarding is allowed only at its validated direct-jump body',async t=>{
 await exercise(t,fixturePeV6(),[{name:BACKGROUND_UPDATE_ALIAS,within:0x300}]);
 await assert.rejects(()=>exercise(t,fixturePeV6(),[{name:BACKGROUND_UPDATE_ALIAS,within:RVAS[8]-0x1000}]),/alias/);
 for(const slot of HOOK_SLOTS.filter(i=>i!==8))
  await assert.rejects(()=>exercise(t,fixturePeV6(),[{name:BACKGROUND_UPDATE_ALIAS,within:RVAS[slot]-0x1000}]),/alias/);
 const b=fixturePeV6(),other=0x1540,p=0x400+other-0x1000;b[p]=0xe9;b.writeInt32LE(0x1300-other-5,p+1);
 await assert.rejects(()=>exercise(t,b,[{name:BACKGROUND_UPDATE_ALIAS,within:other-0x1000}]),/alias/);
 await assert.rejects(()=>exercise(t,fixturePeV6(),[{name:'?UpdateBackgroundColor@UnrelatedWebView@@AEAAXXZ',within:0x300}]),/alias/);
});
test('required functions remain unique and wrong signatures still fail even with alias tolerance',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-role-abi-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const pe=new PeImage(fixturePeV6()),file=path.join(dir,'test.pdb');
 const {fixturePdb}=require('./fixtures.cjs');
 for(const mutate of [names=>{names[1].within=names[2].within;},names=>{names[1].name+='WRONG_ABI';}]){
  const names=SYMBOLS.map((name,i)=>({name,within:RVAS[i]-0x1000}));mutate(names);await fs.writeFile(file,fixturePdb(pe,names));
  const pdb=await Pdb.open(file);try{await assert.rejects(()=>resolveFunctions(pe,pdb),/Aliased required|Missing or ambiguous/);}finally{await pdb.close();}
 }
});
test('hook alias policy never guesses by a name substring, unknown slot or unvalidated forwarder',()=>{
 for(const slot of HOOK_SLOTS)for(const name of ['HasFocus','?HasFocus@AppMenuButton@@UEBA_NXZ',BACKGROUND_UPDATE_ALIAS+'suffix'])
  assert.equal(allowCompilerAlias({slot,name,rva:0x2000,viaThunk:false,entry:{kind:3,reserved:0x2000}}),false);
 for(const slot of [-1,13,undefined,'7'])assert.equal(allowCompilerAlias({slot}),false);
 assert.equal(allowCompilerAlias({slot:8,name:BACKGROUND_UPDATE_ALIAS,rva:0x2000,viaThunk:false,entry:{kind:0,reserved:0x2000}}),false);
});
test('both observed focus branch orders retain exact opcode, slot and unwind checks',async t=>{
 const code=Buffer.from('4883b9f003000000750331c0c3488b81e8030000488b4028837818000f95c0c3','hex');
 const bytes=fixturePeV6();code.copy(bytes,0x400+RVAS[6]-0x1000);
 await exercise(t,bytes,[]);
 for(let i=0;i<32;i++)if(!((i>=3&&i<7)||(i>=16&&i<20))){
  const changed=Buffer.from(bytes);changed[0x400+RVAS[6]-0x1000+i]^=1;
  await assert.rejects(()=>exercise(t,changed,[]));
 }
 const displaced=Buffer.from(bytes);displaced.writeUInt32LE(0x4567,0x400+RVAS[6]-0x1000+3);
 displaced.writeUInt32LE(0x1234,0x400+RVAS[6]-0x1000+16);await exercise(t,displaced,[]);
 const wrongSlot=Buffer.from(bytes);code.copy(wrongSlot,0x400+RVAS[3]-0x1000);
 await assert.rejects(()=>exercise(t,wrongSlot,[]));
});
test('focus instruction samples from all twelve official releases pass the exact layout classifier',async t=>{
 const corpus=require('./corpus/focus-layouts.json');assert.equal(corpus.length,12);
 for(const sample of corpus){
  const b=fixturePeV6();Buffer.from(sample.focusCode,'hex').copy(b,0x400+RVAS[6]-0x1000);
  await exercise(t,b,[]);
 }
 assert.equal(corpus.filter(s=>s.constructorPresent).length,7);
});
