// MIT. GitHub Actions producer for data-only, exact-build compatibility files.
'use strict';
const fs = require('node:fs/promises');
const {createWriteStream, createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {spawnSync} = require('node:child_process');
const {FORMAT, MAP_SIZE, EXTRACTOR, ABI_REVISION, CLIENT_VERSION, CACHE_ROOT, RELEASE_ROOT,
  SYMBOLS, REQUIRED_SLOTS, FEATURES, DECORATED, HOOK_SLOTS, generate, validateMap} = require('./feature-cache.cjs');
const {REPOSITORY, BRANCH, tagName, assetIdentity, releaseIdentity} = require('./compatibility-release.cjs');
const WORK = path.resolve(process.env.COMPATIBILITY_WORK_DIR ||
  (process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, 'brave-compatibility') : 'compatibility-work'));
const API = 'https://api.github.com';
const README_START = '<!-- brave-compatibility:start -->';
const README_END = '<!-- brave-compatibility:end -->';
function check(ok, message) { if (!ok) throw Error(message); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
const hexHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validCacheKey = key => typeof key === 'string' && /^[A-F0-9]{32}[1-9A-F][A-F0-9]{0,7}$/.test(key);
async function contractMetadata() {
  return {format:FORMAT, extractor:EXTRACTOR, abiRevision:ABI_REVISION, clientVersion:CLIENT_VERSION,
    modContract:{abiSha256:hash(JSON.stringify({format:FORMAT, abiRevision:ABI_REVISION,
      clientVersion:CLIENT_VERSION, maxCacheSize:MAP_SIZE, encoding:"Windhawk named-symbol cache v1",
      symbols:SYMBOLS,decoratedInputs:DECORATED,requiredSlots:REQUIRED_SLOTS,features:FEATURES,hookSlots:HOOK_SLOTS,
      partialFeatures:'only-complete-feature-dependencies; explicit-empty-optional-slots; reject-corrupt-inputs',
      normal:{kind:0, minLength:16, minFixed:16, maxLength:32, unwind:true},
      leaf:{kind:1, slot:3, length:13, code:'4883B9????????00740331C0C3', fixed:13, unwind:false},
      focusLeaf:{kind:2,slot:6,length:32,fixed:32,unwind:false,
        layouts:['4883B9????????007413488B81????????488B4028837818000F95C0C331C0C3',
          '4883B9????????00750331C0C3488B81????????488B4028837818000F95C0C3']},
      namedThunk:{kind:3,slots:'any',opcode:0xE9,length:5,unwind:false,targetField:'reserved',body:'normal-unwind-or-approved-slot-leaf',
        ranges:'source-and-body-distinct-nonoverlapping-executable'},
      nativeAbi:{color:'float4-indirect',pageBase:'optional-color8-register-present-byte4',attach:'canonical-WebContents-before-native-attach',
        vtable:'named-readonly-rdata-two-executable-methods',helperLeaves:'exact-local-rect-return',
        menus:'scoped-native-paint-alpha-and-rounded-host-backdrop',
        suggestions:'native-desktop-popup-rounded-region-below-input-and-windows-host-backdrop'},
      aliases:{hooks:'reject-unrelated-public-names-and-thunk-bodies',
        callOnlySlots:SYMBOLS.map((_,i)=>i).filter(i=>!HOOK_SLOTS.includes(i)&&i!==24),
        themeForwarder:{slot:8,kind:3,bodyName:'?UpdateBackgroundColor@ContentsWebView@@AEAAXXZ',
          bodyOnly:true,otherThunks:false}}}))}};
}
async function modSourceHash(source) {
  return hash(source ?? await fs.readFile(path.join(__dirname, '..', 'brave-acrylic.wh.cpp')));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function featureLabel(name) {
  return name[0].toUpperCase() + name.slice(1).replace(/[A-Z]/g, letter => ' ' + letter.toLowerCase());
}
function featureTable(features) {
  const entries = Object.entries(features);
  const available = entries.filter(([, status]) => status.available).length;
  return [
    '**' + available + ' of ' + entries.length + ' features available**',
    '',
    '| Feature | Status |',
    '| --- | --- |',
    ...entries.map(([name, status]) =>
      '| ' + featureLabel(name) + ' | ' + (status.available ? 'Available' : 'Unavailable') + ' |'),
  ];
}
async function writeFeatureSummary(tag, features) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = ['## Brave ' + tag + ' · Windows x64', '', ...featureTable(features)];
  const unavailable = Object.entries(features).filter(([, status]) => !status.available);
  if (unavailable.length) lines.push('', 'Unavailable features are excluded from the cache.');
  const diagnostics = unavailable.filter(([, status]) => status.reasons?.length);
  if (diagnostics.length) {
    lines.push('', '<details>', '<summary>Why features are unavailable</summary>', '', '~~~text');
    for (const [name, status] of diagnostics)
      lines.push(featureLabel(name), ...status.reasons.map(reason => '  ' + reason), '');
    lines.push('~~~', '', '</details>');
  }
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
async function api(route, method = 'GET', body, missing = false) {
  check(route.startsWith('/'), 'Invalid API route');
  const headers = {'User-Agent':'brave-acrylic-compatibility', Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'};
  if (process.env.GH_TOKEN) headers.Authorization = 'Bearer ' + process.env.GH_TOKEN;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + route, {method, headers, body: body ? JSON.stringify(body) : undefined,
    redirect:'error', signal:AbortSignal.timeout(30000)});
  if (missing && r.status === 404) return null;
  if (!r.ok) throw Object.assign(Error('GitHub API request failed (' + r.status + ')'), {status:r.status});
  return r.json();
}
function decodeFile(file, maxSize) {
  check(file.encoding === 'base64' && Number.isSafeInteger(file.size) && file.size > 0 &&
    file.size <= maxSize && typeof file.content === 'string' && file.content.length <= maxSize * 1.5 + 4,
    'Invalid GitHub file response');
  const bytes = Buffer.from(file.content, 'base64');
  check(bytes.length === file.size, 'GitHub file size changed');
  return bytes;
}
async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, name + '=' + value + '\n');
  console.log(name + '=' + value);
}
async function prepare({work = WORK, env = process.env, request = api, modSource, emit = output} = {}) {
  await fs.mkdir(work, {recursive:true});
  const requested = env.BRAVE_TAG || '';
  const release = await request('/repos/brave/brave-browser/releases/' +
    (requested ? 'tags/' + tagName(requested) : 'latest'));
  const official = releaseIdentity(release), {tag} = official;
  check(!requested || tag === requested, 'Official release tag mismatch');
  const metadata = await contractMetadata();
  const existing = await request(`/repos/${REPOSITORY}/contents/${RELEASE_ROOT}/${tag}.json?ref=${BRANCH}`, 'GET', undefined, true);
  let known = false;
  if (existing) {
    check(existing.encoding === 'base64' && existing.size > 0 && existing.size <= 65536 &&
      typeof existing.content === 'string' && existing.content.length <= 90000, 'Invalid published release record');
    try {
      const record = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
      known = record.tag === tag && hexHash(record.sha256) &&
        Object.entries(metadata).every(([key, value]) => same(record[key], value)) &&
        same(record.assets, official.assets);
    } catch { /* A broken record requires regeneration. */ }
  }
  const needed = !known || env.FORCE_REBUILD === 'true';
  const plan = {...official, ...metadata, modSourceSha256:await modSourceHash(modSource), needed};
  await fs.writeFile(path.join(work, 'plan.json'), JSON.stringify(plan, null, 2));
  await emit('needed', String(needed)); await emit('tag', tag);
  return plan;
}
async function download(url, destination, limit) {
  const u = new URL(url);
  check(u.protocol === 'https:' && ['github.com','brave-symbols.s3.brave.com'].includes(u.hostname),
    'Unexpected download origin');
  const r = await fetch(url, {headers:{'User-Agent':'brave-acrylic-compatibility'},
    signal:AbortSignal.timeout(15 * 60000)});
  check(r.ok && r.body, 'Official download unavailable (' + r.status + ')');
  const final = new URL(r.url);
  check(final.protocol === 'https:' && (final.hostname === u.hostname ||
    (u.hostname === 'github.com' && /^(release-assets|objects)\.githubusercontent\.com$/.test(final.hostname))),
    'Unexpected download redirect');
  const advertised = r.headers.get('content-length');
  if (advertised) check(/^\d+$/.test(advertised) && Number(advertised) <= limit, 'Download exceeds size limit');
  let bytes = 0;
  // Node fetch decodes the symbol server's Content-Encoding:gzip while streaming.
  const bound = new Transform({transform(chunk, encoding, done) {
    bytes += chunk.length;
    done(bytes > limit ? Error('Decoded download exceeds size limit') : null, chunk);
  }});
  try { await pipeline(Readable.fromWeb(r.body), bound, createWriteStream(destination, {flags:'wx'})); }
  catch (e) { await fs.unlink(destination).catch(() => {}); throw e; }
  return bytes;
}
async function shaFile(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function build() {
  const plan = JSON.parse(await fs.readFile(path.join(WORK, 'plan.json'), 'utf8'));
  tagName(plan.tag); check(plan.needed === true, 'No generation requested');
  check(plan.name === `brave-${plan.tag}-win32-x64.zip`, 'Unexpected archive name');
  const metadata = await contractMetadata();
  check(Object.entries(metadata).every(([key, value]) => same(plan[key], value)), 'Stale generation contract');
  const official = releaseIdentity(await api('/repos/brave/brave-browser/releases/tags/' + plan.tag));
  check(official.tag === plan.tag && same(official.assets, plan.assets), 'Official assets changed; prepare again');
  const out = path.join(WORK, 'out'); await fs.mkdir(out, {recursive:true});
  const zip = path.join(WORK, 'brave.zip'), sums = path.join(WORK, 'archive.sha256');
  const dll = path.join(WORK, 'chrome.dll'), pdb = path.join(WORK, 'chrome.dll.pdb');
  const base = `https://github.com/brave/brave-browser/releases/download/${plan.tag}/${plan.name}`;
  const started = Date.now();
  await download(base + '.sha256', sums, 4096);
  check((await fs.stat(sums)).size === plan.assets.checksum.size &&
    (!plan.assets.checksum.digest || plan.assets.checksum.digest === 'sha256:' + await shaFile(sums)),
    'Official checksum asset changed');
  const checksumText = await fs.readFile(sums, 'utf8');
  const checksum = /^([0-9a-f]{64})\s+\*?([^\r\n]+)\s*$/i.exec(checksumText);
  check(checksum && checksum[2].trim() === plan.name, 'Invalid official archive checksum');
  await download(base, zip, 1024 ** 3);
  const archiveHash = await shaFile(zip);
  check((await fs.stat(zip)).size === plan.assets.archive.size && archiveHash === checksum[1].toLowerCase() &&
    (!plan.assets.archive.digest || plan.assets.archive.digest === 'sha256:' + archiveHash),
    'Official archive size or SHA256 mismatch');
  // Extract just the DLL to a fixed path. Never execute the downloaded browser,
  // follow archive paths, or unpack a PDB's source-server commands.
  const extract = spawnSync(process.env.PYTHON || 'python3', ['-I', '-c',
    'import zipfile,sys,shutil\nwith zipfile.ZipFile(sys.argv[1]) as z:\n' +
    ' files=[i for i in z.infolist() if i.filename.replace("\\\\","/").split("/")[-1]=="chrome.dll"]\n' +
    ' if len(files)!=1 or files[0].file_size>1024**3: raise ValueError("Invalid chrome.dll entry")\n' +
    ' with z.open(files[0]) as src, open(sys.argv[2],"xb") as dst: shutil.copyfileobj(src,dst)\n', zip, dll],
  {encoding:'utf8', windowsHide:true});
  check(extract.status === 0, 'Unable to extract the official chrome.dll: ' + (extract.stderr || extract.error || ''));
  await fs.unlink(zip);
  const {PeImage} = require('./symbol-map.cjs');
  const pe = new PeImage(await fs.readFile(dll));
  const url = `https://brave-symbols.s3.brave.com/chrome.dll.pdb/${pe.identity.key}/chrome.dll.pdb`;
  const disk = await fs.statfs(WORK);
  check(Number(disk.bavail) * Number(disk.bsize) >= 8 * 1024 ** 3, 'Not enough free space for the official symbols');
  console.log('Downloading symbols for exact build ' + pe.identity.key);
  await download(url, pdb, 12 * 1024 ** 3);
  const result = await generate(dll, pdb, path.join(out, 'cache.txt'));
  const featureLines = Object.entries(result.features).map(([name,status]) =>
    `${status.available ? 'Available' : 'Unavailable'}: ${name}${status.available ? '' : ' — ' + status.reasons.join('; ')}`);
  console.log(featureLines.join('\n'));
  for (const [name,status] of Object.entries(result.features))
    if (!status.available) console.log(`::warning title=Brave feature unavailable::${name}: ${status.reasons.join('; ')}`);
  const record = {...result, ...metadata, tag:plan.tag, assets:plan.assets,
    modSourceSha256:await modSourceHash(),
    createdUtc:new Date().toISOString(), source:{release:base, archiveSha256:checksum[1].toLowerCase(),
      dllSha256:await shaFile(dll), symbols:url}, elapsedMs:Date.now() - started};
  await fs.writeFile(path.join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
  await verify(out, {allowLegacy:false});
  await writeFeatureSummary(plan.tag, record.features);
  console.log('Generated ' + (await fs.stat(path.join(out, 'cache.txt'))).size + ' bytes in ' + Math.round(record.elapsedMs / 1000) + ' seconds');
}
async function verify(directory, {modSource} = {}) {
  const names = (await fs.readdir(directory)).sort();
  check(same(names, ['cache.txt', 'record.json']), 'Unexpected generated artifact files');
  for (const [name, max] of [['cache.txt', MAP_SIZE], ['record.json', 65536]]) {
    const stat = await fs.lstat(path.join(directory, name));
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= max, 'Invalid generated artifact size or type');
  }
  const map = await fs.readFile(path.join(directory, 'cache.txt'));
  const record = JSON.parse(await fs.readFile(path.join(directory, 'record.json'), 'utf8'));
  const identity = validateMap(map);
  tagName(record.tag);
  const metadata = await contractMetadata();
  check(Object.entries(metadata).every(([key, value]) => same(record[key], value)) && validCacheKey(record.key) &&
    record.sha256 === hash(map) && record.modSourceSha256 === await modSourceHash(modSource),
    'Invalid generated artifact');
  check(record.machine === identity.machine && record.timestamp === identity.timestamp &&
    record.imageSize === identity.imageSize && Number.isSafeInteger(record.records) && record.records >= REQUIRED_SLOTS.length &&
    Number.isSafeInteger(record.dbiAge) && record.dbiAge > 0 &&
    record.key.slice(32) === record.dbiAge.toString(16).toUpperCase() && Number.isSafeInteger(record.infoAge) &&
    record.infoAge >= record.dbiAge,
    'Invalid generated identity metadata');
  const name = `brave-${record.tag}-win32-x64.zip`;
  check(same(record.assets, {archive:assetIdentity(record.assets?.archive, name, 1024 ** 3),
    checksum:assetIdentity(record.assets?.checksum, name + '.sha256', 4096)}), 'Invalid asset provenance');
  check(record.source?.symbols === `https://brave-symbols.s3.brave.com/chrome.dll.pdb/${record.key}/chrome.dll.pdb`,
    'Unexpected symbol provenance');
  check(record.source.release === `https://github.com/brave/brave-browser/releases/download/${record.tag}/brave-${record.tag}-win32-x64.zip` &&
    hexHash(record.source.archiveSha256) && hexHash(record.source.dllSha256) &&
    (!record.assets.archive.digest || record.assets.archive.digest === 'sha256:' + record.source.archiveSha256) &&
    same(record.functions,SYMBOLS.flatMap((name,i) => identity.entries[i] ? [{name,rva:identity.entries[i].rva}] : [])) &&
    record.features && same(Object.keys(record.features),Object.keys(FEATURES)) &&
    Object.entries(record.features).every(([name,status]) =>
      status.available === identity.features[name].available && Array.isArray(status.missing) && Array.isArray(status.reasons) &&
      status.missing.length === status.reasons.length && status.missing.length <= SYMBOLS.length &&
      [...status.missing,...status.reasons].every(text => typeof text === 'string' && text.length <= 1024)),
  'Invalid generated provenance or ABI slots');
  return {map, record};
}
function requirePublisher() {
  check(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === 'refs/heads/main',
    'Publishing is allowed only from the owner repository default branch');
  check(process.env.GH_TOKEN, 'Publishing token is required');
}
async function publish() {
  requirePublisher();
  const {map, record} = await verify(path.join(WORK, 'out'), {allowLegacy:false});
  const official = releaseIdentity(await api('/repos/brave/brave-browser/releases/tags/' + record.tag));
  check(official.tag === record.tag && same(official.assets, record.assets), 'Official assets changed before publication');
  const ref = await api(`/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`, 'GET', undefined, true);
  const commit = ref ? await api(`/repos/${REPOSITORY}/git/commits/${ref.object.sha}`) : null;
  const files = [
    [`${CACHE_ROOT}/pdb_${record.key}.txt`, map, 'base64'],
    [`${RELEASE_ROOT}/${record.tag}.json`, Buffer.from(JSON.stringify(record, null, 2) + '\n'), 'utf-8'],
  ];
  // Older releases remain on the branch; source code and contributor history
  // stay on main. This branch contains generated data, never executable updates.
  const tree = [];
  for (const [name, bytes, encoding] of files) {
    const blob = await api(`/repos/${REPOSITORY}/git/blobs`, 'POST',
      {content:bytes.toString(encoding === 'base64' ? 'base64' : 'utf8'), encoding});
    tree.push({path:name, mode:'100644', type:'blob', sha:blob.sha});
  }
  const result = await api(`/repos/${REPOSITORY}/git/trees`, 'POST',
    {base_tree:commit?.tree.sha, tree});
  if (commit?.tree.sha === result.sha) { console.log('Generated data is already published'); return; }
  const next = await api(`/repos/${REPOSITORY}/git/commits`, 'POST',
    {message:`Compatibility data for Brave ${record.tag}`, tree:result.sha,
      parents:ref ? [ref.object.sha] : [],
      author:{name:'github-actions[bot]', email:'41898282+github-actions[bot]@users.noreply.github.com'}});
  if (ref) await api(`/repos/${REPOSITORY}/git/refs/heads/${BRANCH}`, 'PATCH', {sha:next.sha, force:false});
  else await api(`/repos/${REPOSITORY}/git/refs`, 'POST', {ref:'refs/heads/' + BRANCH, sha:next.sha});
  console.log(`Published ${CACHE_ROOT}/pdb_${record.key}.txt on ${BRANCH}`);
}
async function publishedFeatures(official) {
  const {tag} = official;
  tagName(tag);
  const contents = '/repos/' + REPOSITORY + '/contents/';
  const file = await api(contents + RELEASE_ROOT + '/' + tag + '.json?ref=' + BRANCH, 'GET', undefined, true);
  if (!file) return null;
  const record = JSON.parse(decodeFile(file, 65536).toString('utf8'));
  const metadata = await contractMetadata();
  if (!Object.entries(metadata).every(([key, value]) => same(record[key], value)) ||
      !same(record.assets, official.assets)) return null;
  check(record.tag === tag && validCacheKey(record.key) && hexHash(record.sha256),
    'Invalid published release record');
  const cache = await api(contents + CACHE_ROOT + '/pdb_' + record.key + '.txt?ref=' + BRANCH);
  const map = decodeFile(cache, MAP_SIZE);
  check(hash(map) === record.sha256, 'Published cache checksum mismatch');
  return validateMap(map).features;
}
async function report() {
  const plan = JSON.parse(await fs.readFile(path.join(WORK, 'plan.json'), 'utf8'));
  check(plan.needed === false, 'No published cache report requested');
  const features = await publishedFeatures(plan);
  check(features, 'The published cache has changed since the release check');
  await writeFeatureSummary(plan.tag, features);
  console.log('Reported published feature compatibility for ' + plan.tag);
}
async function syncReadme() {
  requirePublisher();
  const official = releaseIdentity(await api('/repos/brave/brave-browser/releases/latest'));
  const features = await publishedFeatures(official);
  if (!features) {
    console.log('Waiting for the published cache for ' + official.tag);
    return;
  }
  const {tag} = official;
  const route = '/repos/' + REPOSITORY + '/contents/README.md';
  const block = [
    'Stable Brave [' + tag + '](https://github.com/brave/brave-browser/releases/tag/' + tag + ') on Windows x64.',
    '',
    ...featureTable(features),
    '',
    '[Published cache record](https://github.com/' + REPOSITORY + '/blob/' + BRANCH + '/' + RELEASE_ROOT + '/' + tag + '.json)',
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await api(route + '?ref=main');
    const readme = decodeFile(file, 1024 ** 2).toString('utf8');
    const start = readme.indexOf(README_START);
    const end = readme.indexOf(README_END);
    check(start >= 0 && end >= start + README_START.length &&
      start === readme.lastIndexOf(README_START) && end === readme.lastIndexOf(README_END),
      'Missing or ambiguous compatibility markers in README.md');
    const newline = readme.includes('\r\n') ? '\r\n' : '\n';
    const updated = readme.slice(0, start + README_START.length) +
      ['', '', ...block, '', ''].join(newline) + readme.slice(end);
    if (updated === readme) {
      console.log('README already reports Brave compatibility for ' + tag);
      return;
    }
    try {
      await api(route, 'PUT', {branch:'main', sha:file.sha, content:Buffer.from(updated).toString('base64'),
        message:'docs: update Brave compatibility for ' + tag});
      console.log('Updated the README compatibility table for ' + tag);
      return;
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
    }
  }
}
module.exports = {tagName, verify, prepare, build, publish, report, syncReadme, contractMetadata, assetIdentity, releaseIdentity, BRANCH,CACHE_ROOT,RELEASE_ROOT};
if (require.main === module) {
  const mode = process.argv[2];
  const action = {prepare, build, publish, report, 'sync-readme':syncReadme,
    verify:() => verify(path.join(WORK, 'out'), {allowLegacy:false})}[mode];
  if (!action) { console.error('Usage: node tools/update-compatibility.cjs prepare|build|verify|publish|report|sync-readme'); process.exitCode = 1; }
  else action().catch(e => { console.error(e.message); process.exitCode = 1; });
}
