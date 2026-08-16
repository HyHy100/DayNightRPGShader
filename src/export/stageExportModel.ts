import { daylightAt,formatTime,type DaylightModel } from "../daylight/daylightModel";
import type { AtmosphereProfile } from "../daylight/clearSkyModel";
import type { StoryMoonConfig } from "../daylight/moonlightModel";
import type { GeoLocation } from "../daylight/solarPosition";

export interface DaylightStageSample { index:number; hour:number; time:string; name:string; description:string; model:DaylightModel }

export function collectDaylightStageSamples(date:Date,location:GeoLocation|null,profile:AtmosphereProfile,storyMoon:StoryMoonConfig){
  const sampled=Array.from({length:1440},(_,minute)=>{const model=daylightAt(minute/60,date,location,profile,storyMoon);return {minute,model,signature:`${model.grade.name}\u0000${model.grade.description}`};});
  const runs:{start:number;end:number;signature:string}[]=[];
  for(const sample of sampled){const last=runs.at(-1);if(!last||last.signature!==sample.signature)runs.push({start:sample.minute,end:sample.minute,signature:sample.signature});else last.end=sample.minute;}
  if(runs.length>1&&runs[0].signature===runs.at(-1)!.signature){const last=runs.pop()!;runs[0]={start:last.start,end:runs[0].end+1440,signature:last.signature};}
  return runs.map((run,index)=>{
    const minute=((Math.round((run.start+run.end)/2)%1440)+1440)%1440,hour=minute/60,model=daylightAt(hour,date,location,profile,storyMoon);
    return {index:index+1,hour,time:formatTime(hour),name:model.grade.name,description:model.grade.description,model} satisfies DaylightStageSample;
  });
}

export const slugify=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
