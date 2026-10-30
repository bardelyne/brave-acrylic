'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {prepare, verify, contractMetadata, releaseIdentity, BRANCH,RELEASE_ROOT} = require('../tools/update-compatibility.cjs');
const {SYMBOLS, encodeCache, validateMap} = require('../tools/feature-cache.cjs');
const {fixtureMapV6} = require('./fixtures-v6.cjs');
const SOURCE = '// @version 3.4\n// The client contract is independent of comments.\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function release(tag = 'v1.98.60') {
  return {tag_name:tag, draft:false, prerelease:false, assets:[
    {id:42, name:`brave-${tag}-win32-x64.zip`, size:1000, updated_at:'2026-10-24T12:00:00Z', digest:null},
    {id:43, name:`brave-${tag}-win32-x64.zip.sha256`, size:110, updated_at:'2026-10-24T12:00:00Z'},
  ]};
}
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'brave-prepare-test-'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'brave-prepare-test-'));
    return fs.rm(dir,{recursive:true,force:true});
  });
  return dir;
}
async function recordFor(official = release()) {
  const {pe,map:internal} = fixtureMapV6(), {tag,assets} = releaseIdentity(official);
  const map=encodeCache(pe,SYMBOLS.map((_,i)=>i<13?{rva:internal.readUInt32LE(40+i*80)}:null));
  const parsed=validateMap(map);
  return {map, record:{...await contractMetadata(), tag, assets, key:pe.identity.key,
    modSourceSha256:hash(SOURCE), sha256:hash(map), machine:pe.machine, timestamp:pe.timestamp,
    imageSize:pe.imageSize, records:SYMBOLS.length, infoAge:2, dbiAge:1,
    features:parsed.features,
    functions:SYMBOLS.flatMap((name,i) => parsed.entries[i]?[{name,rva:parsed.entries[i].rva}]:[]),
    source:{release:`https://github.com/brave/brave-browser/releases/download/${tag}/brave-${tag}-win32-x64.zip`,
      archiveSha256:'1'.repeat(64), dllSha256:'2'.repeat(64),
      symbols:`https://brave-symbols.s3.brave.com/chrome.dll.pdb/${pe.identity.key}/chrome.dll.pdb`}}};
}
function content(record) {
  const text = JSON.stringify(record);
  return {encoding:'base64', size:Buffer.byteLength(text), content:Buffer.from(text).toString('base64')};
}
async function planned(t, {official = release(), record = null, env = {}, modSource = SOURCE} = {}) {
  const work = await temp(t), calls = [], emitted = {};
  const request = async (route, method = 'GET', body, missing) => {
    calls.push({route, method}); assert.equal(method,'GET'); assert.equal(body,undefined);
    if (route.startsWith('/repos/brave/brave-browser/releases/')) return official;
    assert.equal(route,`/repos/bardelyne/brave-acrylic/contents/${RELEASE_ROOT}/${official.tag_name}.json?ref=symbol-cache`);
    assert.equal(missing,true); return record && content(record);
  };
  const plan = await prepare({work,request,env,modSource,emit:async (name,value) => {emitted[name] = value;}});
  assert.equal(calls.length,2); // Metadata only; a binary URL is never requested here.
  assert.equal(emitted.needed,String(plan.needed));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(work,'plan.json'),'utf8')),plan);
  return {plan,calls};
}
test('prepare checks latest stable metadata repeatedly without another heavy build', async t => {
  let cached = null, heavyBuilds = 0;
  for (let i=0; i<3; ++i) {
    const {plan,calls} = await planned(t,{record:cached});
    assert.equal(calls[0].route,'/repos/brave/brave-browser/releases/latest');
    if (plan.needed) { ++heavyBuilds; cached = (await recordFor()).record; }
    assert.equal(plan.needed,i===0);
  }
  assert.equal(heavyBuilds,1); assert.equal(BRANCH,'symbol-cache');
});
test('matching records need no separate workflow proof', async t => {
  const {record}=await recordFor();assert.equal(record.pipelineProof,undefined);
  assert.equal((await planned(t,{record})).plan.needed,false);
});
test('new stable tag or replaced archive/checksum metadata requires generation', async t => {
  const original = (await recordFor()).record;
  assert.equal((await planned(t,{official:release('v1.98.61'),record:original})).plan.needed,true);
  for (const asset of [0,1]) for (const field of ['id','size','updated_at','digest']) {
    const official = release();
    official.assets[asset][field] = field === 'digest' ? 'sha256:'+'a'.repeat(64) :
      field === 'updated_at' ? '2026-10-24T13:00:00Z' : official.assets[asset][field]+1;
    assert.equal((await planned(t,{official,record:original})).plan.needed,true,`${asset}:${field}`);
  }
});
test('digest appearance, removal and matching values participate in the skip decision', async t => {
  const official = release(); official.assets[0].digest = 'sha256:'+'1'.repeat(64);
  const {record} = await recordFor(official);
  assert.equal((await planned(t,{official,record})).plan.needed,false);
  assert.equal((await planned(t,{official:release(),record})).plan.needed,true);
});
test('format, extractor, ABI revision, client version and explicit mod contract each invalidate a record', async t => {
  const {record} = await recordFor();
  for (const key of ['format','extractor','abiRevision','clientVersion','modContract']) {
    const old = clone(record);
    old[key] = key === 'modContract' ? {abiSha256:'0'.repeat(64)} : key === 'clientVersion' ? '2.10' : 99;
    assert.equal((await planned(t,{record:old})).plan.needed,true,key);
  }
});
test('cosmetic source, embedded README and caption edits preserve the ABI skip decision', async t => {
  const {record} = await recordFor();
  const {plan} = await planned(t,{record,modSource:SOURCE+'// New caption and README wording.\n'});
  assert.equal(plan.needed,false);
  assert.notEqual(plan.modSourceSha256,record.modSourceSha256);
  assert.deepEqual(plan.modContract,record.modContract);
});
test('manual force regenerates a matching record and a manual tag uses the exact stable endpoint', async t => {
  const {record} = await recordFor();
  const {plan,calls} = await planned(t,{record,env:{BRAVE_TAG:'v1.98.60',FORCE_REBUILD:'true'}});
  assert.equal(plan.needed,true); assert.equal(calls[0].route,'/repos/brave/brave-browser/releases/tags/v1.98.60');
  assert.equal((await planned(t,{record,env:{FORCE_REBUILD:'false'}})).plan.needed,false);
});
test('missing fields in old records rebuild; unstable or malformed official metadata fails closed', async t => {
  const {record} = await recordFor();
  const legacy = {tag:record.tag,format:1,extractor:1};
  assert.equal((await planned(t,{record:legacy})).plan.needed,true);
  for (const mutate of [r => {r.prerelease=true;}, r => {r.draft=true;},
    r => {r.assets[0].id=0;}, r => {r.assets[0].size=2**31;},
    r => {r.assets[0].updated_at='yesterday';}, r => {r.assets[0].digest='bad';},
    r => {r.assets.push(r.assets[0]);}, r => {r.assets.pop();}]) {
    const official = release(); mutate(official);
    await assert.rejects(() => planned(t,{official}));
  }
});
async function artifact(t, mutate = () => {}) {
  const work = await temp(t), fixture = await recordFor(); mutate(fixture);
  await fs.writeFile(path.join(work,'cache.txt'),fixture.map);
  await fs.writeFile(path.join(work,'record.json'),JSON.stringify(fixture.record));
  return work;
}
test('publisher independently verifies feature metadata, hashes and every present exact ABI slot', async t => {
  const work = await artifact(t);
  assert.ok((await verify(work,{modSource:SOURCE})).map.length<4096);
  for (const mutate of [f => {f.record.sha256='0'.repeat(64);},
 f => {f.record.functions[4].name='wrong';},
    f => {f.record.functions[5].rva++;},
 f => {f.record.functions[12].name='wrong';},
    f => {f.record.machine=0xaa64;}, f => {f.record.timestamp++;},
    f => {f.record.dbiAge++;}, f => {f.record.infoAge=0;}, f => {f.record.infoAge='2';},
    f => {f.record.modContract.abiSha256='0'.repeat(64);},
    f => {f.record.source.release='https://example.com/file.zip';},
    f => {f.record.source.symbols+='?alternate';},
    f => {f.record.assets.archive.digest='sha256:'+'f'.repeat(64);},
    f => {f.record.modSourceSha256='0'.repeat(64);},
  ]) await assert.rejects(() => artifact(t,mutate).then(dir => verify(dir,{allowLegacy:false,modSource:SOURCE})));
});

