// End-to-end extraction and publication with the exact pinned code, tiny real
// PE/PDB/ZIP fixtures, real isolated Python extraction, and no external writes.
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname,'..');
const PIN = require('node:fs').readFileSync(path.join(root,'.github/workflows/compatibility.yml'),'utf8').match(/ref: ([a-f0-9]{40})/)[1];
const REPO = 'bardelyne/brave-acrylic';
const SOURCE = '// @version 3.4\n// Fixed fixture input.\n';
const hash = b => createHash('sha256').update(b).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));
const quiet = {log() {}, error() {}};
function git(...args) {
  const result = cp.spawnSync('git',args,{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});
  if (result.status !== 0) throw Error(result.stderr.toString());
  return result.stdout;
}
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'brave-gate-workflow-'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'brave-gate-workflow-'));
    return fs.rm(dir,{recursive:true,force:true});
  });
  return dir;
}
async function snapshot(dir) {
  const target = path.join(dir,'pinned-extractor');
  const names = git('ls-tree','-r','--name-only',PIN).toString().trim().split('\n')
    .filter(n => n.startsWith('tools/') || n.startsWith('tests/') || n === 'brave-acrylic.wh.cpp');
  for (const name of names) {
    const filename = path.join(target,name); await fs.mkdir(path.dirname(filename),{recursive:true});
    await fs.writeFile(filename,git('show',PIN+':'+name));
  }
  return target;
}
function zip(entries) {
  const crc32 = data => {
    let c = 0xffffffff;
    for (const b of data) { c ^= b; for(let n=0;n<8;n++) c = c>>>1 ^ (c&1 ? 0xedb88320 : 0); }
    return (c^0xffffffff)>>>0;
  };
  const locals=[],centrals=[]; let offset=0;
  for (const [filename,data] of entries) {
    const name=Buffer.from(filename),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);
    local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);
    central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    locals.push(local,name,data);centrals.push(central,name);offset+=local.length+name.length+data.length;
  }
  const end=Buffer.alloc(22),central=Buffer.concat(centrals);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
