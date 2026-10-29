// MIT. Independent native features in a standard Windhawk named-symbol cache.
'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const native = require('./symbol-map-v6.cjs');
const legacy = require('./symbol-cache.cjs');
const {PeImage, Pdb} = native;
const DECORATED = Object.freeze([...native.SYMBOLS,
  '?HWNDForView@views@@YAPEAUHWND__@@PEBVView@1@@Z',
  '?GetColor@ColorProvider@ui@@QEBAIH@Z',
  '?OnPaintBackground@MenuScrollViewContainer@views@@UEAAXPEAVCanvas@gfx@@@Z',
  '?Paint@BubbleBackground@views@@UEBAXPEAVCanvas@gfx@@PEAVView@2@@Z',
  '?drawRRect@RecordPaintCanvas@cc@@UEAAXAEBVSkRRect@@AEBVPaintFlags@2@@Z',
  '??0RoundedOmniboxResultsFrame@@QEAA@PEAVView@views@@PEAVLocationBar@@_N@Z',
  '??1RoundedOmniboxResultsFrame@@UEAA@XZ',
  '?SetRoundedCornersFromAnimation@Layer@ui@@EEAAXAEBVRoundedCornersF@gfx@@W4PropertyChangeReason@2@@Z',
  '?Paint@SolidBackground@views@@UEBAXPEAVCanvas@gfx@@PEAVView@2@@Z',
  '?SetBackgroundBlur@Layer@ui@@QEAAXM@Z',
  '?GetLocalBounds@View@views@@QEBA?AVRect@gfx@@XZ',
  '?GetNonResultSectionHeight@RoundedOmniboxResultsFrame@@SAH_N@Z',
  '?SetClipRectFromAnimation@Layer@ui@@EEAAXAEBVRect@gfx@@W4PropertyChangeReason@2@@Z',
  '?SetClipRect@Layer@ui@@QEAAXAEBVRect@gfx@@@Z',
  '??_7SolidBackground@views@@6B@',
  "?OnThemeChanged@BubbleFrameView@views@@UEAAXXZ",
  "?SetFillsBoundsOpaquely@Layer@ui@@QEAAX_N@Z",
  "?OnPaintBackground@FadeLabel@@UEAAXPEAVCanvas@gfx@@@Z"
]);
const SYMBOLS = Object.freeze([...legacy.SYMBOLS,
  'struct HWND__ * __cdecl views::HWNDForView(class views::View const *)',
  'public: unsigned int __cdecl ui::ColorProvider::GetColor(int)const',
  'public: virtual void __cdecl views::MenuScrollViewContainer::OnPaintBackground(class gfx::Canvas *)',
  'public: virtual void __cdecl views::BubbleBackground::Paint(class gfx::Canvas *,class views::View *)const',
  'public: virtual void __cdecl cc::RecordPaintCanvas::drawRRect(class SkRRect const &,class cc::PaintFlags const &)',
  'public: __cdecl RoundedOmniboxResultsFrame::RoundedOmniboxResultsFrame(class views::View *,class LocationBar *,bool)',
  'public: virtual __cdecl RoundedOmniboxResultsFrame::~RoundedOmniboxResultsFrame(void)',
  'private: virtual void __cdecl ui::Layer::SetRoundedCornersFromAnimation(class gfx::RoundedCornersF const &,enum ui::PropertyChangeReason)',
  'public: virtual void __cdecl views::SolidBackground::Paint(class gfx::Canvas *,class views::View *)const',
  'public: void __cdecl ui::Layer::SetBackgroundBlur(float)',
  'public: class gfx::Rect __cdecl views::View::GetLocalBounds(void)const',
  'public: static int __cdecl RoundedOmniboxResultsFrame::GetNonResultSectionHeight(bool)',
  'private: virtual void __cdecl ui::Layer::SetClipRectFromAnimation(class gfx::Rect const &,enum ui::PropertyChangeReason)',
  'public: void __cdecl ui::Layer::SetClipRect(class gfx::Rect const &)',
  "const views::SolidBackground::`vftable'",
  "public: virtual void __cdecl views::BubbleFrameView::OnThemeChanged(void)",
  "public: void __cdecl ui::Layer::SetFillsBoundsOpaquely(bool)",
  "public: virtual void __cdecl FadeLabel::OnPaintBackground(class gfx::Canvas *)"
]);
const FEATURES = Object.freeze({
  verticalTabs: [0,1,2,3,4,5],
  toolbar: [0,1,2,3,6,7],
  webpage: [0,1,2,3,8,9,10,11,12],
  menus: [13,14,15,17],
  popups: [0,1,2,13,14,16,17,28,29,30],
  suggestions: [5,13,14,18,19,20,21,22,23,24,25,26,27]
});
const HOOK_SLOTS = Object.freeze([...native.HOOK_SLOTS,5,14,15,16,17,18,19,20,21,25,28,29,30]);
const FORMAT = 'windhawk-feature-cache-v1', EXTRACTOR = 1, ABI_REVISION = 4;
const CLIENT_VERSION = '3.8', MAP_SIZE = 16384;
const CACHE_ROOT = 'brave-acrylic-features-v' + ABI_REVISION;
const RELEASE_ROOT = 'feature-releases-v' + ABI_REVISION;
const REQUIRED_SLOTS = Object.freeze([]); // Required per feature, never guessed.
function check(ok, message) { if (!ok) throw Error(message); }
function executable(pe, rva, length) {
  return rva >= pe.text.rva && rva + length <= pe.text.rva + pe.text.size;
}
function outsideUnwind(pe, rva, length) {
  check(!pe.functionRanges.some(f => f.begin < rva + length && f.end > rva), 'Leaf overlaps unwind range');
}
function helperLeaf(bytes, slot) {
  const hex = slot === 22 ? 'f30f118900000000e900000000' :
    slot === 23 ? '4889d048c70200000000488b890000000048894a08c3' : '';
  if (!hex) return 0;
  const pattern = Buffer.from(hex, 'hex');
  return pattern.every((b,i) => (slot === 22 ? ((i >= 4 && i < 8) || (i >= 9 && i < 13)) :
    (i >= 13 && i < 17)) || bytes[i] === b) ? pattern.length : 0;
}
function fingerprint(pe, rva, slot) {
  if (slot < 13) return native.fingerprint(pe, rva, slot);
  if (slot === 27) {
    const section = pe.sections.find(s => rva >= s.rva && rva + 16 <= s.rva + s.rawSize);
    check(section && section.name === '.rdata' && !(section.flags & (0x80000000|0x20000000)), 'Not an immutable background vtable');
    const code = pe.read(rva,16);
    for (let p = 0; p < 16; p += 8) {
      const pointer = code.readBigUInt64LE(p) - pe.imageBase;
      check(pointer >= 0 && pointer < BigInt(pe.imageSize) && executable(pe,Number(pointer),1), 'Invalid vtable method');
    }
    return {rva,length:16,kind:4,reserved:0,code,mask:Buffer.alloc(16,255)};
  }
  if (pe.functions.has(rva)) return {...pe.fingerprint(rva),kind:0,reserved:0};
  const bytes = pe.read(rva,32), length = helperLeaf(bytes,slot);
  if (length) {
    outsideUnwind(pe,rva,length);
    if (slot === 22) {
      const target = rva + 13 + bytes.readInt32LE(9);
      check(executable(pe,target,1) && pe.functions.has(target), 'Unsupported blur setter tail call');
    }
    return {rva,length,kind:5,reserved:0,code:Buffer.from(bytes),mask:Buffer.alloc(32,255)};
  }
  if (bytes[0] === 0xe9) {
    outsideUnwind(pe,rva,5);
    const target = rva + 5 + bytes.readInt32LE(1);
    const body = pe.fingerprint(target);
    return {...body,rva,kind:3,reserved:target,aliasRvas:[target]};
  }
  throw Error('Unsupported exact function entry: ' + DECORATED[slot]);
}
function aliasPolicy(value) {
  if (value.slot < 13 && value.slot !== 5) return native.allowCompilerAlias(value);
  return !HOOK_SLOTS.includes(value.slot) && value.slot !== 27;
}
function featureStatus(entries, errors = []) {
  return Object.fromEntries(Object.entries(FEATURES).map(([name, slots]) => {
    const missing = slots.filter(i => !entries[i]);
    return [name,{available:missing.length === 0,missing:missing.map(i => SYMBOLS[i]),
      reasons:missing.map(i => errors[i] || 'Missing validated native target')}];
  }));
}
function completeSlots(entries) {
  return new Set(Object.values(FEATURES).filter(slots => slots.every(i => entries[i])).flat());
}
function validateMap(bytes) {
  check(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAP_SIZE && bytes.every(b => b >= 32 && b <= 126), 'Invalid ASCII feature cache');
  const fields = bytes.toString('ascii').split('#');
  check(fields.length === 3 + SYMBOLS.length * 2 && fields[0] === '1' && fields[1] === 'chrome.dll', 'Invalid feature cache header/count');
  const match = /^x86-64_([1-9]\d*)_([1-9]\d*)$/.exec(fields[2]);
  check(match, 'Invalid feature cache image identity');
  const timestamp = Number(match[1]), imageSize = Number(match[2]);
  check(timestamp <= 0xffffffff && imageSize <= 0xffffffff, 'Invalid image identity range');
  const seen = new Set();
  const entries = SYMBOLS.map((name,i) => {
    const number = fields[4+i*2];
    check(fields[3+i*2] === name, 'Unexpected feature symbol');
    if (number === '') return null; // Windhawk's explicit optional-symbol miss.
    check(/^[1-9]\d{0,9}$/.test(number), 'Invalid feature RVA');
    const rva = Number(number);
    check(rva < imageSize && !seen.has(rva), 'Duplicate or out-of-range feature RVA');
    seen.add(rva); return {rva};
  });
  const used = completeSlots(entries);
  check(entries.every((entry,i) => !entry || used.has(i)), 'Orphan native target');
  return {machine:0x8664,timestamp,imageSize,entries,addresses:entries.map(e => e?.rva || 0),features:featureStatus(entries)};
}
function encodeCache(pe, entries) {
  check(entries.length === SYMBOLS.length, 'Wrong feature slot count');
  const used = completeSlots(entries), fields = ['1','chrome.dll',`x86-64_${pe.timestamp}_${pe.imageSize}`];
  entries.forEach((entry,i) => fields.push(SYMBOLS[i],entry && used.has(i) ? String(entry.rva) : ''));
  const bytes = Buffer.from(fields.join('#'),'ascii'); validateMap(bytes); return bytes;
}
async function generate(dll,pdbPath,output) {
  const pe = new PeImage(await fs.readFile(dll)), pdb = await Pdb.open(pdbPath);
  try {
    let sharedBackgroundSetter = false;
    const result = await pdb.symbols(pe,{names:DECORATED,fingerprint:(rva,i) => fingerprint(pe,rva,i),
      rejectAliases:true,partial:true,aliasPolicy:value => {
        if (value.slot === 5) { sharedBackgroundSetter = true; return true; }
        return aliasPolicy(value);
      }});
    if (sharedBackgroundSetter) {
      // The vertical-tab feature only calls this helper, which is safe when
      // folded. Suggestions would patch it: disable that feature alone.
      result.errors[27] = 'The background setter is shared and cannot be hooked safely';
    }
    // A shared body is unsafe to patch under two native roles. Remove only the
    // affected slots; the other complete features can still be published.
    const spans = [];
    result.entries.forEach((entry,i) => {
      if (!entry) return;
      const ranges = entry.kind === 3 ? [[entry.rva,5],[entry.reserved,entry.length]] : [[entry.rva,entry.length]];
      for (const [start,size] of ranges) for (const other of spans)
        if (start < other.start + other.size && other.start < start + size && i !== other.i) {
          result.errors[i] = result.errors[other.i] = 'Overlapping native roles';
        }
      for (const [start,size] of ranges) spans.push({start,size,i});
    });
    result.errors.forEach((error,i) => { if (error) result.entries[i] = null; });
    const status = featureStatus(result.entries,result.errors);
    const map = encodeCache(pe,result.entries), parsed = validateMap(map);
    await fs.writeFile(output,map);
    return {format:FORMAT,extractor:EXTRACTOR,abiRevision:ABI_REVISION,clientVersion:CLIENT_VERSION,
      key:pe.identity.key,machine:pe.machine,timestamp:pe.timestamp,imageSize:pe.imageSize,
      records:result.records,infoAge:result.infoAge,dbiAge:result.dbiAge,
      sha256:crypto.createHash('sha256').update(map).digest('hex'),features:status,
      functions:SYMBOLS.flatMap((name,i) => parsed.entries[i] ? [{name,rva:parsed.entries[i].rva}] : [])};
  } finally { await pdb.close(); }
}
module.exports = {FORMAT,EXTRACTOR,ABI_REVISION,CLIENT_VERSION,CACHE_ROOT,RELEASE_ROOT,MAP_SIZE,REQUIRED_SLOTS,FEATURES,
  DECORATED,SYMBOLS,HOOK_SLOTS,aliasPolicy,fingerprint,helperLeaf,featureStatus,completeSlots,validateMap,encodeCache,generate};
if (require.main === module) generate(...process.argv.slice(2)).then(record => console.log(JSON.stringify(record,null,2)))
  .catch(error => {console.error(error.message);process.exitCode=1;});
