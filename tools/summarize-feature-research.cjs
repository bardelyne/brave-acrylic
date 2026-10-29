'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function find(root){const out=[];for(const item of await fs.readdir(root,{withFileTypes:true})){
 const file=path.join(root,item.name);if(item.isDirectory())out.push(...await find(file));else if(item.name==='feature-report.json')out.push(file);
}return out;}
(async()=>{
 const files=await find(process.argv[2]),rows=[];
 for(const file of files){const r=JSON.parse(await fs.readFile(file,'utf8'));if(!r.completed||!r.deterministic||r.published)throw Error('Invalid study report');rows.push(r);}
 rows.sort((a,b)=>a.tag.localeCompare(b.tag,undefined,{numeric:true}));
 const names=['verticalTabs','toolbar','webpage','menus','popups','suggestions'];
 const lines=['# Brave v3.8 feature compatibility matrix','',
  '| Brave | Chromium | Vertical tabs | Toolbar | Webpage backing | Menus | Popups | Suggestions |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(r=>`| ${r.tag} | ${r.chromium||'unknown'} | ${names.map(n=>r.features[n].available?'Pass':'Unavailable').join(' | ')} |`),
  '',`${rows.length} builds analyzed. Pass means named targets and their dependencies validated against the matching official PE/PDB; it does not claim visual behavior was tested.`,
  'Unavailable features remain native. This research workflow has read-only repository permissions and publishes no production cache.',''];
 const text=lines.join('\n');console.log(text);await fs.writeFile(path.join(process.argv[2],'matrix.md'),text);
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,text);
})();
