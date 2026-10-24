'use strict';
const {fixturePeV5,FOCUS,RVAS:oldRvas}=require('./fixtures-v5.cjs');
const {fixturePdb}=require('./fixtures.cjs');
const {PeImage,SYMBOLS,fingerprint,encodeMap}=require('../tools/symbol-map-v6.cjs');
const RVAS=Object.freeze([...oldRvas.slice(0,12),oldRvas[15]]);
const fixturePeV6=fixturePeV5;
function fixturePdbV6(pe,extra=[]){return fixturePdb(pe,[...SYMBOLS.map((name,i)=>({name,within:RVAS[i]-0x1000})),...extra]);}
function fixtureMapV6(){const pe=new PeImage(fixturePeV6());return {pe,map:encodeMap(pe,RVAS.map((rva,i)=>fingerprint(pe,rva,i)))};}
module.exports={RVAS,FOCUS,fixturePeV6,fixturePdbV6,fixtureMapV6};
