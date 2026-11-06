'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const cache=require('../tools/feature-cache.cjs');
const {Pdb}=require('../tools/symbol-map.cjs');
const {fixtureMapV6,fixturePdbV6,RVAS}=require('./fixtures-v6.cjs');
const fake={timestamp:123,imageSize:65536};
const all=cache.SYMBOLS.map((_,i)=>({rva:0x1000+i*64}));
test('all feature combinations round-trip without exposing orphan addresses',()=>{
  const groups=Object.values(cache.FEATURES);
  for(let bits=0;bits<(1<<groups.length);++bits){
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
test('shadow and fade targets are published only with their complete base feature',()=>{
  for(const [missing,omitted] of [
    [6,[36]], [36,[36]], [25,[32,33,34,35]],
    ...[32,33,34,35].map(slot=>[slot,[32,33,34,35]])
  ]){
    const entries=all.map((entry,i)=>i===missing?null:entry);
    const bytes=cache.encodeCache(fake,entries), parsed=cache.validateMap(bytes);
    assert.equal(parsed.features.addressBar.available,missing!==6);
    assert.equal(parsed.features.popups.available,missing!==25);
    for(const slot of [32,33,34,35,36])
      assert.equal(Boolean(parsed.entries[slot]),!omitted.includes(slot));
    if(missing!==36){
      const orphan=bytes.toString().split('#');
      orphan[4+2*omitted[0]]=String(all[omitted[0]].rva);
      assert.throws(()=>cache.validateMap(Buffer.from(orphan.join('#'))),/Orphan native target/);
    }
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
test('native HWND and fade-property helper leaves reject instruction changes',()=>{
  const patterns=[{"hex": "4885c974194889c84883b81801000000751b488b80300100004885c075ea31c0c3488b89300100004885c9740c488b91180100004885d274e8488b02488b40584889d148ff25667bf50b", "variable": [11, 12, 13, 14, 21, 22, 23, 24, 36, 37, 38, 39, 48, 49, 50, 51, 70, 71, 72, 73]}, {"hex": "4885c974444889c84883b81801000000751a488b80300100004885c075eaeb29488b89300100004885c9740c488b91180100004885d274e8488b02488b40584889d148ff256f66e00b31c0c3", "variable": [11, 12, 13, 14, 21, 22, 23, 24, 35, 36, 37, 38, 47, 48, 49, 50, 69, 70, 71, 72]}];
  patterns.push({hex:'4189d04881c100000000488d1500000000e900000000',variable:[6,7,8,9,13,14,15,16,18,19,20,21],slot:34});
  for(const {hex,variable,slot=33}of patterns) {
    const bytes=Buffer.from(hex,'hex');assert.equal(cache.helperLeaf(bytes,slot),bytes.length);
    for(let i=0;i<bytes.length;++i){const changed=Buffer.from(bytes);changed[i]^=1;
      assert.equal(cache.helperLeaf(changed,slot),variable.includes(i)?bytes.length:0,`${slot}:${i}`);}
    assert.equal(cache.helperLeaf(bytes.subarray(0,-1),slot),0);
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
  assert.equal(record.features.suggestions.available,false);assert.equal(record.features.addressBar.available,true);
  assert.equal(record.functions.length,13);
  const parsed=cache.validateMap(await fs.readFile(out));
  assert.deepEqual(parsed.addresses.slice(0,13),RVAS);
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
  const resolve=source.slice(source.indexOf('static bool ResolveFeatureAddresses'),source.indexOf('// </feature-kernel>'));
  const names=resolve.slice(resolve.indexOf('WindhawkUtils::SYMBOL_HOOK'),resolve.indexOf('static_assert'));
  assert.deepEqual([...names.matchAll(/L"([^"\n]+)"/g)].map(m=>m[1]),cache.SYMBOLS);
  const fallback=resolve.slice(resolve.indexOf('fallbackHooks[]'),resolve.indexOf('static_assert(ARRAYSIZE(fallbackHooks)'));
  assert.deepEqual([...fallback.matchAll(/L"([^"\n]+)"/g)].map(m=>m[1]),cache.SYMBOLS);
  assert.deepEqual([...fallback.matchAll(/LR"\(([^\n]+)\)"/g)].map(m=>m[1]),
    cache.DECORATED.flatMap(name=>[name,...(cache.ALTERNATE_NAMES[name]||[])]));
  assert.match(resolve,/options\.noUndecoratedSymbols\s*=\s*TRUE/);
  assert.match(resolve,/WindhawkUtils::HookSymbols/);
  assert.ok(resolve.indexOf('WindhawkUtils::HookSymbols(')<resolve.indexOf('ValidateFeatureAddresses('));
  assert.doesNotMatch(source,/namespace PipelineTrust|WinHttp|kWorkflowSha256|kWorkflowBlob/);
  assert.match(resolve,/options\.symbolServer\s*=\s*allowFallback\s*\?\s*kBraveSymbolServer\s*:\s*L""/);
  assert.doesNotMatch(source,/PopupProbe|OmniboxProbe|ProbeSymbols::|OmniboxSymbols::/);
});
test('the virtual opacity setter uses the same slot and rejects ambiguous addresses',async t=>{
  const dir=await temporary(t),{pe}=fixtureMapV6(),file=path.join(dir,'symbols.pdb');
  const name=cache.DECORATED[26],alternate=cache.ALTERNATE_NAMES[name][0];
  const resolve=async extra=>{
    await fs.writeFile(file,fixturePdbV6(pe,extra));
    const pdb=await Pdb.open(file);
    try{return await pdb.symbols(pe,{names:[name],alternateNames:cache.ALTERNATE_NAMES,
      rejectAliases:true,partial:true,fingerprint:rva=>({rva})});}
    finally{await pdb.close();}
  };
  assert.equal((await resolve([{name:alternate,within:0x700}])).entries[0].rva,0x1700);
  const ambiguous=await resolve([{name:alternate,within:0x700},{name,within:0x720}]);
  assert.equal(ambiguous.entries[0],null);
  assert.match(ambiguous.errors[0],/ambiguous ABI/);
  const shared=await resolve([{name:alternate,within:0x700},{name:'Unrelated',within:0x700}]);
  assert.equal(shared.entries[0],null);
  assert.match(shared.errors[0],/alias at target/);
});
