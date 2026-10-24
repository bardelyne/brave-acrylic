// MIT. Reads PE/PDB data only. Never evaluates a PDB's source-server commands.
'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const FORMAT = 1;
const MAGIC = 0x504d4142; // BAMP, little endian.
const MAP_SIZE = 256;
const SYMBOLS = Object.freeze([
  '?GetColor@ColorProvider@ui@@QEBAIH@Z',
  '?OnPaintBackground@View@views@@MEAAXPEAVCanvas@gfx@@@Z',
  '?DrawColor@Canvas@gfx@@QEAAXIW4SkBlendMode@@@Z',
]);
function requireThat(ok, message) { if (!ok) throw Error(message); }
function range(bytes, at, length) {
  requireThat(Number.isSafeInteger(at) && Number.isSafeInteger(length) &&
    at >= 0 && length >= 0 && at <= bytes.length && length <= bytes.length - at,
  'Out-of-bounds binary read');
  return bytes.subarray(at, at + length);
}
function guidKey(guid, age) {
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
  return hex(guid.readUInt32LE(), 8) + hex(guid.readUInt16LE(4), 4) +
    hex(guid.readUInt16LE(6), 4) + guid.subarray(8).toString('hex').toUpperCase() + hex(age, 1);
}
class PeImage {
  constructor(bytes) {
    this.bytes = bytes;
    requireThat(range(bytes, 0, 64).readUInt16LE() === 0x5a4d, 'Expected a PE image');
    const at = bytes.readUInt32LE(60), head = range(bytes, at, 24);
    requireThat(head.readUInt32LE() === 0x4550 && head.readUInt16LE(4) === 0x8664,
      'Expected AMD64 PE');
    this.machine = head.readUInt16LE(4);
    this.timestamp = head.readUInt32LE(8);
    const optionalSize = head.readUInt16LE(20), optional = range(bytes, at + 24, optionalSize);
    requireThat(optionalSize >= 240 && optional.readUInt16LE() === 0x20b &&
      optional.readUInt32LE(108) >= 7, 'Unsupported PE optional header');
    this.imageSize = optional.readUInt32LE(56);
    requireThat(this.imageSize > 0, 'Empty PE image');
    this.directories = Array.from({length: Math.min(16, optional.readUInt32LE(108))},
      (_, i) => ({rva: optional.readUInt32LE(112 + i * 8), size: optional.readUInt32LE(116 + i * 8)}));
    const count = head.readUInt16LE(6);
    requireThat(count > 0 && count <= 96, 'Invalid PE section count');
    const table = range(bytes, at + 24 + optionalSize, count * 40);
    this.sections = Array.from({length: count}, (_, i) => {
      const s = table.subarray(i * 40, i * 40 + 40);
      const result = {name: s.toString('ascii', 0, 8).replace(/\0.*$/, ''),
        size: s.readUInt32LE(8), rva: s.readUInt32LE(12),
        rawSize: s.readUInt32LE(16), raw: s.readUInt32LE(20), flags: s.readUInt32LE(36)};
      requireThat(result.rva <= this.imageSize && result.size <= this.imageSize - result.rva,
        'PE section outside image');
      range(bytes, result.raw, result.rawSize);
      return result;
    });
    const text = this.sections.filter(s => s.name === '.text' && (s.flags & 0x20000000));
    requireThat(text.length === 1, 'Expected one executable .text section');
    this.text = text[0];
    this.identity = this.readIdentity();
    const exception = this.directory(3);
    requireThat(exception.length && exception.length % 12 === 0, 'Invalid x64 function table');
    this.functions = new Map();
    // Keep every range, including optimized duplicate starts, for v2 leaf checks.
    this.functionRanges = [];
    let previous = -1;
    for (let p = 0; p < exception.length; p += 12) {
      const begin = exception.readUInt32LE(p), end = exception.readUInt32LE(p + 4);
      this.functionRanges.push({begin, end});
      requireThat(begin >= previous && begin < this.imageSize, 'Unsorted x64 function table');
      // Only complete entries are usable as hook targets. Rejecting unrelated
      // entries here would also reject official optimized Brave images.
      // The client binary-searches for the first entry for a start address.
      if (begin !== previous && end > begin && end <= this.imageSize) this.functions.set(begin, end);
      previous = begin;
    }
  }
  read(rva, length) {
    const s = this.sections.find(s => rva >= s.rva && rva - s.rva <= s.rawSize &&
      length <= s.rawSize - (rva - s.rva));
    requireThat(s, 'RVA has no complete file-backed section');
    return range(this.bytes, s.raw + rva - s.rva, length);
  }
  directory(index) {
    const d = this.directories[index];
    requireThat(d && d.rva && d.size, 'Missing PE directory ' + index);
    return this.read(d.rva, d.size);
  }
  readIdentity() {
    const debug = this.directory(6), identities = [];
    requireThat(debug.length % 28 === 0, 'Invalid debug directory');
    for (let p = 0; p < debug.length; p += 28) {
      if (debug.readUInt32LE(p + 12) !== 2) continue;
      const size = debug.readUInt32LE(p + 16);
      requireThat(size >= 24 && size <= 4096, 'Invalid CodeView record');
      const cv = this.read(debug.readUInt32LE(p + 20), size);
      if (cv.toString('ascii', 0, 4) !== 'RSDS') continue;
      const end = cv.indexOf(0, 24);
      requireThat(end >= 0 && cv.toString('utf8', 24, end).split(/[\\/]/).pop() === 'chrome.dll.pdb',
        'Unexpected PDB filename');
      const guid = Buffer.from(cv.subarray(4, 20)), age = cv.readUInt32LE(20);
      requireThat(age && guid.some(b => b), 'Empty PDB identity');
      identities.push({guid, age, key: guidKey(guid, age)});
    }
    requireThat(identities.length > 0 && identities.every(x => x.key === identities[0].key),
      'Missing or ambiguous PDB identity');
    return identities[0];
  }
  fingerprint(rva) {
    const end = this.functions.get(rva);
    requireThat(end && rva >= this.text.rva && end <= this.text.rva + this.text.size,
      'Symbol is not an exact executable function entry');
    const length = Math.min(32, end - rva);
    requireThat(length >= 16, 'Function is too short to validate');
    const code = Buffer.alloc(32), mask = Buffer.alloc(32);
    this.read(rva, length).copy(code); mask.fill(255, 0, length);
    const relocation = this.directories[5];
    if (relocation?.size) {
      const relocs = this.read(relocation.rva, relocation.size);
      for (let p = 0; p < relocs.length;) {
        const header = range(relocs, p, 8), page = header.readUInt32LE(), size = header.readUInt32LE(4);
        requireThat(size >= 8 && size % 2 === 0, 'Invalid relocation block');
        const block = range(relocs, p, size);
        for (let q = 8; q < size; q += 2) {
          const item = block.readUInt16LE(q), type = item >>> 12, at = page + (item & 4095);
          if (!type || at >= rva + length || at + 8 <= rva) continue;
          requireThat(type === 10 || type === 3, 'Unsupported relocation in fingerprint');
          const width = type === 10 ? 8 : 4;
          for (let k = Math.max(at, rva); k < Math.min(at + width, rva + length); ++k) mask[k - rva] = 0;
        }
        p += size;
      }
    }
    requireThat(mask.filter(b => b === 255).length >= 16, 'Insufficient fixed fingerprint bytes');
    return {rva, length, code, mask};
  }
}

