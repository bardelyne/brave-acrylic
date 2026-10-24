// MIT. GitHub Actions producer for data-only, exact-build compatibility files.
'use strict';
const fs = require('node:fs/promises');
const {createWriteStream, createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {spawnSync} = require('node:child_process');
const {FORMAT, MAP_SIZE, SYMBOLS, generate, validateMap} = require('./symbol-map.cjs');
const REPOSITORY = 'bardelyne/brave-acrylic';
const BRANCH = 'compatibility-v1';
const EXTRACTOR = 1;
const WORK = path.resolve(process.env.COMPATIBILITY_WORK_DIR ||
  (process.env.RUNNER_TEMP ? path.join(process.env.RUNNER_TEMP, 'brave-compatibility') : 'compatibility-work'));
const API = 'https://api.github.com';
function check(ok, message) { if (!ok) throw Error(message); }
function tagName(value) {
  check(/^v\d{1,3}\.\d{1,3}\.\d{1,5}$/.test(value), 'Expected a stable Brave tag such as v1.98.60');
  return value;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
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
async function prepare() {
  await fs.mkdir(WORK, {recursive:true});
  const requested = process.env.BRAVE_TAG || '';
  const release = await api('/repos/brave/brave-browser/releases/' +
    (requested ? 'tags/' + tagName(requested) : 'latest'));
  const tag = tagName(release.tag_name);
  check(!release.draft && !release.prerelease, 'Only stable Brave releases are generated automatically');
  const name = `brave-${tag}-win32-x64.zip`;
  const asset = release.assets.find(a => a.name === name);
  const checksum = release.assets.find(a => a.name === name + '.sha256');
  check(asset && checksum && asset.size > 0 && asset.size <= 1024 ** 3, 'Missing or oversized x64 release asset');
  const existing = await api(`/repos/${REPOSITORY}/contents/releases/${tag}.json?ref=${BRANCH}`, 'GET', undefined, true);
  let known = false;
  if (existing) {
    check(existing.encoding === 'base64' && existing.size < 16384, 'Invalid published release record');
    const record = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
    known = record.format === FORMAT && record.extractor === EXTRACTOR && record.tag === tag;
  }
  const needed = !known || process.env.FORCE_REBUILD === 'true';
  await fs.writeFile(path.join(WORK, 'plan.json'), JSON.stringify({tag, name,
    size:asset.size, needed}, null, 2));
  await output('needed', String(needed)); await output('tag', tag);
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
  tagName(plan.tag); check(plan.needed, 'No generation requested');
  check(plan.name === `brave-${plan.tag}-win32-x64.zip`, 'Unexpected archive name');
  const out = path.join(WORK, 'out'); await fs.mkdir(out, {recursive:true});
  const zip = path.join(WORK, 'brave.zip'), sums = path.join(WORK, 'archive.sha256');
  const dll = path.join(WORK, 'chrome.dll'), pdb = path.join(WORK, 'chrome.dll.pdb');
  const base = `https://github.com/brave/brave-browser/releases/download/${plan.tag}/${plan.name}`;
  const started = Date.now();
  await download(base + '.sha256', sums, 4096);
  const checksumText = await fs.readFile(sums, 'utf8');
  const checksum = /^([0-9a-f]{64})\s+\*?([^\r\n]+)\s*$/i.exec(checksumText);
  check(checksum && checksum[2].trim() === plan.name, 'Invalid official archive checksum');
  await download(base, zip, 1024 ** 3);
  check((await shaFile(zip)) === checksum[1].toLowerCase(), 'Official archive SHA256 mismatch');
  // Extract just the DLL to a fixed path. Never execute the downloaded browser,
  // follow archive paths, or unpack a PDB's source-server commands.
  const extract = spawnSync(process.env.PYTHON || 'python3', ['-c',
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
  const result = await generate(dll, pdb, path.join(out, 'map.bin'));
  const record = {...result, tag:plan.tag, extractor:EXTRACTOR,
    createdUtc:new Date().toISOString(), source:{release:base, archiveSha256:checksum[1].toLowerCase(),
      dllSha256:await shaFile(dll), symbols:url}, elapsedMs:Date.now() - started};
  await fs.writeFile(path.join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
  await verify(out);
  console.log('Generated ' + MAP_SIZE + ' bytes in ' + Math.round(record.elapsedMs / 1000) + ' seconds');
}
async function verify(directory) {
  const map = await fs.readFile(path.join(directory, 'map.bin'));
  const record = JSON.parse(await fs.readFile(path.join(directory, 'record.json'), 'utf8'));
  const identity = validateMap(map);
  tagName(record.tag);
  check(record.format === FORMAT && record.extractor === EXTRACTOR && record.key === identity.key &&
    record.sha256 === hash(map), 'Invalid generated artifact');
  check(record.source?.symbols === `https://brave-symbols.s3.brave.com/chrome.dll.pdb/${identity.key}/chrome.dll.pdb`,
    'Unexpected symbol provenance');
  check(record.source.release === `https://github.com/brave/brave-browser/releases/download/${record.tag}/brave-${record.tag}-win32-x64.zip` &&
    /^[a-f0-9]{64}$/.test(record.source.archiveSha256) && /^[a-f0-9]{64}$/.test(record.source.dllSha256) &&
    record.functions?.length === SYMBOLS.length && record.functions.every((f,i) =>
      f.name === SYMBOLS[i] && f.rva === identity.addresses[i] && f.length === map.readUInt32LE(44+i*72)),
  'Invalid generated provenance or ABI slots');
  return {map, record};
}
async function publish() {
  check(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === 'refs/heads/main',
    'Publishing is allowed only from the owner repository default branch');
  check(process.env.GH_TOKEN, 'Publishing token is required');
  const {map, record} = await verify(path.join(WORK, 'out'));
  const ref = await api(`/repos/${REPOSITORY}/git/ref/heads/${BRANCH}`, 'GET', undefined, true);
  const commit = ref ? await api(`/repos/${REPOSITORY}/git/commits/${ref.object.sha}`) : null;
  const files = [
    [`maps/${record.key}.bin`, map, 'base64'],
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
  console.log(`Published maps/${record.key}.bin on ${BRANCH}`);
}
module.exports = {tagName, verify, prepare, build, publish};
if (require.main === module) {
  const mode = process.argv[2];
  const action = {prepare, build, publish, verify:() => verify(path.join(WORK, 'out'))}[mode];
  if (!action) { console.error('Usage: node tools/update-compatibility.cjs prepare|build|verify|publish'); process.exitCode = 1; }
  else action().catch(e => { console.error(e.message); process.exitCode = 1; });
}
