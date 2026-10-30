// MIT. Non-publishing study of the exact production feature extractor.
// Official DLLs/PDBs are data only and are never loaded or executed.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const features=require('./feature-cache.cjs');
const {PeImage,Pdb}=require('./symbol-map.cjs');
const {collect,scanPublics}=require('./research-compiler.cjs');
const check=(ok,why)=>{if(!ok)throw Error(why);};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function study({tag,dll,pdb,output,report}){
 const filename=path.join(output,'feature-cache.txt');
 const record=await features.generate(dll,pdb,filename);
 const bytes=await fs.readFile(filename),parsed=features.validateMap(bytes);
 check(record.key===report.key&&record.timestamp===report.timestamp&&record.imageSize===report.imageSize,'Feature identity mismatch');
 check(digest(bytes)===record.sha256,'Feature digest mismatch');
 // Repeat the actual production extraction, including alias checks. A stable
 // input must produce the same addresses, disabled features and exact bytes.
 const secondFile=path.join(output,'repeat-cache.txt');
 const second=await features.generate(dll,pdb,secondFile);
 check(bytes.equals(await fs.readFile(secondFile))&&JSON.stringify(record)===JSON.stringify(second),'Nondeterministic extraction');
 await fs.unlink(secondFile);
 const pe=new PeImage(await fs.readFile(dll)),publics=await Pdb.open(pdb);
 let diagnostics;
 try{
  const raw=await publics.symbols(pe,{names:features.DECORATED,partial:true,
   fingerprint:rva=>({rva,unwindEnd:pe.functions.get(rva)||null,code:pe.read(rva,64).toString('hex')})});
  const targets=new Map(raw.entries.flatMap((e,i)=>e?[[e.rva,i]]:[]));
  const aliases=new Map([...targets].map(([rva])=>[rva,[]]));
  await scanPublics(publics,pe,({name,rva})=>{if(aliases.has(rva))aliases.get(rva).push(name);});
  diagnostics=features.DECORATED.map((name,slot)=>({slot,name,use:slot===24?'immutable-vtable':features.HOOK_SLOTS.includes(slot)?'hook':'call-only',
   present:!!raw.entries[slot],error:raw.errors[slot],...(raw.entries[slot]||{}),
   aliases:raw.entries[slot]?aliases.get(raw.entries[slot].rva):[]}));
 }finally{await publics.close();}
 const available=Object.entries(record.features).filter(([,f])=>f.available).map(([name])=>name);
 for(const [name,slots]of Object.entries(features.FEATURES))
  check(parsed.features[name].available===slots.every(i=>!!parsed.entries[i]),'Incomplete published dependency group');
 const sourceHashes={};
 for(const file of ['feature-cache.cjs','symbol-map.cjs','symbol-map-v6.cjs','symbol-cache.cjs'])
  sourceHashes[file]=digest(await fs.readFile(path.join(__dirname,file)));
 const result={schema:1,tag,chromium:report.chromium,officialRelease:report.release||null,
  archiveSha256:report.archiveSha256||null,dllSha256:report.dllSha256,key:record.key,
  abiRevision:record.abiRevision,clientVersion:record.clientVersion,sourceHashes,
  completed:true,deterministic:true,published:false,available,features:record.features,
  cacheSha256:record.sha256,cacheBytes:bytes.length,functions:record.functions,diagnostics};
 await fs.writeFile(path.join(output,'feature-report.json'),JSON.stringify(result,null,2)+'\n');
 await fs.writeFile(path.join(output,'feature-record.json'),JSON.stringify(record,null,2)+'\n');
 const lines=[`## ${tag}: ${available.length}/6 native feature groups`,
  `Chromium ${report.chromium||'unknown'} · client ${record.clientVersion} · ABI ${record.abiRevision}`,'',
  '| Feature | Result | Reason |','| --- | --- | --- |',
  ...Object.entries(record.features).map(([name,f])=>`| ${name} | ${f.available?'Available':'Unavailable'} | ${f.reasons.join('; ').replaceAll('|','\\|')} |`),
  '', 'Deterministic extraction verified. Data only; no browser was executed, no UI test performed, and no compatibility data published.',''];
 await fs.writeFile(path.join(output,'feature-summary.md'),lines.join('\n'));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
 console.log(JSON.stringify({tag,available,clientVersion:record.clientVersion,abiRevision:record.abiRevision,cacheBytes:bytes.length,published:false}));
 return result;
}
module.exports={study};
if(require.main===module){
 const args=process.argv.slice(2);
 const action=args[0]==='--existing'?(async()=>{
  const [dll,pdb,output,tag='local']=args.slice(1);await fs.mkdir(output,{recursive:true});
  const pe=new PeImage(await fs.readFile(dll));
  await study({tag,dll,pdb,output,report:{key:pe.identity.key,timestamp:pe.timestamp,imageSize:pe.imageSize,dllSha256:digest(pe.bytes)}});
 })():collect(args[0],args[1],{afterAnalyze:study});
 action.catch(error=>{console.error(error.stack);process.exitCode=1;});
}
