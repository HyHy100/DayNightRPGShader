const SEGMENT_ID=[0x18,0x53,0x80,0x67];
const INFO_ID=[0x15,0x49,0xa9,0x66];
const TIMECODE_SCALE_ID=[0x2a,0xd7,0xb1];
const DURATION_ID=[0x44,0x89];

interface Vint { length:number; value:number; unknown:boolean }
interface Edit { start:number; end:number; bytes:Uint8Array }

function matches(data:Uint8Array,offset:number,id:number[]){
  if(offset<0||offset+id.length>data.length)return false;
  return id.every((byte,index)=>data[offset+index]===byte);
}

function findId(data:Uint8Array,id:number[],start=0,end=data.length){
  const limit=Math.min(end,data.length)-id.length;
  for(let offset=Math.max(0,start);offset<=limit;offset++)if(matches(data,offset,id))return offset;
  return -1;
}

function readVint(data:Uint8Array,offset:number):Vint|null{
  const first=data[offset];if(first===undefined||first===0)return null;
  let length=1,marker=0x80;
  while(length<=8&&(first&marker)===0){length++;marker>>=1;}
  if(length>8||offset+length>data.length)return null;
  let value=first&(marker-1),unknown=value===marker-1;
  for(let index=1;index<length;index++){value=value*256+data[offset+index];unknown=unknown&&data[offset+index]===0xff;}
  return {length,value,unknown};
}

function maxVintValue(length:number){return 2**(7*length)-2;}

function encodeVint(value:number,preferredLength=0){
  if(!Number.isSafeInteger(value)||value<0)throw new Error("WebM element size is outside the supported range.");
  let length=preferredLength;
  if(!length||value>maxVintValue(length)){length=1;while(length<8&&value>maxVintValue(length))length++;}
  if(value>maxVintValue(length))throw new Error("WebM element is too large to encode.");
  const bytes=new Uint8Array(length);let remaining=value;
  for(let index=length-1;index>=0;index--){bytes[index]=remaining%256;remaining=Math.floor(remaining/256);}
  bytes[0]|=1<<(8-length);return bytes;
}

function readUnsigned(data:Uint8Array,start:number,length:number){
  let value=0;for(let index=0;index<length;index++)value=value*256+data[start+index];return value;
}

function floatBytes(value:number,length:4|8){
  const buffer=new ArrayBuffer(length),view=new DataView(buffer);
  if(length===4)view.setFloat32(0,value,false);else view.setFloat64(0,value,false);
  return new Uint8Array(buffer);
}

function applyEdits(data:Uint8Array,edits:Edit[]){
  const ordered=[...edits].sort((a,b)=>a.start-b.start),newLength=data.length+ordered.reduce((sum,edit)=>sum+edit.bytes.length-(edit.end-edit.start),0);
  const output=new Uint8Array(newLength);let source=0,target=0;
  for(const edit of ordered){
    if(edit.start<source)throw new Error("Overlapping WebM metadata edits.");
    output.set(data.subarray(source,edit.start),target);target+=edit.start-source;
    output.set(edit.bytes,target);target+=edit.bytes.length;source=edit.end;
  }
  output.set(data.subarray(source),target);return output;
}

/**
 * MediaRecorder commonly omits Matroska's Info/Duration value. Some Linux
 * players then guess from an early cluster, display that short estimate, and
 * continue playing beyond it. Write the known export duration in timecode
 * units while preserving every encoded video cluster byte-for-byte.
 */
export async function fixWebmDuration(blob:Blob,durationMs:number){
  if(!Number.isFinite(durationMs)||durationMs<=0)return blob;
  const data=new Uint8Array(await blob.arrayBuffer()),segmentOffset=findId(data,SEGMENT_ID);
  if(segmentOffset<0)return blob;
  const segmentSizeOffset=segmentOffset+SEGMENT_ID.length,segmentSize=readVint(data,segmentSizeOffset);
  if(!segmentSize)return blob;
  const segmentDataStart=segmentSizeOffset+segmentSize.length;
  const segmentEnd=segmentSize.unknown?data.length:Math.min(data.length,segmentDataStart+segmentSize.value);
  const infoOffset=findId(data,INFO_ID,segmentDataStart,Math.min(segmentEnd,segmentDataStart+1_048_576));
  if(infoOffset<0)return blob;
  const infoSizeOffset=infoOffset+INFO_ID.length,infoSize=readVint(data,infoSizeOffset);
  if(!infoSize||infoSize.unknown)return blob;
  const infoStart=infoSizeOffset+infoSize.length,infoEnd=infoStart+infoSize.value;
  if(infoEnd>data.length)return blob;

  let timecodeScale=1_000_000;
  const scaleOffset=findId(data,TIMECODE_SCALE_ID,infoStart,infoEnd);
  if(scaleOffset>=0){
    const size=readVint(data,scaleOffset+TIMECODE_SCALE_ID.length);
    if(size&&!size.unknown&&size.value>0&&size.value<=8){
      const payload=scaleOffset+TIMECODE_SCALE_ID.length+size.length;
      if(payload+size.value<=infoEnd)timecodeScale=readUnsigned(data,payload,size.value)||timecodeScale;
    }
  }
  const durationUnits=durationMs*1_000_000/timecodeScale,durationOffset=findId(data,DURATION_ID,infoStart,infoEnd);
  if(durationOffset>=0){
    const size=readVint(data,durationOffset+DURATION_ID.length);
    if(size&&!size.unknown&&(size.value===4||size.value===8)){
      const payload=durationOffset+DURATION_ID.length+size.length;
      if(payload+size.value<=infoEnd){
        const output=data.slice();output.set(floatBytes(durationUnits,size.value as 4|8),payload);
        return new Blob([output],{type:blob.type||"video/webm"});
      }
    }
  }

  const durationElement=new Uint8Array([...DURATION_ID,0x88,...floatBytes(durationUnits,8)]);
  const newInfoSize=encodeVint(infoSize.value+durationElement.length,infoSize.length);
  const infoDelta=durationElement.length+newInfoSize.length-infoSize.length;
  const edits:Edit[]=[
    {start:infoSizeOffset,end:infoStart,bytes:newInfoSize},
    {start:infoEnd,end:infoEnd,bytes:durationElement},
  ];
  if(!segmentSize.unknown){
    const newSegmentSize=encodeVint(segmentSize.value+infoDelta,segmentSize.length);
    edits.push({start:segmentSizeOffset,end:segmentDataStart,bytes:newSegmentSize});
  }
  return new Blob([applyEdits(data,edits)],{type:blob.type||"video/webm"});
}
