export interface WebMVideoChunk {
  timestamp:number;
  duration:number;
  type:"key"|"delta";
  data:Uint8Array;
}

export interface WebMMuxOptions {
  width:number;
  height:number;
  frameRate:number;
  durationUs:number;
  codec:"vp8"|"vp9";
  chunks:WebMVideoChunk[];
}

const concat=(parts:Uint8Array[])=>{
  const length=parts.reduce((sum,part)=>sum+part.length,0),output=new Uint8Array(length);let offset=0;
  for(const part of parts){output.set(part,offset);offset+=part.length;}return output;
};

const bytes=(...values:number[])=>new Uint8Array(values);

function vint(value:number){
  if(!Number.isSafeInteger(value)||value<0)throw new Error("WebM element size is outside the supported range.");
  let length=1;while(length<8&&value>2**(7*length)-2)length++;
  if(value>2**(7*length)-2)throw new Error("WebM element is too large.");
  const output=new Uint8Array(length);let remaining=value;
  for(let index=length-1;index>=0;index--){output[index]=remaining%256;remaining=Math.floor(remaining/256);}
  output[0]|=1<<(8-length);return output;
}

function unsigned(value:number,minimumBytes=1){
  if(!Number.isSafeInteger(value)||value<0)throw new Error("Invalid unsigned WebM value.");
  let length=minimumBytes;while(value>=2**(8*length))length++;
  const output=new Uint8Array(length);let remaining=value;
  for(let index=length-1;index>=0;index--){output[index]=remaining%256;remaining=Math.floor(remaining/256);}
  return output;
}

function float64(value:number){const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,value,false);return new Uint8Array(buffer);}
const textBytes=(value:string)=>new TextEncoder().encode(value);
const element=(id:Uint8Array,payload:Uint8Array)=>concat([id,vint(payload.length),payload]);
const master=(id:Uint8Array,children:Uint8Array[])=>element(id,concat(children));
const uintElement=(id:Uint8Array,value:number,minimumBytes=1)=>element(id,unsigned(value,minimumBytes));
const textElement=(id:Uint8Array,value:string)=>element(id,textBytes(value));

const ID={
  ebml:bytes(0x1a,0x45,0xdf,0xa3),version:bytes(0x42,0x86),readVersion:bytes(0x42,0xf7),maxId:bytes(0x42,0xf2),maxSize:bytes(0x42,0xf3),docType:bytes(0x42,0x82),docVersion:bytes(0x42,0x87),docReadVersion:bytes(0x42,0x85),
  segment:bytes(0x18,0x53,0x80,0x67),info:bytes(0x15,0x49,0xa9,0x66),timecodeScale:bytes(0x2a,0xd7,0xb1),duration:bytes(0x44,0x89),muxingApp:bytes(0x4d,0x80),writingApp:bytes(0x57,0x41),
  tracks:bytes(0x16,0x54,0xae,0x6b),trackEntry:bytes(0xae),trackNumber:bytes(0xd7),trackUid:bytes(0x73,0xc5),trackType:bytes(0x83),flagLacing:bytes(0x9c),codecId:bytes(0x86),defaultDuration:bytes(0x23,0xe3,0x83),video:bytes(0xe0),pixelWidth:bytes(0xb0),pixelHeight:bytes(0xba),displayWidth:bytes(0x54,0xb0),displayHeight:bytes(0x54,0xba),
  cluster:bytes(0x1f,0x43,0xb6,0x75),clusterTimecode:bytes(0xe7),simpleBlock:bytes(0xa3),
};

function idLength(first:number){let length=1,mask=0x80;while(length<=4&&(first&mask)===0){length++;mask>>=1;}return length<=4?length:0;}
function readVint(data:Uint8Array,offset:number){
  const first=data[offset];if(first===undefined||first===0)return null;
  let length=1,marker=0x80;while(length<=8&&(first&marker)===0){length++;marker>>=1;}
  if(length>8||offset+length>data.length)return null;
  let value=first&(marker-1),unknown=value===marker-1;
  for(let index=1;index<length;index++){value=value*256+data[offset+index];unknown=unknown&&data[offset+index]===0xff;}
  return {length,value,unknown};
}
function matchesId(data:Uint8Array,offset:number,id:Uint8Array){return id.every((byte,index)=>data[offset+index]===byte);}

interface ParsedElement { idOffset:number; idLength:number; payloadOffset:number; end:number; unknown:boolean }
function readElement(data:Uint8Array,offset:number,parentEnd:number):ParsedElement|null{
  const length=idLength(data[offset]);if(!length||offset+length>=parentEnd)return null;
  const size=readVint(data,offset+length);if(!size)return null;
  const payloadOffset=offset+length+size.length,end=size.unknown?parentEnd:payloadOffset+size.value;
  if(end>parentEnd||end<payloadOffset)return null;
  return {idOffset:offset,idLength:length,payloadOffset,end,unknown:size.unknown};
}

