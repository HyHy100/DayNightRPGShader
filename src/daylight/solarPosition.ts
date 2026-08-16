const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export interface GeoLocation { lat: number; lon: number }
export interface SolarEvents {
  solarNoon: number;
  sunrise: number;
  sunset: number;
  civilDawn: number;
  civilDusk: number;
  nauticalDawn: number;
  nauticalDusk: number;
  astronomicalDawn: number;
  astronomicalDusk: number;
}
export interface SolarPosition {
  elevation: number;
  azimuth: number;
  declination: number;
  hourAngle: number;
  equationOfTime: number;
  solarTime: number;
  events: SolarEvents;
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
  return {declination, equationOfTime};
}

function eventHourAngle(latitude: number, declination: number, zenith: number) {
  const cosH = (Math.cos(zenith*RAD) - Math.sin(latitude*RAD)*Math.sin(declination*RAD)) / (Math.cos(latitude*RAD)*Math.cos(declination*RAD));
  return Math.acos(clamp(cosH,-1,1))*DEG;
}

export function calculateSolarEvents(date: Date, location: GeoLocation): SolarEvents {
  const {declination,equationOfTime} = solarTerms(date);
  const tz = -date.getTimezoneOffset();
  const noon = 720 - 4*location.lon - equationOfTime + tz;
  const pair = (zenith: number) => {
    const delta = eventHourAngle(location.lat,declination,zenith)*4;
    return [normMinutes(noon-delta)/60,normMinutes(noon+delta)/60] as const;
  };
  const sun=pair(90.833), civil=pair(96), nautical=pair(102), astro=pair(108);
  return {solarNoon:normMinutes(noon)/60,sunrise:sun[0],sunset:sun[1],civilDawn:civil[0],civilDusk:civil[1],nauticalDawn:nautical[0],nauticalDusk:nautical[1],astronomicalDawn:astro[0],astronomicalDusk:astro[1]};
}

/** NOAA-derived apparent solar position with refraction near the horizon. */
export function calculateSolarPosition(date: Date, location: GeoLocation): SolarPosition {
  const {declination,equationOfTime}=solarTerms(date);
  const minutes=date.getHours()*60+date.getMinutes()+date.getSeconds()/60;
  const tz=-date.getTimezoneOffset();
  const trueSolar=normMinutes(minutes+equationOfTime+4*location.lon-tz);
  const hourAngle=(trueSolar/4<0?trueSolar/4+180:trueSolar/4-180);
  const lat=location.lat*RAD, dec=declination*RAD, ha=hourAngle*RAD;
  const zenith=Math.acos(clamp(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(ha),-1,1))*DEG;
  let elevation=90-zenith;
  if(elevation>-1 && elevation<85){
    const te=Math.tan(elevation*RAD);
    const ref=elevation>5?(58.1/te-.07/(te**3)+.000086/(te**5))/3600:elevation>-.575?(1735+elevation*(-518.2+elevation*(103.4+elevation*(-12.79+elevation*.711))))/3600:(-20.772/te)/3600;
    elevation+=ref;
  }
  const azimuth=norm360(Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(lat)-Math.tan(dec)*Math.cos(lat))*DEG+180);
  return {elevation,azimuth,declination,hourAngle,equationOfTime,solarTime:trueSolar/60,events:calculateSolarEvents(date,location),located:true};
}

/** Clock-only fallback still produces a continuous solar-like state. */
export function calculateFallbackSolarPosition(date: Date): SolarPosition {
  const h=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
  const solarTime=h;
  const hourAngle=(h-12)*15;
  // A C2-smooth 6:00–18:00 reference arc, extended below the horizon at night.
  const elevation=68*Math.sin((h-6)*Math.PI/12)-8;
  const events={solarNoon:12,sunrise:6.5,sunset:17.5,civilDawn:6,civilDusk:18,nauticalDawn:5.5,nauticalDusk:18.5,astronomicalDawn:5,astronomicalDusk:19};
  return {elevation,azimuth:norm360(90+(h-6)*15),declination:0,hourAngle,equationOfTime:0,solarTime,events,located:false};
}

// Backward-compatible helpers used by external consumers.
export const solarElevation=(date:Date,latitude:number,longitude:number)=>calculateSolarPosition(date,{lat:latitude,lon:longitude}).elevation;
export const solarAwareArtisticHour=(date:Date)=>date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