// Minimal MSF7 reader. Public symbols are read in bounded chunks instead of
// loading a multi-gigabyte PDB into memory. Source-server streams are ignored.
class Pdb {
  static async open(path) {
    const pdb = new Pdb(); pdb.file = await fs.open(path, 'r');
    try { await pdb.init(); return pdb; } catch (e) { await pdb.close(); throw e; }
  }
  async close() { await this.file.close(); }
  async read(at, size) {
    requireThat(Number.isSafeInteger(at) && Number.isSafeInteger(size) && at >= 0 &&
      size >= 0 && at <= this.bytes && size <= this.bytes - at, 'PDB read outside file');
    const b = Buffer.alloc(size);
    for (let n = 0; n < size;) {
      const r = await this.file.read(b, n, size - n, at + n);
      requireThat(r.bytesRead > 0, 'Truncated PDB'); n += r.bytesRead;
    }
    return b;
  }
  async init() {
    this.bytes = (await this.file.stat()).size;
    requireThat(this.bytes <= 12 * 1024 ** 3, 'PDB exceeds size limit');
    const h = await this.read(0, 56);
    requireThat(h.toString('ascii', 0, 32) === 'Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0',
      'Expected MSF7 PDB');
    this.blockSize = h.readUInt32LE(32);
    const blocks = h.readUInt32LE(40), bytes = h.readUInt32LE(44);
    requireThat([512,1024,2048,4096,8192,16384,32768].includes(this.blockSize) &&
      blocks * this.blockSize === this.bytes && bytes >= 4 && bytes <= 64 * 1024 ** 2,
    'Invalid PDB superblock');
    const count = Math.ceil(bytes / this.blockSize);
    requireThat(count * 4 <= this.blockSize, 'Unsupported multi-page directory block map');
    const map = await this.read(h.readUInt32LE(52) * this.blockSize, count * 4);
    const directory = Buffer.alloc(count * this.blockSize);
    for (let i = 0; i < count; ++i) {
      (await this.read(map.readUInt32LE(i * 4) * this.blockSize, this.blockSize))
        .copy(directory, i * this.blockSize);
    }
    const streams = directory.readUInt32LE();
    requireThat(streams <= 100000 && 4 + streams * 4 <= bytes, 'Invalid PDB stream directory');
    let p = 4 + streams * 4;
    this.streams = [];
    for (let i = 0; i < streams; ++i) {
      const size = directory.readUInt32LE(4 + i * 4), pages = [];
      if (size !== 0xffffffff) for (let j = 0; j < Math.ceil(size / this.blockSize); ++j) {
        requireThat(p + 4 <= bytes, 'Truncated PDB block list');
        const page = directory.readUInt32LE(p); p += 4;
        requireThat(page < blocks, 'PDB block outside file'); pages.push(page);
      }
      this.streams.push({size: size === 0xffffffff ? 0 : size, pages});
    }
  }
  async stream(index, offset = 0, length) {
    const s = this.streams[index]; requireThat(s, 'Missing PDB stream');
    length ??= s.size - offset;
    requireThat(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 &&
      length >= 0 && offset <= s.size && length <= s.size - offset && length <= 64 * 1024 ** 2,
    'Invalid PDB stream range');
    const b = Buffer.alloc(length);
    for (let done = 0; done < length;) {
      const pos = offset + done, block = Math.floor(pos / this.blockSize), within = pos % this.blockSize;
      let n = Math.min(length - done, this.blockSize - within);
      while (n < length - done && n < 8 * 1024 ** 2 && (within + n) % this.blockSize === 0 &&
        s.pages[block + (within + n) / this.blockSize] === s.pages[block] + (within + n) / this.blockSize) {
        n += Math.min(this.blockSize, length - done - n);
      }
      (await this.read(s.pages[block] * this.blockSize + within, n)).copy(b, done); done += n;
    }
    return b;
  }
  async symbols(pe, {names = SYMBOLS, fingerprint = rva => pe.fingerprint(rva), rejectAliases = false} = {}) {
    const info = await this.stream(1, 0, 28), dbi = await this.stream(3, 0, 64);
    // Public/stripped PDB processing can increment the Info age without changing
    // the image's DBI age. Validate the GUID plus DBI age against CodeView.
    requireThat(info.subarray(12, 28).equals(pe.identity.guid) &&
      dbi.readUInt32LE(8) === pe.identity.age && info.readUInt32LE(8) >= pe.identity.age &&
      dbi.readUInt16LE(58) === pe.machine, 'PDB does not match the DLL');
    const debugSize = dbi.readUInt32LE(48);
    if (debugSize >= 10) {
      const debugAt = 64 + [24,28,32,36,40,52].reduce((n, p) => n + dbi.readUInt32LE(p), 0);
      const debug = await this.stream(3, debugAt, debugSize);
      requireThat(debug.readUInt16LE(6) === 0xffff && debug.readUInt16LE(8) === 0xffff,
        'OMAP symbol remapping is unsupported; refusing to publish guessed addresses');
    }
    const index = dbi.readUInt16LE(20), s = this.streams[index];
    requireThat(s?.size && s.size <= 2 * 1024 ** 3, 'Invalid symbol-record stream');
    const found = new Map(names.map(name => [name, new Set()]));
    // Both passes visit the entire public-symbol stream. Aliases can appear
    // before the required names; stopping after finding the targets is unsafe.
    const scan = async visit => {
      let offset = 0, records = 0;
      while (offset < s.size) {
        const chunk = await this.stream(index, offset, Math.min(8 * 1024 ** 2, s.size - offset));
        let p = 0;
        while (p + 4 <= chunk.length) {
          const length = chunk.readUInt16LE(p) + 2, kind = chunk.readUInt16LE(p + 2);
          requireThat(length >= 4, 'Invalid symbol record');
          if (p + length > chunk.length) break;
          if (kind === 0x110e && length >= 15) {
            const end = chunk.indexOf(0, p + 14);
            requireThat(end >= 0 && end < p + length, 'Unterminated public symbol');
            visit(chunk.toString('utf8', p + 14, end), chunk.readUInt16LE(p + 12), chunk.readUInt32LE(p + 8));
          }
          p += length; ++records;
        }
        requireThat(p > 0, 'Truncated symbol stream'); offset += p;
      }
      return records;
    };
    const records = await scan((name, segment, within) => {
      const addresses = found.get(name);
      if (addresses) {
        const section = pe.sections[segment - 1];
        requireThat(section && within < section.size, 'Symbol outside section');
        addresses.add(section.rva + within);
      }
    });
    const rvas = names.map(name => {
      requireThat(found.get(name).size === 1, 'Missing or ambiguous ABI: ' + name);
      return [...found.get(name)][0];
    });
    requireThat(new Set(rvas).size === names.length, 'Aliased required functions');
    const entries = rvas.map((rva, slot) => fingerprint(rva, slot));
    if (rejectAliases) {
      const targets = new Map(rvas.map((rva, i) => [rva, names[i]]));
      const thunkBodies = new Map();
      entries.forEach((entry,i) => {
        for (const rva of entry.aliasRvas || []) {
          requireThat(!targets.has(rva) || targets.get(rva) === names[i], 'Aliased thunk body');
          targets.set(rva,names[i]);thunkBodies.set(rva,names[i]);
        }
      });
      await scan((name, segment, within) => {
        const section = pe.sections[segment - 1];
        if (!section || within >= section.size) return;
        const rva=section.rva+within;
        let target = targets.get(rva);
        if(!target && thunkBodies.size && section === pe.text && within+5<=section.rawSize) {
          const p=section.raw+within;
          if(pe.bytes[p]===0xE9)target=thunkBodies.get(rva+5+pe.bytes.readInt32LE(p+1));
        }
        requireThat(!target || name === target, 'Public symbol alias at target: ' + name);
      });
    }
    return {entries, records, infoAge: info.readUInt32LE(8), dbiAge: dbi.readUInt32LE(8)};
  }
}
function encodeMap(pe, entries) {
  requireThat(entries.length === SYMBOLS.length, 'Wrong function count');
  const map = Buffer.alloc(MAP_SIZE);
  map.writeUInt32LE(MAGIC); map.writeUInt32LE(FORMAT, 4);
  pe.identity.guid.copy(map, 8); map.writeUInt32LE(pe.identity.age, 24);
  map.writeUInt32LE(pe.machine, 28); map.writeUInt32LE(pe.timestamp, 32); map.writeUInt32LE(pe.imageSize, 36);
  entries.forEach((e, i) => {
    const p = 40 + i * 72; map.writeUInt32LE(e.rva, p); map.writeUInt32LE(e.length, p + 4);
    e.code.copy(map, p + 8); e.mask.copy(map, p + 40);
  });
  validateMap(map, pe); return map;
}
function validateMap(map, pe) {
  requireThat(map.length === MAP_SIZE && map.readUInt32LE() === MAGIC && map.readUInt32LE(4) === FORMAT,
    'Invalid compatibility file format');
  requireThat(map.readUInt32LE(28) === 0x8664 && map.readUInt32LE(24) && map.readUInt32LE(36) &&
    map.subarray(8, 24).some(b => b),
    'Invalid compatibility identity');
  if (pe) requireThat(map.subarray(8, 24).equals(pe.identity.guid) && map.readUInt32LE(24) === pe.identity.age &&
    map.readUInt32LE(32) === pe.timestamp && map.readUInt32LE(36) === pe.imageSize,
  'Compatibility file belongs to a different build');
  const addresses = [];
  for (let i = 0; i < SYMBOLS.length; ++i) {
    const p = 40 + i * 72, rva = map.readUInt32LE(p), length = map.readUInt32LE(p + 4);
    requireThat(rva && length >= 16 && length <= 32 && rva < map.readUInt32LE(36) &&
      length <= map.readUInt32LE(36) - rva, 'Invalid fingerprint range');
    const mask = map.subarray(p + 40, p + 72), code = map.subarray(p + 8, p + 40);
    requireThat(mask.every((b, j) => (b === 0 || b === 255) && (j < length || !b)) &&
      mask.filter(b => b === 255).length >= 16 && code.subarray(length).every(b => b === 0),
    'Invalid fingerprint mask');
    if (pe) {
      requireThat(pe.functions.get(rva) >= rva + length && rva >= pe.text.rva &&
        rva + length <= pe.text.rva + pe.text.size, 'Not an executable function entry');
      const bytes = pe.read(rva, length);
      requireThat(mask.subarray(0, length).every((m, j) => !m || code[j] === bytes[j]), 'Fingerprint mismatch');
    }
    addresses.push(rva);
  }
  requireThat(new Set(addresses).size === SYMBOLS.length, 'Duplicate function addresses');
  return {key: guidKey(map.subarray(8, 24), map.readUInt32LE(24)), addresses};
}
async function generate(dll, pdbPath, output) {
  const pe = new PeImage(await fs.readFile(dll)), pdb = await Pdb.open(pdbPath);
  try {
    const result = await pdb.symbols(pe), map = encodeMap(pe, result.entries);
    await fs.writeFile(output, map);
    return {format: FORMAT, key: pe.identity.key, machine: pe.machine, timestamp: pe.timestamp,
      imageSize: pe.imageSize, records: result.records, infoAge: result.infoAge, dbiAge: result.dbiAge,
      sha256: crypto.createHash('sha256').update(map).digest('hex'),
      functions: result.entries.map((e, i) => ({name: SYMBOLS[i], rva: e.rva, length: e.length}))};
  } finally { await pdb.close(); }
}
module.exports = {FORMAT, MAGIC, MAP_SIZE, SYMBOLS, PeImage, Pdb, guidKey, encodeMap, validateMap, generate};
if (require.main === module) {
  const [dll, pdb, output] = process.argv.slice(2);
  if (!output) { console.error('Usage: node tools/symbol-map.cjs chrome.dll chrome.dll.pdb output.bin'); process.exitCode = 1; }
  else generate(dll, pdb, output).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
