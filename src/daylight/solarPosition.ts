const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export interface GeoLocation { lat: number; lon: number }
export interface SolarEvents {
  solarNoon:number;
  sunrise:number|null; sunset:number|null;
  civilDawn:number|null; civilDusk:number|null;
  nauticalDawn:number|null; nauticalDusk:number|null;
  astronomicalDawn:number|null; astronomicalDusk:number|null;
  polarState:"normal"|"polar-day"|"polar-night";
}
export interface SolarPosition {
  elevation: number;
  geometricElevation:number;
  zenith:number;
  azimuth: number;
  declination: number;
  hourAngle: number;
  equationOfTime: number;
  solarTime: number;
  events: SolarEvents;
  earthSunDistanceAU:number;
  located: boolean;
}

const norm360 = (x: number) => ((x % 360) + 360) % 360;
const normMinutes = (x: number) => ((x % 1440) + 1440) % 1440;

function solarTerms(date: Date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = norm360(280.46646 + t * (36000.76983 + t * .0003032));
  const m = norm360(357.52911 + t * (35999.05029 - .0001537 * t));
  const e = .016708634 - t * (.000042037 + .0000001267 * t);
  const c = Math.sin(m*RAD)*(1.914602-t*(.004817+.000014*t)) + Math.sin(2*m*RAD)*(.019993-.000101*t) + Math.sin(3*m*RAD)*.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136*t;
  const lambda = trueLong - .00569 - .00478*Math.sin(omega*RAD);
  const eps0 = 23 + (26 + (21.448-t*(46.815+t*(.00059-t*.001813)))/60)/60;
  const eps = eps0 + .00256*Math.cos(omega*RAD);
  const declination = Math.asin(Math.sin(eps*RAD)*Math.sin(lambda*RAD))*DEG;
  const y = Math.tan(eps*RAD/2)**2;
  const equationOfTime = 4*DEG*(y*Math.sin(2*l0*RAD)-2*e*Math.sin(m*RAD)+4*e*y*Math.sin(m*RAD)*Math.cos(2*l0*RAD)-.5*y*y*Math.sin(4*l0*RAD)-1.25*e*e*Math.sin(2*m*RAD));
  const trueAnomaly=m+c;
  const earthSunDistanceAU=1.000001018*(1-e*e)/(1+e*Math.cos(trueAnomaly*RAD));
  return {declination, equationOfTime,earthSunDistanceAU};
}

function eventHourAngle(latitude: number, declination: number, zenith: number) {
  const cosH = (Math.cos(zenith*RAD) - Math.sin(latitude*RAD)*Math.sin(declination*RAD)) / (Math.cos(latitude*RAD)*Math.cos(declination*RAD));
  return Math.abs(cosH)>1?null:Math.acos(cosH)*DEG;
}

function atmosphericRefraction(elevation:number){
  if(elevation<=-1||elevation>=85)return 0;
  const te=Math.tan(elevation*RAD);
  return elevation>5?(58.1/te-.07/(te**3)+.000086/(te**5))/3600
    :elevation>-.575?(1735+elevation*(-518.2+elevation*(103.4+elevation*(-12.79+elevation*.711))))/3600
    :(-20.772/te)/3600;
}

export function calculateSolarEvents(date: Date, location: GeoLocation): SolarEvents {
  const {declination,equationOfTime} = solarTerms(date);
  const tz = -date.getTimezoneOffset();
  const noon = 720 - 4*location.lon - equationOfTime + tz;
  const pair = (zenith: number):readonly [number|null,number|null] => {
    const angle=eventHourAngle(location.lat,declination,zenith);if(angle===null)return [null,null];
    const delta=angle*4;
    return [normMinutes(noon-delta)/60,normMinutes(noon+delta)/60] as const;
  };
  const sun=pair(90.833), civil=pair(96), nautical=pair(102), astro=pair(108);
  const noonElevation=90-Math.abs(location.lat-declination);
  const midnightElevation=-(90-Math.abs(location.lat+declination));
  const polarState:SolarEvents["polarState"]=sun[0]!==null?"normal":noonElevation>0&&midnightElevation>0?"polar-day":"polar-night";
  return {solarNoon:normMinutes(noon)/60,sunrise:sun[0],sunset:sun[1],civilDawn:civil[0],civilDusk:civil[1],nauticalDawn:nautical[0],nauticalDusk:nautical[1],astronomicalDawn:astro[0],astronomicalDusk:astro[1],polarState};
}