async function context(t, sourceRoot, {zipEntries, badPdb=false}={}) {
  const base=await temporary(t),work=path.join(base,'work'),shadow=path.join(base,'untrusted-cwd');
  await fs.mkdir(work,{recursive:true});await fs.mkdir(shadow);
  // The real Python child must ignore attacker-controlled module names in cwd.
  await fs.writeFile(path.join(shadow,'zipfile.py'),'raise Exception("UNTRUSTED PYTHON MODULE EXECUTED")\n');
  await fs.writeFile(path.join(shadow,'sitecustomize.py'),'raise Exception("UNTRUSTED STARTUP MODULE EXECUTED")\n');
  const fixtureRequire=createRequire(path.join(sourceRoot,'tests/fixtures-v6.cjs'));
  const protocol=fixtureRequire('../tools/feature-cache.cjs');
  const cacheRoot=protocol.CACHE_ROOT||'brave-acrylic-features',releaseRoot=protocol.RELEASE_ROOT||'feature-releases';
  const {fixturePeV6,fixturePdbV6}=fixtureRequire('./fixtures-v6.cjs');
  const {PeImage}=fixtureRequire('../tools/symbol-map-v6.cjs');
  const dll=fixturePeV6(),pe=new PeImage(dll),pdb=fixturePdbV6(pe);
  if(badPdb)pdb[3*512+12]^=1;
  const entries=zipEntries ? zipEntries(dll) : [['Application/chrome.dll',dll],['../must-not-extract.txt',Buffer.from('untrusted archive entry')]];
  const archive=zip(entries),tag='v1.98.60',name=`brave-${tag}-win32-x64.zip`;
  const sums=Buffer.from(hash(archive)+'  '+name+'\n');
  const official={tag_name:tag,draft:false,prerelease:false,assets:[
    {id:42,name,size:archive.length,updated_at:'2026-10-24T12:00:00Z',digest:'sha256:'+hash(archive)},
    {id:43,name:name+'.sha256',size:sums.length,updated_at:'2026-10-24T12:00:00Z',digest:'sha256:'+hash(sums)}
  ]};
  const state={calls:[],spawn:[],writes:[],blobs:[],published:null,record:null,cacheRoot,releaseRoot,
    artifact:null,official,archive,sums,pdb,existing:null,downloadOverride:null,sourceRoot,work,base,shadow,pe};
  const env={...process.env,GH_TOKEN:'LOCAL-MOCK-TOKEN-NOT-SENT',GITHUB_REPOSITORY:REPO,
    GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'456',GITHUB_SHA:'a'.repeat(40),
    COMPATIBILITY_WORK_DIR:work,PYTHON:process.env.PYTHON || 'python',TRUSTED_ARTIFACT_ID:'123'};
  delete env.GITHUB_OUTPUT;delete env.BRAVE_TAG;delete env.FORCE_REBUILD;
  const json = value => new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  const fetch = async (url,options={}) => {
    const u=new URL(url),method=options.method || 'GET';state.calls.push({url,method});
    if(u.hostname==='api.github.com') {
      const route=u.pathname+u.search;
      if(method==='GET') {
        if(route==='/repos/brave/brave-browser/releases/latest' || route==='/repos/brave/brave-browser/releases/tags/'+tag)return json(clone(state.official));
        if(route===`/repos/${REPO}/contents/${releaseRoot}/${tag}.json?ref=symbol-cache`)
          return state.existing ? json(state.existing) : new Response('',{status:404});
        if(route===`/repos/${REPO}/actions/artifacts/123`)return json(state.artifact);
        if(route===`/repos/${REPO}/git/ref/heads/symbol-cache`)return new Response('',{status:404});
      }
      // Writes exist only inside this fetch mock. No network tool is invoked.
      const body=options.body ? JSON.parse(options.body) : undefined;
      state.writes.push({route,method,body});
      if(route===`/repos/${REPO}/git/blobs` && method==='POST') {
        state.blobs.push(body);return json({sha:hash(JSON.stringify(body)).slice(0,40)});
      }
      if(route===`/repos/${REPO}/git/trees` && method==='POST') {state.published=body;return json({sha:'b'.repeat(40)});}
      if(route===`/repos/${REPO}/git/commits` && method==='POST')return json({sha:'c'.repeat(40)});
      if(route===`/repos/${REPO}/git/refs` && method==='POST')return json({});
      throw Error('Unexpected mocked API request: '+method+' '+route);
    }
    assert.equal(method,'GET');assert.equal(options.headers.Authorization,undefined);
    let bytes;
    if(url===`https://github.com/brave/brave-browser/releases/download/${tag}/${name}.sha256`)bytes=state.sums;
    else if(url===`https://github.com/brave/brave-browser/releases/download/${tag}/${name}`)bytes=state.archive;
    else if(url===`https://brave-symbols.s3.brave.com/chrome.dll.pdb/${pe.identity.key}/chrome.dll.pdb`)bytes=state.pdb;
    else throw Error('Unexpected external download: '+url);
    let finalUrl=url;
    if(state.downloadOverride) ({bytes,finalUrl}=state.downloadOverride({url,bytes,finalUrl}));
    const response=new Response(bytes,{headers:{'content-length':String(bytes.length)}});
    Object.defineProperty(response,'url',{value:finalUrl});return response;
  };
  const filename=path.join(sourceRoot,'tools/update-compatibility.cjs'),realRequire=createRequire(filename);
  const module={exports:{}};
  const requireMock = name => name==='node:child_process' ? {spawnSync(command,args,options) {
    state.spawn.push({command,args});assert.equal(args[0],'-I');
    return cp.spawnSync(command,args,{...options,cwd:shadow});
  }} : realRequire(name);
  const sandbox={Buffer,URL,Response,AbortSignal,console:quiet,fetch,process:{env},setTimeout,clearTimeout};
  const wrapper=vm.runInNewContext('(function(require,module,exports,__filename,__dirname){\n'+await fs.readFile(filename,'utf8')+'\n})',sandbox,{filename});
  wrapper(requireMock,module,module.exports,filename,path.dirname(filename));
  const actions=module.exports;
  async function prepare(extraEnv={}) {return actions.prepare({env:{...env,...extraEnv},modSource:SOURCE,emit:async()=>{}});}
  async function build() {
    await prepare();await actions.build();
    const map=await fs.readFile(path.join(work,'out/cache.txt'));
    state.record=JSON.parse(await fs.readFile(path.join(work,'out/record.json'),'utf8'));
    state.artifact={id:123,name:`pdb_${pe.identity.key}.txt`,size_in_bytes:map.length,digest:'sha256:'+hash(map),
      workflow_run:{id:456,head_sha:env.GITHUB_SHA,head_branch:'main',repository_id:1428612836,head_repository_id:1428612836}};
    return map;
  }
  return {state,env,actions,prepare,build};
}

