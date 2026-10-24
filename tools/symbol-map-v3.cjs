// MIT. Format 3: native surfaces plus optional user-authored website code.
'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {PeImage,Pdb,MAGIC,guidKey}=require('./symbol-map.cjs');
const v2=require('./symbol-map-v2.cjs');
const FORMAT=3,EXTRACTOR=1,ABI_REVISION=1,CLIENT_VERSION='3.1';
const HEADER_SIZE=40,ENTRY_SIZE=80,MAP_SIZE=1240;
const SYMBOLS=Object.freeze([...v2.SYMBOLS,
 '?HasFocus@LocationBarView@@UEBA_NXZ',
 '?HasFocus@View@views@@UEBA_NXZ',
 '?OnThemeChanged@ContentsWebView@@UEAAXXZ',
 '?RenderViewReady@ContentsWebView@@UEAAXXZ',
 '?SetColor@LayerAnimator@ui@@UEAAXU?$SkRGBA4f@$02@@@Z',
 '?SetBackgroundColor@RenderWidgetHostViewBase@content@@UEAAXI@Z',
 '?OnDidFinishLoad@WebContentsImpl@content@@UEAAXPEAVRenderFrameHostImpl@2@AEBVGURL@@@Z',
 '?ExecuteJavaScriptInIsolatedWorld@RenderFrameHostImpl@content@@UEAAXAEBV?$basic_string@_SU?$char_traits@_S@__Cr@std@@V?$allocator@_S@23@@__Cr@std@@V?$OnceCallback@$$A6AXVValue@base@@@Z@base@@H@Z',
 '?SchemeIs@GURL@@QEBA_NV?$basic_string_view@DU?$char_traits@D@__Cr@std@@@__Cr@std@@@Z',
]);
function check(ok,msg){if(!ok)throw Error(msg);}
function focusLeaf(code){
 const layout=Buffer.from('4883b900000000007413488b8100000000488b4028837818000f95c0c331c0c3','hex');
 return code.length>=32&&layout.every((b,i)=>(i>=3&&i<7)||(i>=13&&i<17)||code[i]===b);
}
function outsideUnwind(pe,rva,length){
 check(!pe.functionRanges.some(f=>f.begin<rva+length&&(f.begin>=rva||f.end>rva)),'Leaf/thunk overlaps unwind range');
}
function fingerprint(pe,rva,slot){
 if(slot<6)return {...v2.fingerprint(pe,rva,slot),reserved:0};
 if(pe.functions.has(rva))return {...pe.fingerprint(rva),kind:0,reserved:0};
 const bytes=pe.read(rva,32);
 if(slot===6&&focusLeaf(bytes)){
  outsideUnwind(pe,rva,32);return {rva,length:32,kind:2,reserved:0,code:Buffer.from(bytes),mask:Buffer.alloc(32,255)};
 }
 if(slot===8&&bytes[0]===0xE9){
  outsideUnwind(pe,rva,5);const target=rva+5+bytes.readInt32LE(1),fp=pe.fingerprint(target);
  return {...fp,rva,kind:3,reserved:target,aliasRvas:[target]};
 }
 throw Error('Unsupported exact function entry: '+SYMBOLS[slot]);
}
function validateMap(map,pe){
 check(map.length===MAP_SIZE&&map.readUInt32LE()===MAGIC&&map.readUInt32LE(4)===FORMAT,'Invalid compatibility file format');
 const core=Buffer.from(map.subarray(0,520));core.writeUInt32LE(2,4);
 const first=v2.validateMap(core,pe),imageSize=map.readUInt32LE(36),entries=[],ranges=[];
 for(let i=0;i<SYMBOLS.length;++i){
  const p=40+i*80,rva=map.readUInt32LE(p),length=map.readUInt32LE(p+4),kind=map.readUInt32LE(p+8),reserved=map.readUInt32LE(p+12);
  const code=map.subarray(p+16,p+48),mask=map.subarray(p+48,p+80),target=kind===3?reserved:rva;
  check(rva&&rva<imageSize&&target&&target<imageSize&&length<=imageSize-target,'Invalid fingerprint range');
  check((kind===0&&length>=16&&length<=32&&!reserved)||(kind===1&&i===3&&length===13&&!reserved)||
   (kind===2&&i===6&&length===32&&!reserved&&focusLeaf(code))||(kind===3&&i===8&&length>=16&&length<=32),'Invalid kind/slot contract');
  check(mask.every((b,j)=>(b===0||b===255)&&(j<length||!b))&&code.subarray(length).every(b=>b===0)&&
   mask.filter(b=>b===255).length>=(kind===1?13:kind===2?32:16),'Invalid fingerprint mask');
  const spans=kind===3?[[rva,5],[target,length]]:[[target,length]];
  for(const [start,size]of spans){check(start+size<=imageSize&&!ranges.some(([s,n])=>start<s+n&&s<start+size),'Overlapping function ranges');ranges.push([start,size]);}
  if(pe){
   check(rva>=pe.text.rva&&rva+(kind===3?5:length)<=pe.text.rva+pe.text.size,'Source is not executable code');
   check(target>=pe.text.rva&&target+length<=pe.text.rva+pe.text.size,'Not executable code');
   if(kind===0||kind===3)check(pe.functions.get(target)>=target+length,'Not an exact unwind function entry');
   else outsideUnwind(pe,target,length);
   if(kind===3){const jump=pe.read(rva,5);outsideUnwind(pe,rva,5);check(jump[0]===0xE9&&rva+5+jump.readInt32LE(1)===target,'Invalid named function thunk');}
   const bytes=pe.read(target,length);check(mask.subarray(0,length).every((m,j)=>!m||code[j]===bytes[j]),'Fingerprint mismatch');
  }
  entries.push({rva,length,kind,reserved,targetRva:target});
 }
 return {...first,key:guidKey(map.subarray(8,24),map.readUInt32LE(24)),addresses:entries.map(e=>e.targetRva),entries};
}
function encodeMap(pe,entries){
 check(entries.length===SYMBOLS.length,'Wrong function count');const map=Buffer.alloc(MAP_SIZE);
 map.writeUInt32LE(MAGIC);map.writeUInt32LE(FORMAT,4);pe.identity.guid.copy(map,8);
 map.writeUInt32LE(pe.identity.age,24);map.writeUInt32LE(pe.machine,28);map.writeUInt32LE(pe.timestamp,32);map.writeUInt32LE(pe.imageSize,36);
 entries.forEach((e,i)=>{const p=40+i*80;map.writeUInt32LE(e.rva,p);map.writeUInt32LE(e.length,p+4);map.writeUInt32LE(e.kind,p+8);map.writeUInt32LE(e.reserved||0,p+12);e.code.copy(map,p+16);e.mask.copy(map,p+48);});
 validateMap(map,pe);return map;
}
async function generate(dll,pdbPath,output){
 const pe=new PeImage(await fs.readFile(dll)),pdb=await Pdb.open(pdbPath);
 try{const result=await pdb.symbols(pe,{names:SYMBOLS,rejectAliases:true,fingerprint:(rva,i)=>fingerprint(pe,rva,i)}),map=encodeMap(pe,result.entries);
  await fs.writeFile(output,map);
  return {format:FORMAT,extractor:EXTRACTOR,abiRevision:ABI_REVISION,clientVersion:CLIENT_VERSION,key:pe.identity.key,machine:pe.machine,
   timestamp:pe.timestamp,imageSize:pe.imageSize,records:result.records,infoAge:result.infoAge,dbiAge:result.dbiAge,sha256:crypto.createHash('sha256').update(map).digest('hex'),
   functions:result.entries.map((e,i)=>({name:SYMBOLS[i],rva:e.rva,length:e.length,kind:e.kind,reserved:e.reserved||0}))};
 }finally{await pdb.close();}
}
module.exports={FORMAT,EXTRACTOR,ABI_REVISION,CLIENT_VERSION,HEADER_SIZE,ENTRY_SIZE,MAP_SIZE,SYMBOLS,MAGIC,PeImage,Pdb,fingerprint,encodeMap,validateMap,generate};
if(require.main===module){const[dll,pdb,out]=process.argv.slice(2);generate(dll,pdb,out).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
