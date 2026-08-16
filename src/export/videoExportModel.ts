import { localClockHours } from "../daylight/daylightModel";
import type { AtmosphereProfile } from "../daylight/clearSkyModel";
import type { StoryMoonConfig } from "../daylight/moonlightModel";
import type { GeoLocation } from "../daylight/solarPosition";

export type VideoComposition = "graded" | "comparison";
export type VideoResolution = "720p" | "1080p";
export type VideoExportStage = "idle"|"preparing"|"recording"|"finalizing"|"complete"|"cancelled"|"error";
export interface VideoExportProgress { stage:VideoExportStage; progress:number; message:string }
export interface VideoExportOptions {
  composition:VideoComposition;resolution:VideoResolution;durationSeconds:15|30|60;frameRate:30;date:Date;
  location:GeoLocation|null;profile:AtmosphereProfile;storyMoon:StoryMoonConfig;intensity:number;opticalGlow:number;
  imageSource:string|Blob;onProgress?:(progress:VideoExportProgress)=>void;
}

export const WEBM_MIME_CANDIDATES=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"] as const;
export const getExportDimensions=(resolution:VideoResolution)=>resolution==="1080p"?{width:1920,height:1080}:{width:1280,height:720};
export const chooseWebMMimeType=(isSupported:(type:string)=>boolean)=>WEBM_MIME_CANDIDATES.find(isSupported)??null;
export const exportFilename=(date:Date,composition:VideoComposition)=>{
  const stamp=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  return `daylight-cycle-${stamp}-${composition}.webm`;
};
export const sampleDayCycleTimeline=(date:Date,progress:number)=>{
  const start=new Date(date);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
  const clamped=Math.max(0,Math.min(1,progress)),sampleDate=new Date(start.getTime()+(end.getTime()-start.getTime())*clamped);
  return {date:sampleDate,hour:localClockHours(sampleDate)};
};
