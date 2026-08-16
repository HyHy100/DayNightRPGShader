import { calculateAtmosphereState, type AtmosphereState } from "./atmosphereModel";
import { calculateDaylightGrade, type DaylightGrade } from "./artDirection";
import { calculateFallbackSolarPosition, calculateSolarPosition, type GeoLocation } from "./solarPosition";

export interface DaylightModel { grade:DaylightGrade; atmosphere:AtmosphereState }
export const localClockHours=(d=new Date())=>d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;
export function dateAtHour(hour:number,base=new Date()){const d=new Date(base);const total=Math.round((((hour%24)+24)%24)*60);d.setHours(Math.floor(total/60),total%60,0,0);return d;}
export function daylightAt(hour:number,base=new Date(),location:GeoLocation|null=null):DaylightModel{
  const date=dateAtHour(hour,base);
  const solar=location?calculateSolarPosition(date,location):calculateFallbackSolarPosition(date);
  const atmosphere=calculateAtmosphereState(solar);
  return {atmosphere,grade:calculateDaylightGrade(atmosphere,hour)};
}
export const formatTime=(hour:number)=>{const t=Math.round((((hour%24)+24)%24)*60)%1440;return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;};
export const formatSolarTime=(hour:number)=>formatTime(hour);
