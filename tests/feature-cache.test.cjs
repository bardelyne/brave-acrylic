'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const cache=require('../tools/feature-cache.cjs');
const {Pdb}=require('../tools/symbol-map.cjs');
const {fixtureMapV6,fixturePdbV6,RVAS}=require('./fixtures-v6.cjs');
const fake={timestamp:123,imageSize:65536};
const all=cache.SYMBOLS.map((_,i)=>({rva:0x1000+i*64}));
test('all 64 feature combinations round-trip without exposing orphan addresses',()=>{
  const groups=Object.values(cache.FEATURES);
  for(let bits=0;bits<64;++bits){
    const used=new Set(groups.flatMap((slots,i)=>(bits&(1<<i))?slots:[]));
    const entries=all.map((e,i)=>used.has(i)?e:null);
    const parsed=cache.validateMap(cache.encodeCache(fake,entries));
    for(const [name,slots]of Object.entries(cache.FEATURES))
      assert.equal(parsed.features[name].available,slots.every(i=>used.has(i)),`${bits}:${name}`);
    for(const i of cache.completeSlots(entries))assert.equal(parsed.entries[i].rva,all[i].rva);
  }
});
test('losing each native target disables only its dependent features',()=>{
  for(let slot=0;slot<all.length;++slot){
    const entries=all.map((e,i)=>i===slot?null:e);
    const parsed=cache.validateMap(cache.encodeCache(fake,entries));
    for(const [name,slots]of Object.entries(cache.FEATURES))
      assert.equal(parsed.features[name].available,!slots.includes(slot),`${slot}:${name}`);
  }
});
test('missing optional entries use Windhawk empty values; bad names, zeros, aliases and orphan data are rejected',()=>{
  const bytes=cache.encodeCache(fake,all);
  for(const mutate of [f=>{f[4]='0';},f=>{f[4]='-1';},f=>{f[4]='001';},f=>{f[6]=f[4];},
    f=>{f[4]='65536';},f=>{f[3]='other';},f=>{f.splice(3,2);},f=>{f[4+18*2]='';}]){
    const fields=bytes.toString().split('#');mutate(fields);
    assert.throws(()=>cache.validateMap(Buffer.from(fields.join('#'))));
  }
  const empty=cache.validateMap(cache.encodeCache(fake,Array(cache.SYMBOLS.length).fill(null)));
  assert.ok(Object.values(empty.features).every(f=>!f.available));
  assert.ok(empty.entries.every(e=>e===null));
});
test('exact helper leaves preserve every opcode while allowing native member displacements',()=>{
  const patterns=[['4889d048c70200000000488b89d001000048894a08c3',22,22]];
  for(const [hex,slot,length]of patterns){
    const bytes=Buffer.from(hex,'hex');assert.equal(cache.helperLeaf(bytes,slot),length);
    for(let i=0;i<length;++i){
      const variable=(i>=13&&i<17);
      const copy=Buffer.from(bytes);copy[i]^=1;
      assert.equal(cache.helperLeaf(copy,slot),variable?length:0,`${slot}:${i}`);
    }
  }
});
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-features-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('real PE/PDB parsing publishes the old background features despite missing new menu symbols',async t=>{
  const dir=await temporary(t),{pe}=fixtureMapV6();
  const dll=path.join(dir,'chrome.dll'),pdb=path.join(dir,'chrome.dll.pdb'),out=path.join(dir,'cache.txt');
  await fs.writeFile(dll,pe.bytes);await fs.writeFile(pdb,fixturePdbV6(pe));
  const record=await cache.generate(dll,pdb,out);
  assert.equal(record.features.verticalTabs.available,true);assert.equal(record.features.toolbar.available,true);
  assert.equal(record.features.webpage.available,true);assert.equal(record.features.menus.available,false);
  assert.equal(record.features.suggestions.available,false);assert.equal(record.functions.length,13);
  const parsed=cache.validateMap(await fs.readFile(out));assert.deepEqual(parsed.addresses.slice(0,13),RVAS);
});
test('missing or unsafe targets are isolated; corrupt PDB identity remains a fatal error',async t=>{
  const dir=await temporary(t),{pe}=fixtureMapV6();
  const dll=path.join(dir,'chrome.dll'),pdb=path.join(dir,'chrome.dll.pdb'),out=path.join(dir,'cache.txt');
  await fs.writeFile(dll,pe.bytes);
  const bytes=fixturePdbV6(pe),name=Buffer.from(cache.DECORATED[4]);
  const missing=Buffer.from(bytes),at=missing.indexOf(name);assert.ok(at>=0);missing[at]^=1;
  await fs.writeFile(pdb,missing);
  let record=await cache.generate(dll,pdb,out);
  assert.equal(record.features.verticalTabs.available,false);assert.equal(record.features.toolbar.available,true);
  assert.equal(record.features.webpage.available,true);
  await fs.writeFile(pdb,fixturePdbV6(pe,[{name:'UnsafePaintAlias',within:RVAS[0]-0x1000}]));
  record=await cache.generate(dll,pdb,out);
  assert.ok(Object.values(record.features).every(status=>!status.available));
  assert.equal(record.functions.length,0);
  const different=fixtureMapV6();different.pe.identity.guid[0]^=1;
  await fs.writeFile(pdb,fixturePdbV6(different.pe));
  await assert.rejects(()=>cache.generate(dll,pdb,out),/does not match/);
});
test('partial discovery cannot hide malformed public records or unsupported symbol remapping',async t=>{
  const dir=await temporary(t),{pe}=fixtureMapV6(),file=path.join(dir,'symbols.pdb');
  await fs.writeFile(file,fixturePdbV6(pe));const pdb=await Pdb.open(file);
  try{
    const result=await pdb.symbols(pe,{names:['DoesNotExist'],partial:true});
    assert.deepEqual(result.entries,[null]);assert.match(result.errors[0],/Missing/);
    await assert.rejects(()=>pdb.symbols(pe,{names:['DoesNotExist']}),/Missing/);
  }finally{await pdb.close();}
});
test('the compiled feature names and dependency groups match the producer contract',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../brave-acrylic.wh.cpp'),'utf8');
  const names=source.slice(source.indexOf('static constexpr const char* kFeatureSymbols[]'),source.indexOf('static bool ParseFeatureCache'));
  assert.deepEqual([...names.matchAll(/"([^"\n]+)"/g)].map(m=>m[1]),cache.SYMBOLS);
  const resolve=source.slice(source.indexOf('static bool ResolveFeatureAddresses'),source.indexOf('// </feature-kernel>'));
  assert.match(resolve,/WindhawkUtils::HookSymbols/);
  assert.ok(resolve.indexOf('WindhawkUtils::HookSymbols(')<resolve.indexOf('ValidateFeatureAddresses('));
  assert.doesNotMatch(source,/namespace PipelineTrust|WinHttp|kWorkflowSha256|kWorkflowBlob/);
  assert.match(resolve,/options.symbolServer=L""/);
  assert.doesNotMatch(source,/PopupProbe|OmniboxProbe|ProbeSymbols::|OmniboxSymbols::/);
});