function readBlock(data:Uint8Array,element:ParsedElement){
  const track=readVint(data,element.payloadOffset);if(!track)return null;
  const header=element.payloadOffset+track.length;if(header+3>element.end)return null;
  const flags=data[header+2],payload=header+3;if(payload>=element.end)return null;
  return {type:(flags&0x80)!==0?"key" as const:"delta" as const,data:data.slice(payload,element.end)};
}

/** Extract encoded VP8/VP9 frames while deliberately discarding recorder timestamps. */
export async function extractWebMVideoFrames(blob:Blob){
  const data=new Uint8Array(await blob.arrayBuffer()),frames:Array<{type:"key"|"delta";data:Uint8Array}>=[];
  let segment:ParsedElement|null=null,offset=0;
  while(offset<data.length){const element=readElement(data,offset,data.length);if(!element)break;if(matchesId(data,element.idOffset,ID.segment)){segment=element;break;}offset=element.end;}
  if(!segment)throw new Error("The browser encoder returned an invalid WebM segment.");
  offset=segment.payloadOffset;
  while(offset<segment.end){
    const element=readElement(data,offset,segment.end);if(!element)break;
    if(matchesId(data,element.idOffset,ID.cluster)){
      let childOffset=element.payloadOffset;
      while(childOffset<element.end){
        const child=readElement(data,childOffset,element.end);if(!child)break;
        if(matchesId(data,child.idOffset,ID.simpleBlock)){const frame=readBlock(data,child);if(frame)frames.push(frame);}
        childOffset=child.end;if(child.unknown)break;
      }
    }
    offset=element.end;if(element.unknown)break;
  }
  if(!frames.length)throw new Error("The browser WebM encoder returned no video frames.");
  return frames;
}

function simpleBlock(chunk:WebMVideoChunk,clusterTimecode:number){
  const timecode=Math.round(chunk.timestamp/1000)-clusterTimecode;
  if(timecode<-32768||timecode>32767)throw new Error("WebM cluster timecode exceeded its signed 16-bit range.");
  const header=new Uint8Array(4);header[0]=0x81;new DataView(header.buffer).setInt16(1,timecode,false);header[3]=chunk.type==="key"?0x80:0;
  return element(ID.simpleBlock,concat([header,chunk.data]));
}

function clusters(chunks:WebMVideoChunk[]){
  const output:Uint8Array[]=[];let clusterStart=-1,blocks:Uint8Array[]=[];
  const finish=()=>{if(clusterStart>=0)output.push(master(ID.cluster,[uintElement(ID.clusterTimecode,clusterStart),...blocks]));};
  for(const chunk of chunks){
    const milliseconds=Math.round(chunk.timestamp/1000),nextStart=Math.floor(milliseconds/1000)*1000;
    if(clusterStart<0||milliseconds-clusterStart>=1000){finish();clusterStart=nextStart;blocks=[];}
    blocks.push(simpleBlock(chunk,clusterStart));
  }
  finish();return output;
}

/** Build a seek-independent, finite WebM timeline from explicitly timestamped VP8/VP9 chunks. */
export function muxWebM(options:WebMMuxOptions){
  const ebml=master(ID.ebml,[
    uintElement(ID.version,1),uintElement(ID.readVersion,1),uintElement(ID.maxId,4),uintElement(ID.maxSize,8),
    textElement(ID.docType,"webm"),uintElement(ID.docVersion,4),uintElement(ID.docReadVersion,2),
  ]);
  const info=master(ID.info,[
    uintElement(ID.timecodeScale,1_000_000,3),element(ID.duration,float64(options.durationUs/1000)),
    textElement(ID.muxingApp,"Daylight Color Studio"),textElement(ID.writingApp,"Daylight Color Studio WebCodecs"),
  ]);
  const video=master(ID.video,[
    uintElement(ID.pixelWidth,options.width),uintElement(ID.pixelHeight,options.height),
    uintElement(ID.displayWidth,options.width),uintElement(ID.displayHeight,options.height),
  ]);
  const track=master(ID.trackEntry,[
    uintElement(ID.trackNumber,1),uintElement(ID.trackUid,1),uintElement(ID.trackType,1),uintElement(ID.flagLacing,0),
    textElement(ID.codecId,options.codec==="vp9"?"V_VP9":"V_VP8"),
    uintElement(ID.defaultDuration,Math.round(1_000_000_000/options.frameRate)),video,
  ]);
  const segment=master(ID.segment,[info,master(ID.tracks,[track]),...clusters(options.chunks)]);
  return new Blob([ebml,segment],{type:`video/webm;codecs=${options.codec}`});
}
