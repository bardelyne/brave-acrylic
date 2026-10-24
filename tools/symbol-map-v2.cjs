// MIT. Format 2 is a separate ABI; format 1 remains in symbol-map.cjs.
'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {MAGIC, PeImage, Pdb, guidKey} = require('./symbol-map.cjs');
const FORMAT = 2, EXTRACTOR = 1, ABI_REVISION = 1, CLIENT_VERSION = '3.0';
const HEADER_SIZE = 40, ENTRY_SIZE = 80, MAP_SIZE = 520;
const SYMBOLS = Object.freeze([
  '?OnPaintBackground@View@views@@MEAAXPEAVCanvas@gfx@@@Z',
  '?DrawColor@Canvas@gfx@@QEAAXIW4SkBlendMode@@@Z',
  '?GetClassNameW@View@views@@QEBA?AV?$basic_string_view@DU?$char_traits@D@__Cr@std@@@__Cr@std@@XZ',
  '?ShouldWindowContentsBeTransparent@BrowserDesktopWindowTreeHostWin_ChromiumImpl@@EEBA_NXZ',
  '??0BraveVerticalTabStripContainerView@@QEAA@PEAVBrowserView@@PEAVView@views@@@Z',
  '?SetBackground@View@views@@QEAAXV?$unique_ptr@VBackground@views@@U?$default_delete@VBackground@views@@@__Cr@std@@@__Cr@std@@@Z',
]);
function check(ok, message) { if (!ok) throw Error(message); }
function leafCode(code) {
  return code.length >= 13 && code.subarray(0, 3).equals(Buffer.from([0x48,0x83,0xb9])) &&
    code.subarray(7, 13).equals(Buffer.from([0,0x74,3,0x31,0xc0,0xc3]));
}
function leafRange(pe, rva) {
  check(rva >= pe.text.rva && rva + 13 <= pe.text.rva + pe.text.size,
    'Leaf outside executable .text');
  check(!pe.functionRanges.some(({begin, end}) =>
    (begin >= rva && begin < rva + 13) || (begin < rva + 13 && end > rva)),
  'Leaf has an unwind entry or overlaps an unwind range');
}
function fingerprint(pe, rva, slot) {
  if (slot !== 3 || pe.functions.has(rva)) return {...pe.fingerprint(rva), kind:0};
  leafRange(pe, rva);
  const code = Buffer.alloc(32), mask = Buffer.alloc(32);
  pe.read(rva, 13).copy(code);
  check(leafCode(code), 'Unexpected browser-host short leaf layout');
  mask.fill(255, 0, 13);
  return {rva, length:13, kind:1, code, mask};
}
function validateMap(map, pe) {
  check(map.length === MAP_SIZE && map.readUInt32LE() === MAGIC && map.readUInt32LE(4) === FORMAT,
    'Invalid compatibility file format');
  const guid = map.subarray(8, 24), age = map.readUInt32LE(24), machine = map.readUInt32LE(28);
  const timestamp = map.readUInt32LE(32), imageSize = map.readUInt32LE(36);
  check(guid.some(b => b) && age && machine === 0x8664 && imageSize, 'Invalid compatibility identity');
  if (pe) check(guid.equals(pe.identity.guid) && age === pe.identity.age && machine === pe.machine &&
    timestamp === pe.timestamp && imageSize === pe.imageSize, 'Compatibility file belongs to a different build');
  const entries = [];
  for (let i = 0; i < SYMBOLS.length; ++i) {
    const p = HEADER_SIZE + i * ENTRY_SIZE;
    const rva = map.readUInt32LE(p), length = map.readUInt32LE(p + 4), kind = map.readUInt32LE(p + 8);
    const code = map.subarray(p + 16, p + 48), mask = map.subarray(p + 48, p + 80);
    check(map.readUInt32LE(p + 12) === 0 && (kind === 0 || (kind === 1 && i === 3)),
      'Invalid fingerprint kind, slot or reserved field');
    check(rva && rva < imageSize && length <= imageSize - rva &&
      (kind === 0 ? length >= 16 && length <= 32 : length === 13), 'Invalid fingerprint range');
    check(mask.every((b, j) => (b === 0 || b === 255) && (j < length || b === 0)) &&
      code.subarray(length).every(b => b === 0), 'Invalid fingerprint mask or padding');
    if (kind === 1) check(leafCode(code) && mask.subarray(0, 13).every(b => b === 255),
      'Invalid browser-host short leaf');
    else check(mask.filter(b => b === 255).length >= 16, 'Insufficient fixed fingerprint bytes');
    check(!entries.some(e => rva < e.rva + e.length && e.rva < rva + length),
      'Duplicate or overlapping function addresses');
    if (pe) {
      if (kind === 1) leafRange(pe, rva);
      else check(pe.functions.get(rva) >= rva + length && rva >= pe.text.rva &&
        rva + length <= pe.text.rva + pe.text.size, 'Not an executable function entry');
      const bytes = pe.read(rva, length);
      check(mask.subarray(0, length).every((m, j) => !m || code[j] === bytes[j]), 'Fingerprint mismatch');
    }
    entries.push({rva, length, kind});
  }
  return {key:guidKey(guid, age), addresses:entries.map(e => e.rva), entries, machine, timestamp, imageSize};
}
function encodeMap(pe, entries) {
  check(entries.length === SYMBOLS.length, 'Wrong function count');
  const map = Buffer.alloc(MAP_SIZE);
  map.writeUInt32LE(MAGIC); map.writeUInt32LE(FORMAT, 4); pe.identity.guid.copy(map, 8);
  map.writeUInt32LE(pe.identity.age, 24); map.writeUInt32LE(pe.machine, 28);
  map.writeUInt32LE(pe.timestamp, 32); map.writeUInt32LE(pe.imageSize, 36);
  entries.forEach((e, i) => {
    const p = HEADER_SIZE + i * ENTRY_SIZE;
    check(e.code.length === 32 && e.mask.length === 32, 'Invalid fingerprint buffers');
    map.writeUInt32LE(e.rva, p); map.writeUInt32LE(e.length, p + 4); map.writeUInt32LE(e.kind, p + 8);
    e.code.copy(map, p + 16); e.mask.copy(map, p + 48);
  });
  validateMap(map, pe); return map;
}
async function generate(dll, pdbPath, output) {
  const pe = new PeImage(await fs.readFile(dll)), pdb = await Pdb.open(pdbPath);
  try {
    const result = await pdb.symbols(pe, {names:SYMBOLS, rejectAliases:true,
      fingerprint:(rva, slot) => fingerprint(pe, rva, slot)});
    const map = encodeMap(pe, result.entries);
    await fs.writeFile(output, map);
    return {format:FORMAT, extractor:EXTRACTOR, abiRevision:ABI_REVISION, clientVersion:CLIENT_VERSION,
      key:pe.identity.key, machine:pe.machine, timestamp:pe.timestamp, imageSize:pe.imageSize,
      records:result.records, infoAge:result.infoAge, dbiAge:result.dbiAge,
      sha256:crypto.createHash('sha256').update(map).digest('hex'),
      functions:result.entries.map((e, i) => ({name:SYMBOLS[i], rva:e.rva, length:e.length, kind:e.kind}))};
  } finally { await pdb.close(); }
}
module.exports = {FORMAT, MAGIC, EXTRACTOR, ABI_REVISION, CLIENT_VERSION, HEADER_SIZE, ENTRY_SIZE,
  MAP_SIZE, SYMBOLS, PeImage, Pdb, fingerprint, encodeMap, validateMap, generate};
if (require.main === module) {
  const [dll, pdb, output] = process.argv.slice(2);
  if (!output) { console.error('Usage: node tools/symbol-map-v2.cjs chrome.dll chrome.dll.pdb output.bin'); process.exitCode = 1; }
  else generate(dll, pdb, output).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