/** NOAA-derived apparent solar position with refraction near the horizon. */
export function calculateSolarPosition(date: Date, location: GeoLocation): SolarPosition {
  const {declination,equationOfTime,earthSunDistanceAU}=solarTerms(date);
  const minutes=date.getHours()*60+date.getMinutes()+date.getSeconds()/60+date.getMilliseconds()/60000;
  const tz=-date.getTimezoneOffset();
  const trueSolar=normMinutes(minutes+equationOfTime+4*location.lon-tz);
  const hourAngle=(trueSolar/4<0?trueSolar/4+180:trueSolar/4-180);
  const lat=location.lat*RAD, dec=declination*RAD, ha=hourAngle*RAD;
  const zenith=Math.acos(clamp(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha),-1,1))*DEG;
  const geometricElevation=90-zenith;
  const elevation=geometricElevation+atmosphericRefraction(geometricElevation);
  const azimuth=norm360(Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(lat)-Math.tan(dec)*Math.cos(lat))*DEG+180);
  return {elevation,geometricElevation,zenith,azimuth,declination,hourAngle,equationOfTime,solarTime:trueSolar/60,events:calculateSolarEvents(date,location),earthSunDistanceAU,located:true};
}

export const STORY_SKY_SOLAR_RIG={latitude:35,declination:8,solarNoon:12.25} as const;

/**
 * Location-free but internally coherent temperate solar rig for fictional
 * scenes. Unlike the old fitted sine wave, altitude, azimuth, day length and
 * every twilight crossing all come from the same spherical geometry.
 */
export function calculateFallbackSolarPosition(date: Date): SolarPosition {
  const h=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600+date.getMilliseconds()/3600000;
  const {latitude,declination,solarNoon}=STORY_SKY_SOLAR_RIG;
  const hourAngle=norm360((h-solarNoon)*15+180)-180;
  const lat=latitude*RAD,dec=declination*RAD,ha=hourAngle*RAD;
  const zenith=Math.acos(clamp(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha),-1,1))*DEG;
  const geometricElevation=90-zenith;
  const elevation=geometricElevation+atmosphericRefraction(geometricElevation);
  const azimuth=norm360(Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(lat)-Math.tan(dec)*Math.cos(lat))*DEG+180);
  const pair=(zenithAngle:number):readonly[number|null,number|null]=>{
    const angle=eventHourAngle(latitude,declination,zenithAngle);
    return angle===null?[null,null]:[solarNoon-angle/15,solarNoon+angle/15];
  };
  const sun=pair(90.833),civil=pair(96),nautical=pair(102),astro=pair(108);
  const events:SolarEvents={solarNoon,sunrise:sun[0],sunset:sun[1],civilDawn:civil[0],civilDusk:civil[1],nauticalDawn:nautical[0],nauticalDusk:nautical[1],astronomicalDawn:astro[0],astronomicalDusk:astro[1],polarState:"normal"};
  return {elevation,geometricElevation,zenith,azimuth,declination,hourAngle,equationOfTime:0,solarTime:h,events,earthSunDistanceAU:1,located:false};
}

// Backward-compatible helpers used by external consumers.
export const solarElevation=(date:Date,latitude:number,longitude:number)=>calculateSolarPosition(date,{lat:latitude,lon:longitude}).elevation;
export const solarAwareArtisticHour=(date:Date)=>date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
