// MIT. GitHub Actions producer for data-only, exact-build compatibility files.
'use strict';
const fs = require('node:fs/promises');
const {createWriteStream, createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {spawnSync} = require('node:child_process');
const {FORMAT, MAP_SIZE, EXTRACTOR, ABI_REVISION, CLIENT_VERSION,
  SYMBOLS, REQUIRED_SLOTS, generate, validateMap} = require('./symbol-cache.cjs');
const REPOSITORY = 'bardelyne/brave-acrylic';
const BRANCH = 'symbol-cache';
const WORK = path.resolve(process.env.COMPATIBILITY_WORK_DIR ||
  (process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, 'brave-compatibility') : 'compatibility-work'));
const API = 'https://api.github.com';
const {proofFor, artifactName} = require('./trusted-pipeline.cjs');
function check(ok, message) { if (!ok) throw Error(message); }
function tagName(value) {
  check(/^v\d{1,3}\.\d{1,3}\.\d{1,5}$/.test(value), 'Expected a stable Brave tag such as v1.98.60');
  return value;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
const hexHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function contractMetadata() {
  return {format:FORMAT, extractor:EXTRACTOR, abiRevision:ABI_REVISION, clientVersion:CLIENT_VERSION,
    modContract:{abiSha256:hash(JSON.stringify({format:FORMAT, abiRevision:ABI_REVISION,
      clientVersion:CLIENT_VERSION, maxCacheSize:MAP_SIZE, encoding:"Windhawk named-symbol cache v1",
      symbols:SYMBOLS,decoratedInputs:require('./symbol-map-v6.cjs').SYMBOLS,requiredSlots:REQUIRED_SLOTS,normal:{kind:0, minLength:16, minFixed:16, maxLength:32, unwind:true},
      leaf:{kind:1, slot:3, length:13, code:'4883B9????????00740331C0C3', fixed:13, unwind:false},
      focusLeaf:{kind:2,slot:6,length:32,fixed:32,unwind:false,
        layout:'4883B9????????007413488B81????????488B4028837818000F95C0C331C0C3'},
      namedThunk:{kind:3,slots:'any',opcode:0xE9,length:5,unwind:false,targetField:'reserved',body:'normal-unwind-or-approved-slot-leaf',
        ranges:'source-and-body-distinct-nonoverlapping-executable'},
      nativeAbi:{color:'float4-indirect',pageBase:'optional-color8-register-present-byte4',attach:'canonical-WebContents-before-native-attach'},
      aliases:'reject-all-thirteen-and-thunk-bodies'}))}};
}
async function modSourceHash(source) {
  return hash(source ?? await fs.readFile(path.join(__dirname, '..', 'brave-acrylic.wh.cpp')));
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function assetIdentity(asset, name, limit) {
  check(asset && asset.name === name && Number.isSafeInteger(asset.id) && asset.id > 0 &&
    Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= limit &&
    typeof asset.updated_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(asset.updated_at) &&
    Number.isFinite(Date.parse(asset.updated_at)) &&
    (asset.digest == null || /^sha256:[a-f0-9]{64}$/.test(asset.digest)), 'Invalid official release asset');
  return {id:asset.id, name, size:asset.size, updated_at:asset.updated_at, digest:asset.digest ?? null};
}
function releaseIdentity(release) {
  const tag = tagName(release.tag_name), name = `brave-${tag}-win32-x64.zip`;
  check(release.draft === false && release.prerelease === false && Array.isArray(release.assets),
    'Only stable Brave releases are generated automatically');
  const find = filename => {
    const matches = release.assets.filter(a => a.name === filename);
    check(matches.length === 1, 'Missing or ambiguous official asset'); return matches[0];
  };
  return {tag, name, assets:{archive:assetIdentity(find(name), name, 1024 ** 3),
    checksum:assetIdentity(find(name + '.sha256'), name + '.sha256', 4096)}};
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
  check(r.ok, 'GitHub API request failed (' + r.status + ')');
  return r.json();
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
  const existing = await request(`/repos/${REPOSITORY}/contents/releases/${tag}.json?ref=${BRANCH}`, 'GET', undefined, true);
  let known = false;
  if (existing) {
    check(existing.encoding === 'base64' && existing.size > 0 && existing.size <= 16384 &&
      typeof existing.content === 'string' && existing.content.length <= 24000, 'Invalid published release record');
    try {
      const record = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
      known = record.tag === tag && hexHash(record.sha256) &&
        record.pipelineProof?.schema === 1 && Number.isSafeInteger(record.pipelineProof.artifactId) &&
        record.pipelineProof.artifactId > 0 && record.pipelineProof.sha256 === record.sha256 &&
        record.pipelineProof.artifactName === artifactName(record.key) &&
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
  const record = {...result, ...metadata, tag:plan.tag, assets:plan.assets,
    modSourceSha256:await modSourceHash(),
    createdUtc:new Date().toISOString(), source:{release:base, archiveSha256:checksum[1].toLowerCase(),
      dllSha256:await shaFile(dll), symbols:url}, elapsedMs:Date.now() - started};
  await fs.writeFile(path.join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
  await verify(out, {allowLegacy:false});
  const trusted = path.join(WORK, 'trusted');
  await fs.mkdir(trusted, {recursive:true});
  await fs.copyFile(path.join(out, 'cache.txt'), path.join(trusted, artifactName(record.key)));
  console.log('Generated ' + (await fs.stat(path.join(out, 'cache.txt'))).size + ' bytes in ' + Math.round(record.elapsedMs / 1000) + ' seconds');
}
async function verify(directory, {modSource} = {}) {
  const names = (await fs.readdir(directory)).sort();
  check(same(names, ['cache.txt', 'record.json']), 'Unexpected generated artifact files');
  for (const [name, max] of [['cache.txt', MAP_SIZE], ['record.json', 16384]]) {
    const stat = await fs.lstat(path.join(directory, name));
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= max, 'Invalid generated artifact size or type');
  }
  const map = await fs.readFile(path.join(directory, 'cache.txt'));
  const record = JSON.parse(await fs.readFile(path.join(directory, 'record.json'), 'utf8'));
  const identity = validateMap(map);
  tagName(record.tag);
  const metadata = await contractMetadata();
  check(Object.entries(metadata).every(([key, value]) => same(record[key], value)) && typeof record.key === "string" && /^[A-F0-9]{32}[1-9A-F][A-F0-9]{0,7}$/.test(record.key) &&
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
    record.functions?.length === SYMBOLS.length && record.functions.every((f,i) =>
      f.name === SYMBOLS[i] && f.rva === identity.entries[i].rva),
  'Invalid generated provenance or ABI slots');
  return {map, record};
}
async function publish() {
  check(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === 'refs/heads/main',
    'Publishing is allowed only from the owner repository default branch');
  check(process.env.GH_TOKEN, 'Publishing token is required');
  const {map, record} = await verify(path.join(WORK, 'out'), {allowLegacy:false});
  const official = releaseIdentity(await api('/repos/brave/brave-browser/releases/tags/' + record.tag));
  check(official.tag === record.tag && same(official.assets, record.assets), 'Official assets changed before publication');
  const artifactId = process.env.TRUSTED_ARTIFACT_ID || '';
  check(/^[1-9]\d{0,15}$/.test(artifactId), 'Missing raw-cache artifact identity');
  const artifact = await api(`/repos/${REPOSITORY}/actions/artifacts/${artifactId}`);
  check(artifact.id === Number(artifactId), 'Artifact identity mismatch');
  const proof = proofFor(artifact, {runId:Number(process.env.GITHUB_RUN_ID),
    headSha:process.env.GITHUB_SHA, sha256:hash(map), size:map.length, key:record.key});
  record.pipelineProof = proof;
  const ref = await api(`/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`, 'GET', undefined, true);
  const commit = ref ? await api(`/repos/${REPOSITORY}/git/commits/${ref.object.sha}`) : null;
  const files = [
    [`brave-acrylic/pdb_${record.key}.txt`, map, 'base64'],
    [`brave-acrylic/pdb_${record.key}.proof.json`, Buffer.from(JSON.stringify(proof) + '\n'), 'utf-8'],
    [`releases/${record.tag}.json`, Buffer.from(JSON.stringify(record, null, 2) + '\n'), 'utf-8'],
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
  console.log(`Published brave-acrylic/pdb_${record.key}.txt on ${BRANCH}`);
}
module.exports = {tagName, verify, prepare, build, publish, contractMetadata, assetIdentity, releaseIdentity, BRANCH};
if (require.main === module) {
  const mode = process.argv[2];
  const action = {prepare, build, publish, verify:() => verify(path.join(WORK, 'out'), {allowLegacy:false})}[mode];
  if (!action) { console.error('Usage: node tools/update-compatibility.cjs prepare|build|verify|publish'); process.exitCode = 1; }
  else action().catch(e => { console.error(e.message); process.exitCode = 1; });
}
