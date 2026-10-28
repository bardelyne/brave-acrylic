// MIT. Research only: official binaries/PDBs are read as data, never executed.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createWriteStream,createReadStream}=require('node:fs');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {spawnSync}=require('node:child_process');
const native=require('./symbol-map-v6.cjs');
const {tagName,releaseIdentity}=require('./update-compatibility.cjs');
const HOOK_SLOTS=new Set(native.HOOK_SLOTS);
function check(ok,why){if(!ok)throw Error(why);}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function shaFile(file){const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function json(url){
 const headers={'User-Agent':'BraveAcrylic-compiler-research','Accept':'application/vnd.github+json'};
 if(new URL(url).hostname==='api.github.com'&&process.env.GH_TOKEN)headers.Authorization='Bearer '+process.env.GH_TOKEN;
 const r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
 check(r.ok,'Metadata unavailable: '+r.status);return r.json();
}
async function download(url,file,maximum){
 const origin=new URL(url);check(origin.protocol==='https:'&&['github.com','brave-symbols.s3.brave.com'].includes(origin.hostname),'Unapproved input origin');
 const r=await fetch(url,{headers:{'User-Agent':'BraveAcrylic-compiler-research'},signal:AbortSignal.timeout(15*60000)});
 check(r.ok&&r.body,'Official input unavailable: '+r.status);
 const final=new URL(r.url);check(final.protocol==='https:'&&(final.hostname===origin.hostname||
  origin.hostname==='github.com'&&/^(release-assets|objects)\.githubusercontent\.com$/.test(final.hostname)),'Unapproved redirect');
 let size=0;const bound=new Transform({transform(b,_,next){size+=b.length;next(size>maximum?Error('Input exceeds bound'):null,b);}});
 await pipeline(Readable.fromWeb(r.body),bound,createWriteStream(file,{flags:'wx'}));return size;
}
async function scanPublics(pdb,pe,visit){
 const info=await pdb.stream(1,0,28),dbi=await pdb.stream(3,0,64);
 check(info.subarray(12,28).equals(pe.identity.guid)&&dbi.readUInt32LE(8)===pe.identity.age&&
  info.readUInt32LE(8)>=pe.identity.age&&dbi.readUInt16LE(58)===pe.machine,'PDB identity mismatch');
 const index=dbi.readUInt16LE(20),size=pdb.streams[index]?.size;
 check(size&&size<=2*1024**3,'Invalid symbol stream');let offset=0,records=0;
 while(offset<size){const b=await pdb.stream(index,offset,Math.min(8*1024**2,size-offset));let p=0;
  while(p+4<=b.length){const n=b.readUInt16LE(p)+2;check(n>=4,'Malformed record');if(p+n>b.length)break;
   if(b.readUInt16LE(p+2)===0x110e&&n>=15){const end=b.indexOf(0,p+14);check(end>=0&&end<p+n,'Unterminated symbol');
    const section=pe.sections[b.readUInt16LE(p+12)-1],within=b.readUInt32LE(p+8);
    if(section&&within<section.size)visit({name:b.toString('utf8',p+14,end),rva:section.rva+within});}
   p+=n;++records;
  }check(p>0,'Truncated record');offset+=p;
 }return {records,infoAge:info.readUInt32LE(8),dbiAge:dbi.readUInt32LE(8)};
}
function entryEvidence(pe,rva,slot){
 let fingerprint;try{const f=native.fingerprint(pe,rva,slot);fingerprint={accepted:true,kind:f.kind,length:f.length,reserved:f.reserved||0};}
 catch(e){fingerprint={accepted:false,error:e.message};}
 const chain=[],seen=new Set();let target=rva;
 for(let n=0;n<4&&!seen.has(target);n++){
  seen.add(target);let b;try{b=pe.read(target,8);}catch{break;}
  if(b[0]!==0xe9&&b[0]!==0xeb)break;
  const next=target+(b[0]===0xe9?5+b.readInt32LE(1):2+b.readInt8(1));
  chain.push({rva:target,target:next,opcode:b[0]});target=next;
 }
 function sample(at){try{
  const end=pe.functions.get(at),bytes=pe.read(at,Math.min(256,end?end-at:64));
  return {rva:at,unwindEnd:end||null,code:bytes.toString('hex'),sha256:sha(bytes)};
 }catch(e){return {rva:at,error:e.message};}}
 return {rva,role:HOOK_SLOTS.has(slot)?'hook':'call-only',fingerprint,chain,entry:sample(rva),body:sample(target)};
}
async function analyze(dll,pdbFile){
 const pe=new native.PeImage(await fs.readFile(dll)),pdb=await native.Pdb.open(pdbFile);
 try{
  const required=new Map(native.SYMBOLS.map(n=>[n,new Set()])),candidates=[];
  const summary=await scanPublics(pdb,pe,({name,rva})=>{
   if(required.has(name))required.get(name).add(rva);
   if(/\?HasFocus@|\?ShouldWindowContentsBeTransparent@|\?OnPaintBackground@|\?GetClassNameW@/.test(name))candidates.push({name,rva});
  });
  const functions=native.SYMBOLS.map((name,slot)=>({slot,name,role:HOOK_SLOTS.has(slot)?'hook':'call-only',
   entries:[...required.get(name)].map(rva=>entryEvidence(pe,rva,slot))}));
  const targets=new Set(functions.flatMap(f=>f.entries.flatMap(e=>[e.rva,e.body.rva,...e.chain.map(c=>c.target)])));
  const aliases=new Map([...targets].map(t=>[t,[]]));
  await scanPublics(pdb,pe,({name,rva})=>{if(aliases.has(rva))aliases.get(rva).push(name);});
  for(const f of functions)for(const entry of f.entries){
   entry.entryAliases=aliases.get(entry.rva)||[];entry.bodyAliases=aliases.get(entry.body.rva)||[];
  }
  let strict;try{const result=await pdb.symbols(pe,{names:native.SYMBOLS,rejectAliases:true,
   fingerprint:(rva,slot)=>native.fingerprint(pe,rva,slot)});native.encodeMap(pe,result.entries);strict={accepted:true};}
  catch(e){strict={accepted:false,error:e.message};}
  let candidate;try{const result=await native.resolveFunctions(pe,pdb);native.encodeMap(pe,result.entries);
   const bytes=require('./symbol-cache.cjs').encodeCache(pe,result.entries);
   candidate={accepted:true,cache:bytes.toString('ascii'),sha256:sha(bytes)};}
  catch(e){candidate={accepted:false,error:e.message};}
  return {key:pe.identity.key,machine:pe.machine,timestamp:pe.timestamp,imageSize:pe.imageSize,
   dllSha256:sha(pe.bytes),...summary,strict,candidate,functions,candidates};
 }finally{await pdb.close();}
}
async function disassemble(report,output){
 for(const f of report.functions)for(const [i,e]of f.entries.entries())for(const part of ['entry','body']){
  const sample=e[part];if(!sample.code)continue;
  const filename=path.join(output,`slot-${f.slot}-${i}-${part}.bin`);await fs.writeFile(filename,Buffer.from(sample.code,'hex'));
  const r=spawnSync('objdump',['-D','-b','binary','-m','i386:x86-64','-Mintel','--adjust-vma='+sample.rva,filename],{encoding:'utf8',timeout:10000,windowsHide:true});
  if(r.status===0)sample.disassembly=r.stdout.slice(0,24000);
  await fs.unlink(filename);
 }
}
async function collect(tag,work){
 tagName(tag);work=path.resolve(work);await fs.mkdir(work,{recursive:true});
 const output=path.join(work,'report');await fs.mkdir(output,{recursive:true});
 const official=await json('https://api.github.com/repos/brave/brave-browser/releases/tags/'+tag),identity=releaseIdentity(official);
 check(identity.tag===tag,'Release mismatch');
 const base=`https://github.com/brave/brave-browser/releases/download/${tag}/${identity.name}`;
 const zip=path.join(work,'brave.zip'),sums=path.join(work,'archive.sha256'),dll=path.join(work,'chrome.dll'),pdb=path.join(work,'chrome.dll.pdb');
 await download(base+'.sha256',sums,4096);const checksum=await fs.readFile(sums,'utf8');
 const match=/^([a-f0-9]{64})\s+\*?([^\r\n]+)\s*$/i.exec(checksum);
 check(match&&match[2].trim()===identity.name,'Bad checksum record');
 check((await fs.stat(sums)).size===identity.assets.checksum.size&&(!identity.assets.checksum.digest||identity.assets.checksum.digest==='sha256:'+sha(Buffer.from(checksum))),'Checksum asset mismatch');
 await download(base,zip,1024**3);const archiveSha256=await shaFile(zip);
 check((await fs.stat(zip)).size===identity.assets.archive.size&&archiveSha256===match[1].toLowerCase()&&
  (!identity.assets.archive.digest||identity.assets.archive.digest==='sha256:'+archiveSha256),'Archive verification failed');
 const extract=spawnSync(process.env.PYTHON||'python3',['-I','-c',
  'import zipfile,sys,shutil\nwith zipfile.ZipFile(sys.argv[1]) as z:\n'+
  ' files=[i for i in z.infolist() if i.filename.replace("\\\\","/").split("/")[-1]=="chrome.dll"]\n'+
  ' if len(files)!=1 or files[0].file_size>1024**3: raise ValueError("Invalid DLL")\n'+
  ' with z.open(files[0]) as src, open(sys.argv[2],"xb") as dst: shutil.copyfileobj(src,dst)\n',zip,dll],{encoding:'utf8',windowsHide:true});
 check(extract.status===0,'Extraction failed: '+extract.stderr);await fs.unlink(zip);
 const pe=new native.PeImage(await fs.readFile(dll)),disk=await fs.statfs(work);
 check(Number(disk.bavail)*Number(disk.bsize)>=8*1024**3,'Not enough disk space');
 console.log(tag+': downloading official symbols '+pe.identity.key);
 await download(`https://brave-symbols.s3.brave.com/chrome.dll.pdb/${pe.identity.key}/chrome.dll.pdb`,pdb,12*1024**3);
 console.log(tag+': analyzing public names, aliases, thunks and unwind boundaries');
 const report={schema:1,tag,chromium:official.body.match(/Chromium\s+(\d+\.\d+\.\d+\.\d+)/)?.[1]||null,
  release:official.html_url,archiveSha256,...await analyze(dll,pdb)};
 await disassemble(report,output);
 await fs.writeFile(path.join(output,'compiler-report.json'),JSON.stringify(report,null,2)+'\n');
 const lines=[`# ${tag} compiler analysis`,``, `PDB: ${report.key}`,`Chromium: ${report.chromium}`,
  `Original strict extractor: ${report.strict.accepted?'PASS':report.strict.error}`,
  `Role-aware extractor: ${report.candidate.accepted?'PASS':report.candidate.error}`,``, '| Slot | Use | Entries | Boundary checks | Other public names |','| --- | --- | --- | --- | --- |'];
 for(const f of report.functions)lines.push(`| ${f.slot} | ${f.role} | ${f.entries.length} | ${f.entries.map(e=>e.fingerprint.accepted?'pass':e.fingerprint.error).join('; ')} | ${f.entries.map(e=>e.bodyAliases.filter(n=>n!==f.name).length).join(', ')} |`);
 await fs.writeFile(path.join(output,'summary.md'),lines.join('\n')+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
 if(report.candidate.accepted)await fs.writeFile(path.join(output,'candidate-cache.txt'),report.candidate.cache);
 console.log(JSON.stringify({tag,key:report.key,strict:report.strict,candidate:report.candidate.accepted,functions:report.functions.length}));
 // Keep huge official inputs only on this runner, not in artifacts or caches.
 await fs.unlink(pdb);await fs.unlink(dll);
 return report;
}
async function diagnose(dll,pdb,output){
 output=path.resolve(output);await fs.mkdir(output,{recursive:true});
 try{const report=await analyze(dll,pdb);await disassemble(report,output);
  await fs.writeFile(path.join(output,'compiler-report.json'),JSON.stringify(report,null,2)+'\n');
  return report;
 }catch(e){await fs.writeFile(path.join(output,'diagnostic-error.json'),JSON.stringify({error:e.message},null,2)+'\n');throw e;}
}
module.exports={collect,analyze,diagnose,entryEvidence,scanPublics,HOOK_SLOTS};
if(require.main===module){const args=process.argv.slice(2);
 const action=args[0]==='--existing'?diagnose(...args.slice(1)):collect(...args);
 action.catch(e=>{console.error(e.stack);process.exitCode=1;});}
