export interface ZipEntry { name:string; data:Blob|Uint8Array|string; date?:Date }

const encoder=new TextEncoder();
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
export const crc32=(bytes:Uint8Array)=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return (crc^0xffffffff)>>>0;};

const copyBytes=(source:Uint8Array)=>{const copy=new Uint8Array(source.byteLength);copy.set(source);return copy;};
const bytesOf=async(data:ZipEntry["data"]):Promise<Uint8Array<ArrayBuffer>>=>typeof data==="string"?encoder.encode(data):data instanceof Uint8Array?copyBytes(data):new Uint8Array(await data.arrayBuffer());
const dosDateTime=(date:Date)=>{const year=Math.max(1980,date.getFullYear());return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};};
const view=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,data:new DataView(bytes.buffer)};};

/** Store-only ZIP writer. PNG is already compressed, so deflate would waste CPU. */
export async function createZip(entries:ZipEntry[]){
  const localParts:BlobPart[]=[],centralParts:BlobPart[]=[];let localOffset=0,centralSize=0;
  for(const entry of entries){
    const name=encoder.encode(entry.name),payload=await bytesOf(entry.data),crc=crc32(payload),stamp=dosDateTime(entry.date??new Date());
    const local=view(30);local.data.setUint32(0,0x04034b50,true);local.data.setUint16(4,20,true);local.data.setUint16(8,0,true);local.data.setUint16(10,stamp.time,true);local.data.setUint16(12,stamp.date,true);local.data.setUint32(14,crc,true);local.data.setUint32(18,payload.byteLength,true);local.data.setUint32(22,payload.byteLength,true);local.data.setUint16(26,name.byteLength,true);
    localParts.push(local.bytes,name,payload);
    const central=view(46);central.data.setUint32(0,0x02014b50,true);central.data.setUint16(4,20,true);central.data.setUint16(6,20,true);central.data.setUint16(10,0,true);central.data.setUint16(12,stamp.time,true);central.data.setUint16(14,stamp.date,true);central.data.setUint32(16,crc,true);central.data.setUint32(20,payload.byteLength,true);central.data.setUint32(24,payload.byteLength,true);central.data.setUint16(28,name.byteLength,true);central.data.setUint32(42,localOffset,true);
    centralParts.push(central.bytes,name);centralSize+=46+name.byteLength;localOffset+=30+name.byteLength+payload.byteLength;
  }
  const end=view(22);end.data.setUint32(0,0x06054b50,true);end.data.setUint16(8,entries.length,true);end.data.setUint16(10,entries.length,true);end.data.setUint32(12,centralSize,true);end.data.setUint32(16,localOffset,true);
  return new Blob([...localParts,...centralParts,end.bytes],{type:"application/zip"});
}
