// MIT. Format 5: named direct thunks in any slot; optional website-code group.
'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {PeImage,Pdb,MAGIC,guidKey}=require('./symbol-map.cjs');
const v4=require('./symbol-map-v4.cjs');
const FORMAT=5,EXTRACTOR=1,ABI_REVISION=1,CLIENT_VERSION='3.2';
const HEADER_SIZE=40,ENTRY_SIZE=80,MAP_SIZE=1320,SYMBOLS=v4.SYMBOLS;
const OPTIONAL_SCRIPT=Object.freeze([12,13,14]);
const REQUIRED_SLOTS=Object.freeze(SYMBOLS.map((_,i)=>i).filter(i=>!OPTIONAL_SCRIPT.includes(i)));
function check(ok,message){if(!ok)throw Error(message);}
function outsideUnwind(pe,rva,length){
 check(!pe.functionRanges.some(f=>f.begin<rva+length&&(f.begin>=rva||f.end>rva)),'Leaf/thunk overlaps unwind range');
}
function hostLeaf(code){return code.subarray(0,3).equals(Buffer.from('4883b9','hex'))&&code.subarray(7,13).equals(Buffer.from('00740331c0c3','hex'));}
function focusLeaf(code){
 const layout=Buffer.from('4883b900000000007413488b8100000000488b4028837818000f95c0c331c0c3','hex');
 return layout.every((b,j)=>(j>=3&&j<7)||(j>=13&&j<17)||code[j]===b);
}
function fingerprint(pe,rva,slot){
 // Only a direct E9 jump preserves the exact entry ABI without an adjustment.
 // Do not follow this-adjustors, indirect jumps, chains, or arbitrary wrappers.
 if(!pe.functions.has(rva)){
  const jump=pe.read(rva,5);
  if(jump[0]===0xe9){
   outsideUnwind(pe,rva,5);
   const target=rva+5+jump.readInt32LE(1),body=v4.fingerprint(pe,target,slot);
   check(body.kind!==3,'Chained named thunks are unsupported');
   return {...body,rva,kind:3,reserved:target,aliasRvas:[target]};
  }
 }
 return v4.fingerprint(pe,rva,slot);
}
function validateMap(map,pe){
 check(map.length===MAP_SIZE&&map.readUInt32LE()===MAGIC&&map.readUInt32LE(4)===FORMAT,'Invalid compatibility file format');
 const guid=map.subarray(8,24),age=map.readUInt32LE(24),machine=map.readUInt32LE(28);
 const timestamp=map.readUInt32LE(32),imageSize=map.readUInt32LE(36);
 check(guid.some(b=>b)&&age&&machine===0x8664&&imageSize,'Invalid compatibility identity');
 if(pe)check(guid.equals(pe.identity.guid)&&age===pe.identity.age&&machine===pe.machine&&timestamp===pe.timestamp&&imageSize===pe.imageSize,'Compatibility file belongs to a different build');
 const entries=[],ranges=[];
 for(let i=0;i<SYMBOLS.length;++i){
  const p=HEADER_SIZE+i*ENTRY_SIZE,rva=map.readUInt32LE(p),length=map.readUInt32LE(p+4),kind=map.readUInt32LE(p+8),reserved=map.readUInt32LE(p+12);
  const code=map.subarray(p+16,p+48),mask=map.subarray(p+48,p+80),target=kind===3?reserved:rva;
  if(!rva){
   check(OPTIONAL_SCRIPT.includes(i)&&map.subarray(p,p+ENTRY_SIZE).every(b=>b===0),'Missing required function or nonzero absent entry');
   entries.push({rva:0,length:0,kind:0,reserved:0,targetRva:0});continue;
  }
  check(target&&rva<imageSize&&target<imageSize&&length<=imageSize-target,'Invalid fingerprint range');
  const shortHost=i===3&&length===13&&(kind===1||kind===3),shortFocus=i===6&&length===32&&(kind===2||(kind===3&&focusLeaf(code)));
  check((kind===0&&length>=16&&length<=32&&!reserved)||(kind===1&&shortHost&&!reserved)||
   (kind===2&&shortFocus&&!reserved)||(kind===3&&((length>=16&&length<=32)||shortHost)),'Invalid kind/slot contract');
  check(mask.every((b,j)=>(b===0||b===255)&&(j<length||!b))&&code.subarray(length).every(b=>b===0)&&
   mask.filter(b=>b===255).length>=(shortHost?13:shortFocus?32:16),'Invalid fingerprint mask');
  if(shortHost)check(hostLeaf(code),'Invalid short leaf layout');
  if(kind===2)check(focusLeaf(code),'Invalid focus leaf layout');
  for(const [start,size]of kind===3?[[rva,5],[target,length]]:[[target,length]]){
   check(start+size<=imageSize&&!ranges.some(([s,n])=>start<s+n&&s<start+size),'Overlapping function ranges');ranges.push([start,size]);
  }
  if(pe){
   check(rva>=pe.text.rva&&rva+(kind===3?5:length)<=pe.text.rva+pe.text.size&&target>=pe.text.rva&&target+length<=pe.text.rva+pe.text.size,'Not executable code');
   if(kind===0||(kind===3&&!shortHost&&!shortFocus))check(pe.functions.get(target)>=target+length,'Not an exact unwind function entry');
   else if(kind===3&&shortFocus&&pe.functions.get(target)>=target+length){} // Same fully fixed code may have unwind metadata.
   else outsideUnwind(pe,target,length);
   if(kind===3){const jump=pe.read(rva,5);outsideUnwind(pe,rva,5);check(jump[0]===0xe9&&rva+5+jump.readInt32LE(1)===target,'Invalid named function thunk');}
   const bytes=pe.read(target,length);check(mask.subarray(0,length).every((m,j)=>!m||code[j]===bytes[j]),'Fingerprint mismatch');
  }
  entries.push({rva,length,kind,reserved,targetRva:target});
 }
 const scriptCount=OPTIONAL_SCRIPT.filter(i=>entries[i].rva).length;
 check(scriptCount===0||scriptCount===OPTIONAL_SCRIPT.length,'Incomplete optional website-code group');
 return {key:guidKey(guid,age),machine,timestamp,imageSize,entries,addresses:entries.map(e=>e.targetRva),websiteCode:scriptCount===3};
}
function encodeMap(pe,entries){
 check(entries.length===SYMBOLS.length,'Wrong function count');const map=Buffer.alloc(MAP_SIZE);
 map.writeUInt32LE(MAGIC);map.writeUInt32LE(FORMAT,4);pe.identity.guid.copy(map,8);
 map.writeUInt32LE(pe.identity.age,24);map.writeUInt32LE(pe.machine,28);map.writeUInt32LE(pe.timestamp,32);map.writeUInt32LE(pe.imageSize,36);
 entries.forEach((e,i)=>{
  if(!e){check(OPTIONAL_SCRIPT.includes(i),'Missing required function');return;}
  check(e.code.length===32&&e.mask.length===32,'Invalid fingerprint buffers');
  const p=HEADER_SIZE+i*ENTRY_SIZE;map.writeUInt32LE(e.rva,p);map.writeUInt32LE(e.length,p+4);map.writeUInt32LE(e.kind,p+8);map.writeUInt32LE(e.reserved||0,p+12);e.code.copy(map,p+16);e.mask.copy(map,p+48);
 });
 validateMap(map,pe);return map;
}
async function resolveGroups(pe,pdb){
 // Independent strict scans let a missing/inlined/aliased scripting function
 // disable that entire optional path without admitting any guessed address.
 const entries=Array(SYMBOLS.length).fill(null);
 const core=await pdb.symbols(pe,{names:REQUIRED_SLOTS.map(i=>SYMBOLS[i]),rejectAliases:true,fingerprint:(rva,i)=>fingerprint(pe,rva,REQUIRED_SLOTS[i])});
 REQUIRED_SLOTS.forEach((slot,i)=>{entries[slot]=core.entries[i];});
 let websiteCodeError=null;
 try{
  const script=await pdb.symbols(pe,{names:OPTIONAL_SCRIPT.map(i=>SYMBOLS[i]),rejectAliases:true,fingerprint:(rva,i)=>fingerprint(pe,rva,OPTIONAL_SCRIPT[i])});
  OPTIONAL_SCRIPT.forEach((slot,i)=>{entries[slot]=script.entries[i];});
 }catch(error){websiteCodeError=String(error.message).slice(0,2048);}
 return {...core,entries,websiteCodeError};
}
async function generate(dll,pdbPath,output){
 const pe=new PeImage(await fs.readFile(dll)),pdb=await Pdb.open(pdbPath);
 try{
  const result=await resolveGroups(pe,pdb),map=encodeMap(pe,result.entries);
  await fs.writeFile(output,map);
  return {format:FORMAT,extractor:EXTRACTOR,abiRevision:ABI_REVISION,clientVersion:CLIENT_VERSION,key:pe.identity.key,machine:pe.machine,
   timestamp:pe.timestamp,imageSize:pe.imageSize,records:result.records,infoAge:result.infoAge,dbiAge:result.dbiAge,
   websiteCodeError:result.websiteCodeError,sha256:crypto.createHash('sha256').update(map).digest('hex'),
   functions:result.entries.map((e,i)=>({name:SYMBOLS[i],rva:e?.rva||0,length:e?.length||0,kind:e?.kind||0,reserved:e?.reserved||0}))};
 }finally{await pdb.close();}
}
module.exports={FORMAT,EXTRACTOR,ABI_REVISION,CLIENT_VERSION,HEADER_SIZE,ENTRY_SIZE,MAP_SIZE,SYMBOLS,OPTIONAL_SCRIPT,REQUIRED_SLOTS,MAGIC,PeImage,Pdb,fingerprint,encodeMap,validateMap,resolveGroups,generate};
if(require.main===module){const[dll,pdb,out]=process.argv.slice(2);generate(dll,pdb,out).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
