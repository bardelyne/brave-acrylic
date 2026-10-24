'use strict';
const {fixturePe, fixturePdb} = require('./fixtures.cjs');
const {PeImage, SYMBOLS, fingerprint, encodeMap} = require('../tools/symbol-map-v2.cjs');
const RVAS = Object.freeze([0x1000, 0x1060, 0x10c0, 0x1140, 0x11a0, 0x1200]);
const LEAF = Buffer.from('4883b92000000000740331c0c3', 'hex');
function writeRanges(bytes, ranges) {
  const opt = 0x80 + 24;
  bytes.writeUInt32LE(ranges.length * 12, opt + 116 + 3 * 8);
  bytes.writeUInt32LE(ranges.length * 12, opt + 240 + 40 + 8);
  bytes.fill(0, 0x800, 0xa00);
  ranges.forEach(([begin, end], i) => {
    bytes.writeUInt32LE(begin, 0x800 + i * 12);
    bytes.writeUInt32LE(end, 0x804 + i * 12);
    bytes.writeUInt32LE(0x3180, 0x808 + i * 12);
  });
  return bytes;
}
function fixturePeV2() {
  const bytes = fixturePe();
  bytes.fill(0xcc, 0x400, 0x800);
  RVAS.forEach((rva, i) => {
    if (i === 3) LEAF.copy(bytes, 0x400 + rva - 0x1000);
    else for (let j = 0; j < 64; ++j) bytes[0x400 + rva - 0x1000 + j] = (i * 39 + j + 1) & 255;
  });
  return writeRanges(bytes, RVAS.filter((_, i) => i !== 3).map(rva => [rva, rva + 64]));
}
function fixturePdbV2(pe, extra = [], before = false) {
  const required = SYMBOLS.map((name, i) => ({name, within:RVAS[i] - 0x1000}));
  return fixturePdb(pe, before ? [...extra, ...required] : [...required, ...extra]);
}
function fixtureMapV2() {
  const pe = new PeImage(fixturePeV2());
  return {pe, map:encodeMap(pe, RVAS.map((rva, i) => fingerprint(pe, rva, i)))};
}
module.exports = {RVAS, LEAF, writeRanges, fixturePeV2, fixturePdbV2, fixtureMapV2};
