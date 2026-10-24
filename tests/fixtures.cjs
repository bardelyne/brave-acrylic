'use strict';
const {PeImage,SYMBOLS,encodeMap}=require('../tools/symbol-map.cjs');
function fixturePe() {
  const b = Buffer.alloc(0x1000), nt = 0x80, opt = nt + 24;
  b.writeUInt16LE(0x5a4d); b.writeUInt32LE(nt, 60); b.writeUInt32LE(0x4550, nt);
  b.writeUInt16LE(0x8664, nt + 4); b.writeUInt16LE(3, nt + 6);
  b.writeUInt32LE(1234567, nt + 8); b.writeUInt16LE(240, nt + 20);
  b.writeUInt16LE(0x20b, opt); b.writeUInt32LE(0x4000, opt + 56); b.writeUInt32LE(16, opt + 108);
  const sections = [
    ['.text',0x400,0x1000,0x400,0x400,0x60000020],
    ['.pdata',36,0x2000,0x200,0x800,0x40000040],
    ['.rdata',0x400,0x3000,0x400,0xa00,0x40000040],
  ];
  sections.forEach(([name,size,rva,rawSize,raw,flags], i) => {
    const p = opt + 240 + i * 40; b.write(name, p, 'ascii');
    b.writeUInt32LE(size,p+8);b.writeUInt32LE(rva,p+12);b.writeUInt32LE(rawSize,p+16);
    b.writeUInt32LE(raw,p+20);b.writeUInt32LE(flags,p+36);
  });
  [[3,0x2000,36],[5,0x3100,12],[6,0x3000,28]].forEach(([i,rva,size]) => {
    b.writeUInt32LE(rva,opt+112+i*8);b.writeUInt32LE(size,opt+116+i*8);
  });
  b.writeUInt32LE(2,0xa00+12);b.writeUInt32LE(39,0xa00+16);b.writeUInt32LE(0x3040,0xa00+20);
  b.write('RSDS',0xa40);Buffer.from('00112233445566778899aabbccddeeff','hex').copy(b,0xa44);
  b.writeUInt32LE(1,0xa54);b.write('chrome.dll.pdb\0',0xa58);
  b.writeUInt32LE(0x1000,0xb00);b.writeUInt32LE(12,0xb04);b.writeUInt16LE(0xa008,0xb08);
  for(let i=0;i<3;i++) {
    const rva=0x1000+i*0x100;b.writeUInt32LE(rva,0x800+i*12);b.writeUInt32LE(rva+64,0x804+i*12);
    for(let j=0;j<64;j++)b[0x400+i*0x100+j]=(i*70+j+1)&255;
  }
  return b;
}
function fixturePdb(pe, names = SYMBOLS) {
  const info = Buffer.alloc(28), dbi = Buffer.alloc(64);
  info.writeUInt32LE(2,8);pe.identity.guid.copy(info,12);
  dbi.writeUInt32LE(pe.identity.age,8);dbi.writeUInt16LE(4,20);dbi.writeUInt16LE(pe.machine,58);
  const records=names.map((entry,i)=>{
    const {name, within = (i%3)*0x100, segment = 1} = typeof entry === 'string' ? {name:entry} : entry;
    const length=(14+Buffer.byteLength(name)+1+3)&~3,b=Buffer.alloc(length);
    b.writeUInt16LE(length-2);b.writeUInt16LE(0x110e,2);b.writeUInt32LE(within,8);
    b.writeUInt16LE(segment,12);b.write(name,14);return b;
  });
  const streams=[null,info,null,dbi,Buffer.concat(records)], blockSize=512;
  const counts=streams.map(b=>b?Math.ceil(b.length/blockSize):0);
  const blocks=3+counts.reduce((a,b)=>a+b,0),out=Buffer.alloc(blocks*blockSize);
  out.write('Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0',0,'ascii');
  out.writeUInt32LE(blockSize,32);out.writeUInt32LE(blocks,40);
  out.writeUInt32LE(4+streams.length*4+counts.reduce((a,b)=>a+b,0)*4,44);
  out.writeUInt32LE(1,52);out.writeUInt32LE(2,blockSize);
  const directory=2*blockSize;out.writeUInt32LE(streams.length,directory);
  let p=directory+4+streams.length*4,page=3;
  streams.forEach((b,i)=>{
    out.writeUInt32LE(b?b.length:0xffffffff,directory+4+i*4);
    for(let j=0;j<counts[i];j++) {
      out.writeUInt32LE(page,p);p+=4;b.subarray(j*blockSize,(j+1)*blockSize).copy(out,page*blockSize);++page;
    }
  });
  return out;
}
function fixtureMap() {
  const pe=new PeImage(fixturePe());return {pe,map:encodeMap(pe,[0x1000,0x1100,0x1200].map(r=>pe.fingerprint(r)))};
}

module.exports={fixturePe,fixturePdb,fixtureMap};
