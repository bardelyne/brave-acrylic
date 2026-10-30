'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {SYMBOLS, encodeCache, validateMap, generate} = require('../tools/symbol-cache.cjs');
const {fixtureMapV6, fixturePdbV6, RVAS} = require('./fixtures-v6.cjs');
test('standard Windhawk text uses the full C++ prototype names at named entries, including compiler stubs', () => {
  const {pe} = fixtureMapV6(), bytes = encodeCache(pe,RVAS.map(rva => ({rva})));
  assert.ok(bytes.length<2048);
  assert.equal(bytes.toString().split('#')[0],'1');
  assert.deepEqual(validateMap(bytes).addresses,RVAS);
  assert.equal(pe.read(validateMap(bytes).entries[8].rva,5)[0],0xe9);
  assert.notEqual(validateMap(bytes).entries[8].rva,0x1300); // Named entry, not its body.
});
test('malformed, ambiguous, incomplete or oversized symbol-cache text is rejected', () => {
  const {pe} = fixtureMapV6(), bytes = encodeCache(pe,RVAS.map(rva => ({rva})));
  for(const mutate of [f => {f[0]='2';},f => {f[1]='other.dll';},f => {f[2]='arm64_1_2';},
    f => {f.pop();},f => {f.push('extra','1');},f => {f[3]='wrong';},f => {f[4]='-1';},
    f => {f[4]='1e3';},f => {f[4]='0001';},f => {f[4]='4294967296';},
    f => {f[6]=f[4];},f => {f[4]='0';},f => {f[2]='x86-64_4294967296_100';}]) {
    const fields=bytes.toString().split('#');mutate(fields);
    assert.throws(()=>validateMap(Buffer.from(fields.join('#'))));
  }
  for(const invalid of [Buffer.alloc(0),Buffer.alloc(16385,32),Buffer.from('bad\n'),Buffer.from([255])])
    assert.throws(()=>validateMap(invalid));
});
test('the producer actually resolves a matching PDB and emits a standard text cache', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-standard-cache-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const {pe}=fixtureMapV6();
  const dll=path.join(dir,'chrome.dll'),pdb=path.join(dir,'chrome.dll.pdb'),out=path.join(dir,'cache.txt');
  await fs.writeFile(dll,pe.bytes);await fs.writeFile(pdb,fixturePdbV6(pe));
  const record=await generate(dll,pdb,out);
  assert.deepEqual(validateMap(await fs.readFile(out)).addresses,RVAS);
  assert.equal(record.key,pe.identity.key);
  assert.equal(record.format,'windhawk-symbol-cache-v1');
  assert.deepEqual(record.functions,SYMBOLS.map((name,i)=>({name,rva:RVAS[i]})));
  await fs.writeFile(pdb,fixturePdbV6(pe,[{name:'DifferentAliasedName',within:RVAS[1]-0x1000}]));
  await generate(dll,pdb,out); // Calling a named helper does not patch its aliases.
  await fs.writeFile(pdb,fixturePdbV6(pe,[{name:'DifferentAliasedName',within:RVAS[0]-0x1000}]));
  await assert.rejects(()=>generate(dll,pdb,out),/alias/i);
});
test('standard Windhawk fetching keeps local structural checks without a pipeline API gate', async () => {
  const source=await fs.readFile(path.join(__dirname,'../brave-acrylic.wh.cpp'),'utf8');
  const code=source.slice(source.indexOf('#include <windhawk_api.h>'));
  assert.doesNotMatch(code,/PipelineTrust|WinHttp|kWorkflowBlob|kWorkflowSha256|api.github.com|proof.json/);
  assert.equal([...code.matchAll(/CreateThread\(/g)].length,1);
  assert.match(code,/options\.symbolServer\s*=\s*L""/);
  assert.match(code,/options\.onlineCacheUrl\s*=\s*s_useOnlineSymbolCache/);
  assert.match(code,/ValidateFeatureAddresses\(module,addresses,result\)/);
  assert.doesNotMatch(code,/kBuiltinMap|knownBuild|builtIn/);
  assert.match(source,/- hideNativeCaptionButtons: false/);
});
test('workflow uses the same source revision in both jobs and pinned actions',async()=>{
  const yaml=(await fs.readFile(path.join(__dirname,'../.github/workflows/compatibility.yml'),'utf8')).replaceAll('\r\n','\n');
  assert.equal([...yaml.matchAll(/ref: \$\{\{ github.sha \}\}/g)].length,2);
  assert.equal([...yaml.matchAll(/uses: [^\s]+@[a-f0-9]{40}/g)].length,5);
  assert.doesNotMatch(yaml,/TRUSTED_ARTIFACT_ID|steps.trusted|archive: false/);
});
