'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {PeImage, Pdb, SYMBOLS, encodeMap, validateMap, generate} = require('../tools/symbol-map.cjs');
const {tagName, verify} = require('../tools/update-compatibility-v6.cjs');

const {fixturePe,fixturePdb,fixtureMap}=require('./fixtures.cjs');
async function temp(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-symbol-test-'));
  t.after(()=>{if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-symbol-test-'))throw Error('Unexpected cleanup path');return fs.rm(dir,{recursive:true,force:true});});return dir;
}

test('exact build round trip produces only 256 bytes',()=>{
  const {pe,map}=fixtureMap();assert.equal(map.length,256);
  assert.deepEqual(validateMap(map,pe).addresses,[0x1000,0x1100,0x1200]);
  assert.equal(validateMap(map).key,pe.identity.key);
});
test('loader relocations are excluded, fixed code bytes are verified',()=>{
  const {pe,map}=fixtureMap();const bytes=Buffer.from(pe.bytes);bytes[0x408]^=0x55;
  assert.doesNotThrow(()=>validateMap(map,new PeImage(bytes)));bytes[0x401]^=0x55;
  assert.throws(()=>validateMap(map,new PeImage(bytes)),/Fingerprint/);
});
test('different GUID, age, timestamp, image size, machine and format are rejected',()=>{
  const {pe,map}=fixtureMap();for(const p of [0,4,8,24,28,32,36]) {
    const bad=Buffer.from(map);bad[p]^=1;assert.throws(()=>validateMap(bad,pe));
  }
});
test('truncated and oversized responses are rejected',()=>{
  const {map}=fixtureMap();for(const size of [0,1,255])assert.throws(()=>validateMap(map.subarray(0,size)));
  assert.throws(()=>validateMap(Buffer.concat([map,Buffer.from([0])])));
});
test('invalid masks, too few fixed bytes and garbage padding are rejected',()=>{
  const {map}=fixtureMap();for(const mutate of [b=>{b[80]=3;},b=>{b.fill(0,80,112);},
    b=>{b.writeUInt32LE(15,44);},b=>{b.writeUInt32LE(33,44);},
    b=>{b.writeUInt32LE(24,44);b[40+8+30]=1;}]) {
    const bad=Buffer.from(map);mutate(bad);assert.throws(()=>validateMap(bad));
  }
});
test('a matching interior address or data address is never a hook target',()=>{
  const {pe,map}=fixtureMap();for(const rva of [0x1001,0x2000,0x3000,0xfffffff0]) {
    const bad=Buffer.from(map);bad.writeUInt32LE(rva,40);assert.throws(()=>validateMap(bad,pe));
  }
});
test('required functions must have distinct addresses',()=>{
  const {map}=fixtureMap();const bad=Buffer.from(map);bad.writeUInt32LE(bad.readUInt32LE(40),112);
  assert.throws(()=>validateMap(bad),/Duplicate/);
});
test('PE bounds, architecture, CodeView filename and function ordering are checked',()=>{
  for(const mutate of [b=>b.writeUInt32LE(0xffffff00,60),b=>b.writeUInt16LE(0xaa64,0x84),
    b=>b.writeUInt16LE(97,0x86),b=>b.write('other-file.pdb',0xa58),
    b=>b.writeUInt32LE(0x900,0x80c)]) {
    const bad=fixturePe();mutate(bad);assert.throws(()=>new PeImage(bad));
  }
});
test('optimized table duplicates use the same first-entry rule as the runtime',()=>{
  const bytes=fixturePe();bytes.writeUInt32LE(0x1000,0x80c);bytes.writeUInt32LE(0x1008,0x810);
  const pe=new PeImage(bytes);assert.equal(pe.functions.get(0x1000),0x1040);
});
test('MSF stream parsing resolves exact decorated names and stripped PDB ages',async t=>{
  const dir=await temp(t),pe=new PeImage(fixturePe());
  const pdb=fixturePdb(pe,[...SYMBOLS,'?DrawColor@Canvas@gfx@@QEAAXI@Z']);
  await fs.writeFile(path.join(dir,'chrome.dll'),pe.bytes);await fs.writeFile(path.join(dir,'chrome.pdb'),pdb);
  const meta=await generate(path.join(dir,'chrome.dll'),path.join(dir,'chrome.pdb'),path.join(dir,'map.bin'));
  assert.equal(meta.key,pe.identity.key);assert.equal(meta.infoAge,2);assert.equal(meta.dbiAge,1);
  assert.equal(meta.records,4);assert.equal((await fs.stat(path.join(dir,'map.bin'))).size,256);
});
test('missing, ambiguous and ABI-changed PDB names are not published',async t=>{
  const dir=await temp(t),pe=new PeImage(fixturePe());
  for(const names of [SYMBOLS.slice(0,2),[...SYMBOLS,SYMBOLS[0]],
    [SYMBOLS[0],SYMBOLS[1],SYMBOLS[2].replace('QEAAXI','QEAAXH')]]) {
    let bytes=fixturePdb(pe,names);
    // The fourth record is a second address for GetColor rather than a duplicate alias.
    if(names.length===4){const at=5*512+SYMBOLS.reduce((n,s)=>n+((14+Buffer.byteLength(s)+4)&~3),0);bytes.writeUInt32LE(0x300,at+8);}
    await fs.writeFile(path.join(dir,'bad.pdb'),bytes);const pdb=await Pdb.open(path.join(dir,'bad.pdb'));
    try{await assert.rejects(()=>pdb.symbols(pe),/Missing or ambiguous ABI/);}finally{await pdb.close();}
  }
});
test('mismatched PDB identity and truncated MSF files fail closed',async t=>{
  const dir=await temp(t),pe=new PeImage(fixturePe());
  for(const mutate of [b=>b.subarray(0,b.length-1),b=>{b[3*512+12]^=1;return b;},
    b=>{b.writeUInt32LE(2,4*512+8);return b;},b=>{b.writeUInt32LE(0xffffffff,512);return b;}]) {
    const file=path.join(dir,'bad.pdb');await fs.writeFile(file,mutate(fixturePdb(pe)));
    await assert.rejects(async()=>{const pdb=await Pdb.open(file);try{await pdb.symbols(pe);}finally{await pdb.close();}});
  }
});
test('manual tags cannot inject paths, commands or nightly releases',()=>{
  assert.equal(tagName('v1.98.60'),'v1.98.60');
  for(const bad of ['../main','v1.2.3\nhello','v1.2.3;echo','v1.2.3-nightly','latest',''])assert.throws(()=>tagName(bad));
});
test('publish job verifies map identity and hash independently of generation',async t=>{
  const dir=await temp(t),{map,pe}=fixtureMap();await fs.writeFile(path.join(dir,'map.bin'),map);
  const record={format:1,extractor:1,key:pe.identity.key,tag:'v1.98.60',
    sha256:require('node:crypto').createHash('sha256').update(map).digest('hex'),
    functions:SYMBOLS.map((name,i)=>({name,rva:0x1000+i*0x100,length:32})),
    source:{symbols:`https://brave-symbols.s3.brave.com/chrome.dll.pdb/${pe.identity.key}/chrome.dll.pdb`,
      release:'https://github.com/brave/brave-browser/releases/download/v1.98.60/brave-v1.98.60-win32-x64.zip',
      archiveSha256:'1'.repeat(64),dllSha256:'2'.repeat(64)}};
  await fs.writeFile(path.join(dir,'record.json'),JSON.stringify(record));await verify(dir);
  record.sha256='0'.repeat(64);await fs.writeFile(path.join(dir,'record.json'),JSON.stringify(record));
  await assert.rejects(()=>verify(dir),/Invalid generated artifact/);
});
