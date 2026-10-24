'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const v1 = require('../tools/symbol-map.cjs');
const v2 = require('../tools/symbol-map-v2.cjs');
const {fixtureMap, fixturePdb} = require('./fixtures.cjs');
const {RVAS, LEAF, writeRanges, fixturePeV2, fixturePdbV2, fixtureMapV2} = require('./fixtures-v2.cjs');
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-v2-test-'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'brave-v2-test-'));
    return fs.rm(dir, {recursive:true, force:true});
  });
  return dir;
}
async function resolvePdb(t, bytes, pe = new v2.PeImage(fixturePeV2())) {
  const dir = await temp(t), file = path.join(dir, 'test.pdb');
  await fs.writeFile(file, bytes);
  const pdb = await v2.Pdb.open(file);
  try {
    return await pdb.symbols(pe, {names:v2.SYMBOLS, rejectAliases:true,
      fingerprint:(rva, slot) => v2.fingerprint(pe, rva, slot)});
  } finally { await pdb.close(); }
}
test('v2 is exactly a v1 header plus six 80-byte entries in the agreed ABI order', () => {
  const {pe, map} = fixtureMapV2(), parsed = v2.validateMap(map, pe);
  assert.equal(map.length, 520); assert.equal(map.toString('ascii', 0, 4), 'BAMP');
  assert.equal(map.readUInt32LE(4), 2); assert.deepEqual(parsed.addresses, RVAS);
  assert.deepEqual(parsed.entries.map(e => e.kind), [0,0,0,1,0,0]);
  assert.deepEqual(parsed.entries.map(e => e.length), [32,32,32,13,32,32]);
  assert.deepEqual(map.subarray(8, 40), fixtureMap().map.subarray(8, 40));
  const p = 40 + 3 * 80;
  assert.deepEqual(map.subarray(p + 16, p + 29), LEAF);
  assert.ok(map.subarray(p + 48, p + 61).every(b => b === 255));
  assert.ok(map.subarray(p + 29, p + 48).every(b => b === 0));
  assert.ok(map.subarray(p + 61, p + 80).every(b => b === 0));
});
test('format 1 and format 2 never accept each other, including relabelled payloads', () => {
  const old = fixtureMap().map, current = fixtureMapV2().map;
  assert.throws(() => v2.validateMap(old), /format/);
  assert.throws(() => v1.validateMap(current), /format/);
  for (const [bytes, format, validate] of [[old,2,v2.validateMap], [current,1,v1.validateMap]]) {
    const bad = Buffer.from(bytes); bad.writeUInt32LE(format,4);
    assert.throws(() => validate(bad), /format/);
  }
});
test('v2 rejects truncated, oversized, foreign-identity and non-AMD64 maps', () => {
  const {pe, map} = fixtureMapV2();
  for (const size of [0,40,519]) assert.throws(() => v2.validateMap(map.subarray(0,size)));
  assert.throws(() => v2.validateMap(Buffer.concat([map, Buffer.alloc(1)])));
  for (const p of [0,4,8,24,28,32,36]) {
    const bad = Buffer.from(map); bad[p] ^= 1; assert.throws(() => v2.validateMap(bad,pe));
  }
});
test('short leaf is permitted only in slot 3 with length 13 and kind 1', () => {
  const {map} = fixtureMapV2(), leaf = 40 + 3 * 80;
  for (const mutate of [
    b => b.writeUInt32LE(0, leaf + 8), b => b.writeUInt32LE(2, leaf + 8),
    b => b.writeUInt32LE(1, leaf + 12), b => b.writeUInt32LE(12, leaf + 4),
    b => b.writeUInt32LE(14, leaf + 4),
    b => {const entry = Buffer.from(b.subarray(leaf,leaf+80)); b.copy(b,leaf,40,120); entry.copy(b,40);},
  ]) {
    const bad = Buffer.from(map); mutate(bad); assert.throws(() => v2.validateMap(bad));
  }
  for (const slot of [1,2,4,5]) {
    const bad = Buffer.from(map), at = 40+slot*80, entry = Buffer.from(bad.subarray(leaf,leaf+80));
    bad.copy(bad,leaf,at,at+80); entry.copy(bad,at);
    assert.throws(() => v2.validateMap(bad), /slot/);
  }
});
test('v2 normal masks reject nonbinary values and nonzero code or mask padding', () => {
  const {map} = fixtureMapV2();
  for (const mutate of [b => {b[88]=1;}, b => {b.writeUInt32LE(24,44);b.fill(0,80,88);},
    b => {b.writeUInt32LE(24,44);b.fill(0,80,88);b.fill(0,112,120);b[87]=1;}]) {
    const bad = Buffer.from(map); mutate(bad); assert.throws(() => v2.validateMap(bad));
  }
});
test('leaf rejects masks, padding, changed instructions and generic return stubs', () => {
  const {pe, map} = fixtureMapV2(), p = 40 + 3 * 80;
  for (const at of [p+16,p+17,p+18,p+23,p+24,p+25,p+26,p+27,p+28,p+29,p+48,p+60,p+61]) {
    const bad = Buffer.from(map); bad[at] ^= 1; assert.throws(() => v2.validateMap(bad,pe));
  }
  const masked = Buffer.from(map); masked[p+51] = 0;
  assert.throws(() => v2.validateMap(masked), /leaf/);
  const bytes = fixturePeV2(), raw = 0x400 + RVAS[3] - 0x1000;
  for (const stub of ['31c0c3', 'b001c3', 'c3']) {
    bytes.fill(0xcc,raw,raw+13); Buffer.from(stub,'hex').copy(bytes,raw);
    assert.throws(() => v2.fingerprint(new v2.PeImage(bytes), RVAS[3],3), /layout/);
  }
});
test('all four displacement bytes are fixed even though the leaf layout allows any displacement', () => {
  const {pe, map} = fixtureMapV2(), p = 40 + 3 * 80;
  for (let i=3; i<7; ++i) {
    const bad = Buffer.from(map); bad[p+16+i] ^= 1;
    assert.doesNotThrow(() => v2.validateMap(bad));
    assert.throws(() => v2.validateMap(bad,pe), /Fingerprint/);
  }
});
test('kind 1 cannot have an unwind entry, overlap one, or hide an entry inside the leaf', () => {
  const {map} = fixtureMapV2(), normal = RVAS.filter((_,i) => i !== 3).map(r => [r,r+64]);
  const cases = [
    [...normal, [RVAS[3],RVAS[3]+13]],
    normal.map(([begin,end],i) => [begin,i===2 ? RVAS[3]+13 : end]),
    [...normal, [RVAS[3]+5,RVAS[3]+8]],
  ];
  for (const ranges of cases) {
    const pe = new v2.PeImage(writeRanges(fixturePeV2(), ranges.sort((a,b) => a[0]-b[0])));
    assert.throws(() => v2.validateMap(map,pe), /unwind/);
  }
});
test('normal functions require an exact unwind start, sufficient length and 16 fixed bytes', () => {
  const {pe, map} = fixtureMapV2();
  for (const mutate of [b => b.writeUInt32LE(0x1001,40), b => b.writeUInt32LE(0x2000,40),
    b => b.writeUInt32LE(15,44), b => b.writeUInt32LE(33,44),
    b => b.fill(0,40+48,40+80), b => b.writeUInt32LE(1,40+8),
    b => b.writeUInt32LE(RVAS[0],40+80)]) {
    const bad = Buffer.from(map); mutate(bad); assert.throws(() => v2.validateMap(bad,pe));
  }
  const bytes = fixturePeV2(); bytes.writeUInt32LE(RVAS[0]+15,0x804);
  assert.throws(() => v2.fingerprint(new v2.PeImage(bytes),RVAS[0],0), /short/);
});
test('an exact leaf byte pattern inside another function is still an interior stub', () => {
  const bytes = fixturePeV2(), rva = RVAS[0]+40;
  LEAF.copy(bytes, 0x400+rva-0x1000);
  const pe = new v2.PeImage(bytes), bad = fixtureMapV2().map, p = 40+3*80;
  bad.writeUInt32LE(rva,p);
  assert.throws(() => v2.fingerprint(pe,rva,3), /unwind/);
  assert.throws(() => v2.fingerprint(pe,rva,4), /exact/);
  assert.throws(() => v2.validateMap(bad,pe), /overlapping|unwind/);
});
test('unwind-backed slot 3 may use normal kind 0 when it meets the normal contract', () => {
  const bytes = fixturePeV2();
  writeRanges(bytes,RVAS.map(r => [r,r+64]));
  const pe = new v2.PeImage(bytes), entries = RVAS.map((r,i) => v2.fingerprint(pe,r,i));
  assert.equal(entries[3].kind,0); assert.equal(entries[3].length,32);
  assert.doesNotThrow(() => v2.encodeMap(pe,entries));
});
test('normal relocation bytes may vary while fixed bytes and the leaf remain exact', () => {
  const {pe,map} = fixtureMapV2(), bytes = Buffer.from(pe.bytes);
  bytes[0x408] ^= 1; assert.doesNotThrow(() => v2.validateMap(map,new v2.PeImage(bytes)));
  bytes[0x401] ^= 1; assert.throws(() => v2.validateMap(map,new v2.PeImage(bytes)), /Fingerprint/);
});
test('all public symbols are checked for differently named aliases before and after every target', async t => {
  const pe = new v2.PeImage(fixturePeV2());
  for (let i=0; i<RVAS.length; ++i) for (const before of [false,true]) {
    const pdb = fixturePdbV2(pe,[{name:'?UnrelatedAlias@@YAXXZ', within:RVAS[i]-0x1000}],before);
    await assert.rejects(() => resolvePdb(t,pdb,pe), /Public symbol alias/);
  }
});
test('repeated identical public names are allowed, distinct target addresses and ABI changes are not', async t => {
  const pe = new v2.PeImage(fixturePeV2());
  const result = await resolvePdb(t,fixturePdbV2(pe,[{name:v2.SYMBOLS[0],within:0}]),pe);
  assert.equal(result.records,7);
  await assert.rejects(() => resolvePdb(t,fixturePdbV2(pe,[{name:v2.SYMBOLS[0],within:0x300}]),pe), /ambiguous ABI/);
  const names = v2.SYMBOLS.map((name,i) => ({name,within:RVAS[i]-0x1000}));
  names[1].name = names[1].name.replace('QEAAXI','QEAAXH');
  await assert.rejects(() => resolvePdb(t,fixturePdb(pe,names),pe), /Missing/);
});
test('v2 generation metadata declares extractor 1, ABI revision 1 and client version 3.0', async t => {
  const dir = await temp(t), pe = new v2.PeImage(fixturePeV2());
  await fs.writeFile(path.join(dir,'chrome.dll'),pe.bytes);
  await fs.writeFile(path.join(dir,'chrome.pdb'),fixturePdbV2(pe));
  const result = await v2.generate(path.join(dir,'chrome.dll'),path.join(dir,'chrome.pdb'),path.join(dir,'map.bin'));
  assert.equal(result.format,2); assert.equal(result.extractor,1);
  assert.equal(result.abiRevision,1); assert.equal(result.clientVersion,'3.0');
  assert.equal((await fs.stat(path.join(dir,'map.bin'))).size,520);
  assert.deepEqual(result.functions.map(f => f.rva),RVAS);
});
