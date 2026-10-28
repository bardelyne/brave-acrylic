'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {analyze,entryEvidence,HOOK_SLOTS}=require('../tools/research-compiler.cjs');
const {fixturePeV6,fixturePdbV6,RVAS}=require('./fixtures-v6.cjs');
const {PeImage,SYMBOLS}=require('../tools/symbol-map-v6.cjs');
test('research reports compiler aliases without silently approving them',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brave-compiler-fixture-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const pe=new PeImage(fixturePeV6()),dll=path.join(dir,'chrome.dll'),pdb=path.join(dir,'chrome.dll.pdb');
 await fs.writeFile(dll,pe.bytes);await fs.writeFile(pdb,fixturePdbV6(pe));
 let r=await analyze(dll,pdb);assert.equal(r.strict.accepted,true);assert.equal(r.functions.length,13);
 await fs.writeFile(pdb,fixturePdbV6(pe,[{name:'?HasFocus@AppMenuButton@@UEBA_NXZ',within:RVAS[6]-0x1000}]));
 r=await analyze(dll,pdb);assert.equal(r.strict.accepted,false);assert.match(r.strict.error,/alias/);
 assert.equal(r.candidate.accepted,true);
 assert.equal(r.functions[6].entries[0].bodyAliases.includes('?HasFocus@AppMenuButton@@UEBA_NXZ'),true);
 assert.equal(r.functions[6].role,'call-only');assert.equal(r.functions[0].role,'hook');
 assert.deepEqual([...HOOK_SLOTS],[0,3,4,8,9,10,12]);
});
test('research separates missing names, shared code, direct thunks and unsupported entries',()=>{
 const pe=new PeImage(fixturePeV6());
 let e=entryEvidence(pe,RVAS[8],8);assert.equal(e.chain.length,1);assert.equal(e.body.rva,0x1300);
 assert.equal(e.fingerprint.accepted,true);
 e=entryEvidence(pe,RVAS[0]+1,0);assert.equal(e.fingerprint.accepted,false);
 assert.equal(SYMBOLS.length,13);
});