test('approved pinned pipeline really builds and publishes a tiny official-shaped PE/PDB fixture',async t=>{
  const dir=await temporary(t),pinned=await snapshot(dir);
  const run=await context(t,pinned),cache=await run.build();
  assert.equal(run.state.spawn.length,1);assert.equal(run.state.spawn[0].args[0],'-I');
  assert.equal(await fs.readFile(path.join(run.state.work,'chrome.dll')).then(hash),hash(run.state.pe.bytes));
  await assert.rejects(fs.stat(path.join(run.state.work,'must-not-extract.txt')),/ENOENT/);
  assert.deepEqual(Buffer.from(await fs.readFile(path.join(run.state.work,'trusted',run.state.artifact.name))),cache);
  await run.actions.publish();
  assert.equal(run.state.writes.length,6);assert.equal(run.state.blobs.length,3);
  assert.equal(Buffer.from(run.state.blobs[0].content,'base64').equals(cache),true);
  const proof=JSON.parse(run.state.blobs[1].content);
  assert.equal(proof.artifactId,123);assert.equal(proof.sha256,hash(cache));
  assert.deepEqual(run.state.published.tree.map(v=>v.path),[
    `${run.state.cacheRoot}/pdb_${run.state.pe.identity.key}.txt`,`${run.state.cacheRoot}/pdb_${run.state.pe.identity.key}.proof.json`,`${run.state.releaseRoot}/v1.98.60.json`]);
  assert.equal(run.state.calls.filter(v=>v.method!=='GET').length,6);
});

test('replacing cache plus claimed hash/addresses cannot reuse a legitimate artifact (pinned publisher)',async t=>{
  const pinned=await snapshot(await temporary(t)),run=await context(t,pinned),cache=await run.build();
  const fields=cache.toString().split('#');fields[4]=String(Number(fields[4])+1);
  const malicious=Buffer.from(fields.join('#')),record=clone(run.state.record);
  record.sha256=hash(malicious);record.functions[0].rva++;
  await fs.writeFile(path.join(run.state.work,'out/cache.txt'),malicious);
  await fs.writeFile(path.join(run.state.work,'out/record.json'),JSON.stringify(record));
  // Internally consistent author metadata alone is not a trusted provenance proof.
  await run.actions.verify(path.join(run.state.work,'out'));
  await assert.rejects(run.actions.publish(),/artifact does not match/i);
  assert.equal(run.state.writes.length,0);
});

test('pinned publisher refuses swapped PDB identity, artifact, run, revision, branch, fork or digest before any write',async t=>{
  const pinned=await snapshot(await temporary(t)),run=await context(t,pinned);await run.build();
  const good=clone(run.state.artifact);
  for(const mutate of [a=>a.name='pdb_'+'B'.repeat(32)+'1.txt',a=>a.id++,a=>a.digest='sha256:'+'b'.repeat(64),
    a=>a.size_in_bytes++,a=>a.workflow_run.id++,a=>a.workflow_run.head_sha='b'.repeat(40),
    a=>a.workflow_run.head_branch='attacker',a=>a.workflow_run.repository_id++,a=>a.workflow_run.head_repository_id++]) {
    run.state.artifact=clone(good);mutate(run.state.artifact);
    await assert.rejects(run.actions.publish());assert.equal(run.state.writes.length,0);
  }
});

test('manual workflow inputs cannot inject shell syntax, paths, output records or nonstable tags',async t=>{
  const pinned=await snapshot(await temporary(t)),run=await context(t,pinned);
  const inputs=['../v1.2.3','v1.2.3/../../x','v1.2.3;whoami','$(whoami)','v1.2.3\nneeded=true',
    'v1.2.3%0Aneeded=true','v1.2.3-beta','nightly','v1.2.3?x=y','v1.2.3#x','v1.2.3\\x','v1.2.3\0',
    'v1.2.3"','v1.2.3`',' v1.2.3','v9999.1.1','v1.1.999999'];
  for(const value of inputs) {
    const before=run.state.calls.length;
    await assert.rejects(run.prepare({BRAVE_TAG:value}));
    assert.equal(run.state.calls.length,before);assert.equal(run.state.spawn.length,0);
  }
});

