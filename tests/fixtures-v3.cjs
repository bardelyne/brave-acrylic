'use strict';
const {fixturePe,fixturePdb}=require('./fixtures.cjs');
const {PeImage,SYMBOLS,fingerprint,encodeMap}=require('../tools/symbol-map-v3.cjs');
const RVAS=Object.freeze([0x1000,0x1060,0x10c0,0x1140,0x11a0,0x1200,0x1260,0x12a0,0x12f0,0x1360,0x13c0,0x1420,0x1480,0x14e0,0x1540]);
const FOCUS=Buffer.from('4883b9f0030000007413488b81e8030000488b4028837818000f95c0c331c0c3','hex');
function fixturePeV3(){
 const old=fixturePe(),b=Buffer.alloc(0x1200);old.copy(b,0,0,0x400);old.copy(b,0xe00,0xa00,0xe00);
 const opt=0x98,section=opt+240;
 b.writeUInt32LE(0x800,section+8);b.writeUInt32LE(0x800,section+16);
 b.writeUInt32LE(0xc00,section+40+20);b.writeUInt32LE(0xe00,section+80+20);
 b.fill(0xcc,0x400,0xc00);
 const ranges=[];
 RVAS.forEach((rva,i)=>{
  const raw=0x400+rva-0x1000;
  if(i===3){Buffer.from('4883b92000000000740331c0c3','hex').copy(b,raw);return;}
  if(i===6){FOCUS.copy(b,raw);return;}
  if(i===8){b[raw]=0xE9;b.writeInt32LE(0x1300-rva-5,raw+1);rva=0x1300;}
  for(let j=0;j<64;++j)b[0x400+rva-0x1000+j]=(i*39+j+1)&255;
  ranges.push([rva,rva+64]);
 });
 ranges.sort((a,b)=>a[0]-b[0]);
 b.writeUInt32LE(ranges.length*12,opt+116+3*8);b.writeUInt32LE(ranges.length*12,section+40+8);
 ranges.forEach(([start,end],i)=>{b.writeUInt32LE(start,0xc00+i*12);b.writeUInt32LE(end,0xc04+i*12);b.writeUInt32LE(0x3180,0xc08+i*12);});
 return b;
}
function fixturePdbV3(pe,extra=[]){return fixturePdb(pe,[...SYMBOLS.map((name,i)=>({name,within:RVAS[i]-0x1000})),...extra]);}
function fixtureMapV3(){const pe=new PeImage(fixturePeV3());return {pe,map:encodeMap(pe,RVAS.map((rva,i)=>fingerprint(pe,rva,i)))};}
module.exports={RVAS,FOCUS,fixturePeV3,fixturePdbV3,fixtureMapV3};