test('publisher rejects every omitted native dependency',async t=>{
 for(let slot=0;slot<SYMBOLS.length;++slot)await assert.rejects(()=>artifact(t,f=>{
  const fields=f.map.toString().split('#');fields.splice(3+slot*2,2);
  f.map=Buffer.from(fields.join('#'));f.record.sha256=hash(f.map);
  f.record.functions.splice(slot,1);
 }).then(p=>verify(p,{allowLegacy:false,modSource:SOURCE})));
});
test('publisher rejects legacy payloads, extra files, nonfiles and oversized records', async t => {
  const legacy = require('./fixtures.cjs').fixtureMap();
  let dir = await artifact(t, f => {f.map=legacy.map; f.record.format=1;});
  await assert.rejects(() => verify(dir,{allowLegacy:false,modSource:SOURCE}), /ASCII/);
  dir = await artifact(t); await fs.writeFile(path.join(dir,'unexpected.bin'),Buffer.alloc(1));
  await assert.rejects(() => verify(dir,{allowLegacy:false,modSource:SOURCE}), /Unexpected/);
  dir = await artifact(t); await fs.writeFile(path.join(dir,'record.json'),' '.repeat(65537));
  await assert.rejects(() => verify(dir,{allowLegacy:false,modSource:SOURCE}), /size/);
  // Directory entries cannot impersonate files, on Windows as well as Linux.
  dir = await artifact(t); await fs.unlink(path.join(dir,'record.json'));
  await fs.mkdir(path.join(dir,'record.json'));
  await assert.rejects(() => verify(dir,{allowLegacy:false,modSource:SOURCE}), /type/);
});
