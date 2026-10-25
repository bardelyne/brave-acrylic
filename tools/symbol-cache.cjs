// MIT. Windhawk's standard named-symbol cache; large PDBs stay on the runner.
'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const native = require('./symbol-map-v6.cjs');
const {PeImage, Pdb, REQUIRED_SLOTS} = native;
// Windhawk's default undecoration (DIA, UNDNAME_NO_PTR64). The producer still
// resolves the exact decorated names in symbol-map-v6 before using this table.
const SYMBOLS = Object.freeze([
  "protected: virtual void __cdecl views::View::OnPaintBackground(class gfx::Canvas *)",
  "public: void __cdecl gfx::Canvas::DrawColor(unsigned int,enum SkBlendMode)",
  "public: class std::__Cr::basic_string_view<char,struct std::__Cr::char_traits<char> > __cdecl views::View::GetClassNameW(void)const",
  "private: virtual bool __cdecl BrowserDesktopWindowTreeHostWin_ChromiumImpl::ShouldWindowContentsBeTransparent(void)const",
  "public: __cdecl BraveVerticalTabStripContainerView::BraveVerticalTabStripContainerView(class BrowserView *,class views::View *)",
  "public: void __cdecl views::View::SetBackground(class std::__Cr::unique_ptr<class views::Background,struct std::__Cr::default_delete<class views::Background> >)",
  "public: virtual bool __cdecl LocationBarView::HasFocus(void)const",
  "public: virtual bool __cdecl views::View::HasFocus(void)const",
  "public: virtual void __cdecl ContentsWebView::OnThemeChanged(void)",
  "public: virtual void __cdecl ContentsWebView::RenderViewReady(void)",
  "public: virtual void __cdecl ui::LayerAnimator::SetColor(struct SkRGBA4f<3>)",
  "public: virtual void __cdecl content::WebContentsImpl::SetPageBaseBackgroundColor(class std::__Cr::optional<unsigned int>)",
  "public: virtual void __cdecl ContentsWebView::SetWebContents(class content::WebContents *)"
]);
const FORMAT = 'windhawk-symbol-cache-v1';
const EXTRACTOR = 1, ABI_REVISION = 2, CLIENT_VERSION = '3.4', MAP_SIZE = 16384;
function check(ok, message) { if (!ok) throw Error(message); }
function validateMap(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAP_SIZE &&
    bytes.every(b => b >= 32 && b <= 126), 'Invalid ASCII symbol cache');
  const fields = bytes.toString('ascii').split('#');
  check(fields.length === 3 + SYMBOLS.length * 2 && fields[0] === '1' &&
    fields[1] === 'chrome.dll', 'Invalid Windhawk cache header or entry count');
  const identity = /^x86-64_([1-9]\d*)_([1-9]\d*)$/.exec(fields[2]);
  check(identity, 'Invalid cache image identity');
  const timestamp = Number(identity[1]), imageSize = Number(identity[2]);
  check(Number.isSafeInteger(timestamp) && timestamp <= 0xffffffff &&
    Number.isSafeInteger(imageSize) && imageSize <= 0xffffffff, 'Invalid PE identity range');
  const entries = [], seen = new Set();
  SYMBOLS.forEach((name, i) => {
    const value = fields[4 + i * 2];
    check(fields[3 + i * 2] === name && /^[1-9]\d*$/.test(value), 'Unexpected symbol name or RVA');
    const rva = Number(value);
    check(Number.isSafeInteger(rva) && rva < imageSize && !seen.has(rva), 'Invalid or aliased symbol RVA');
    seen.add(rva);
    entries.push({rva});
  });
  return {machine:0x8664, timestamp, imageSize, entries, addresses:entries.map(e => e.rva)};
}
function encodeCache(pe, entries) {
  check(entries.length === SYMBOLS.length && entries.every(Boolean), 'Missing required native symbol');
  const fields = ['1', 'chrome.dll', `x86-64_${pe.timestamp}_${pe.imageSize}`];
  entries.forEach((entry, i) => fields.push(SYMBOLS[i], String(entry.rva)));
  const bytes = Buffer.from(fields.join('#'), 'ascii');
  validateMap(bytes);
  return bytes;
}
async function generate(dll, pdbPath, output) {
  const pe = new PeImage(await fs.readFile(dll)), pdb = await Pdb.open(pdbPath);
  try {
    // Resolve exact decorated names and reject aliases, mismatched PDBs,
    // unsupported leaf shapes and non-boundary addresses before publishing.
    const result = await native.resolveFunctions(pe, pdb);
    native.encodeMap(pe, result.entries);
    // Publish the named entry, including a validated E9 entry when present.
    // The client independently checks and normalizes the live jump target.
    const cache = encodeCache(pe, result.entries);
    await fs.writeFile(output, cache);
    return {format:FORMAT, extractor:EXTRACTOR, abiRevision:ABI_REVISION,
      clientVersion:CLIENT_VERSION, key:pe.identity.key, machine:pe.machine,
      timestamp:pe.timestamp, imageSize:pe.imageSize, records:result.records,
      infoAge:result.infoAge, dbiAge:result.dbiAge,
      sha256:crypto.createHash('sha256').update(cache).digest('hex'),
      functions:result.entries.map((e, i) => ({name:SYMBOLS[i], rva:e.rva}))};
  } finally { await pdb.close(); }
}
module.exports = {FORMAT, EXTRACTOR, ABI_REVISION, CLIENT_VERSION, MAP_SIZE,
  SYMBOLS, REQUIRED_SLOTS, validateMap, encodeCache, generate};
if (require.main === module) {
  const [dll, pdb, output] = process.argv.slice(2);
  generate(dll, pdb, output).then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => {console.error(e.message); process.exitCode = 1;});
}