test('pinned build rejects changed official assets, bad checksum and unapproved redirect before generating proof',async t=>{
  const pinned=await snapshot(await temporary(t));
  {
    const run=await context(t,pinned);await run.prepare();run.state.official.assets[0].id++;
    await assert.rejects(run.actions.build(),/assets changed/);assert.equal(run.state.spawn.length,0);
  }
  {
    const run=await context(t,pinned);await run.prepare();
    run.state.downloadOverride=({url,bytes,finalUrl})=>({bytes:url.endsWith('.zip')?Buffer.from(bytes).fill(0,0,1):bytes,finalUrl});
    await assert.rejects(run.actions.build(),/SHA256 mismatch/);assert.equal(run.state.spawn.length,0);
  }
  {
    const run=await context(t,pinned);await run.prepare();
    run.state.downloadOverride=({bytes})=>({bytes,finalUrl:'https://attacker.invalid/fake'});
    await assert.rejects(run.actions.build(),/redirect/);assert.equal(run.state.spawn.length,0);
  }
});

test('pinned build rejects mismatched PDB or multiple chrome.dll entries and produces no trusted output',async t=>{
  const pinned=await snapshot(await temporary(t));
  for(const options of [{badPdb:true},{zipEntries:dll=>[['a/chrome.dll',dll],['b/chrome.dll',dll]]}]) {
    const run=await context(t,pinned,options);
    await assert.rejects(run.build());
    await assert.rejects(fs.stat(path.join(run.state.work,'trusted')),/ENOENT/);
    assert.equal(run.state.writes.length,0);
  }
});

test('publication rights and token are checked before any request, even with valid generated output',async t=>{
  const pinned=await snapshot(await temporary(t)),run=await context(t,pinned);await run.build();
  for(const [key,bad] of [['GITHUB_REPOSITORY','attacker/fork'],['GITHUB_REF','refs/heads/attacker'],['GH_TOKEN','']]) {
    const old=run.env[key],before=run.state.calls.length;run.env[key]=bad;
    await assert.rejects(run.actions.publish());run.env[key]=old;
    assert.equal(run.state.calls.length,before);assert.equal(run.state.writes.length,0);
  }
});

test('tampering with author-controlled release records can stop generation, but does not authenticate data',async t=>{
  const pinned=await snapshot(await temporary(t)),run=await context(t,pinned);await run.build();
  const record=clone(run.state.record);record.pipelineProof={schema:1,artifactId:999999999,
    artifactName:`pdb_${record.key}.txt`,sha256:record.sha256};
  const bytes=Buffer.from(JSON.stringify(record));
  run.state.existing={encoding:'base64',size:bytes.length,content:bytes.toString('base64')};
  assert.equal((await run.prepare()).needed,false);
  // Deliberately document availability scope: an account owner can suppress
  // publication. The native verifier separately rejects a nonexistent proof.
  assert.equal((await run.prepare({FORCE_REBUILD:'true'})).needed,true);
});

test('approved workflow pins the effective source and actions; manual tag is passed as environment data',async()=>{
  const yaml=(await fs.readFile(path.join(root,'.github/workflows/compatibility.yml'),'utf8')).replaceAll('\r\n','\n');
  assert.equal([...yaml.matchAll(new RegExp('ref: '+PIN,'g'))].length,2);
  assert.equal([...yaml.matchAll(/uses: [^\s]+@[a-f0-9]{40}/g)].length,6);
  assert.equal((yaml.match(/runs-on: ubuntu-24\.04/g)||[]).length,2);
  assert.match(yaml,/BRAVE_TAG: \$\{\{ inputs\.tag \}\}/);
  assert.doesNotMatch(yaml,/run:[^\n]*\$\{\{[^}]*inputs\./);
  assert.doesNotMatch(yaml,/pull_request_target|workflow_call|secrets: inherit|persist-credentials: true|actions\/cache@/);
});
