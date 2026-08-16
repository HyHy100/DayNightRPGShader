import type { GeoLocation } from "./solarPosition";

const RAD=Math.PI/180,DEG=180/Math.PI,EARTH_RADIUS_KM=6378.137,J2000=2451545;
const norm360=(x:number)=>((x%360)+360)%360;
const clamp=(x:number,a=-1,b=1)=>Math.max(a,Math.min(b,x));

export interface LunarPosition {
  elevation:number; geometricElevation:number; azimuth:number; zenith:number;
  rightAscension:number; declination:number; distanceKm:number; horizontalParallax:number;
  phaseAngle:number; illuminatedFraction:number; elongation:number; ageDays:number;
  waxing:boolean; aboveHorizon:boolean;
}

function refraction(elevation:number){
  if(elevation<=-1||elevation>=85)return 0;
  const t=Math.tan(elevation*RAD);
  if(elevation>5)return (58.1/t-.07/(t**3)+.000086/(t**5))/3600;
  if(elevation>-.575)return (1735+elevation*(-518.2+elevation*(103.4+elevation*(-12.79+elevation*.711))))/3600;
  return (-20.772/t)/3600;
}

function equatorial(longitude:number,latitude:number,obliquity:number){
  const ra=Math.atan2(Math.sin(longitude)*Math.cos(obliquity)-Math.tan(latitude)*Math.sin(obliquity),Math.cos(longitude));
  const dec=Math.asin(Math.sin(latitude)*Math.cos(obliquity)+Math.cos(latitude)*Math.sin(obliquity)*Math.sin(longitude));
  return {ra,dec};
}

/** Compact Meeus-derived, sub-degree lunar ephemeris suitable for illumination and grading. */
export function calculateLunarPosition(date:Date,location:GeoLocation,observerAltitudeM=0):LunarPosition{
  const jd=date.getTime()/86400000+2440587.5,d=jd-J2000;
  const obliquity=(23.4397-.00000036*d)*RAD;
  const meanLongitude=(218.316+13.176396*d)*RAD;
  const meanAnomaly=(134.963+13.064993*d)*RAD;
  const argumentLatitude=(93.272+13.229350*d)*RAD;
  const longitude=meanLongitude+6.289*RAD*Math.sin(meanAnomaly);
  const latitude=5.128*RAD*Math.sin(argumentLatitude);
  const distanceKm=385001-20905*Math.cos(meanAnomaly);
  const moon=equatorial(longitude,latitude,obliquity);

  const sunMeanAnomaly=(357.5291+.98560028*d)*RAD;
  const sunLongitude=(280.1470+.9856235*d+1.9148*Math.sin(sunMeanAnomaly)+.0200*Math.sin(2*sunMeanAnomaly)+.0003*Math.sin(3*sunMeanAnomaly))*RAD;
  const sun=equatorial(sunLongitude,0,obliquity);
  const elongation=Math.acos(clamp(Math.sin(sun.dec)*Math.sin(moon.dec)+Math.cos(sun.dec)*Math.cos(moon.dec)*Math.cos(sun.ra-moon.ra)));
  const phaseAngle=Math.atan2(149598000*Math.sin(elongation),distanceKm-149598000*Math.cos(elongation));
  const illuminatedFraction=(1+Math.cos(phaseAngle))*.5;
  const phaseOrientation=Math.atan2(Math.cos(sun.dec)*Math.sin(sun.ra-moon.ra),Math.sin(sun.dec)*Math.cos(moon.dec)-Math.cos(sun.dec)*Math.sin(moon.dec)*Math.cos(sun.ra-moon.ra));
  const waxing=phaseOrientation<0;
  const halfMonth=29.530588853*.5;
  const ageDays=waxing?halfMonth*(1-phaseAngle/Math.PI):halfMonth*(1+phaseAngle/Math.PI);

  const horizontalParallax=Math.asin(EARTH_RADIUS_KM/distanceKm);
  const gmst=norm360(280.46061837+360.98564736629*(jd-J2000)+.000387933*((jd-J2000)/36525)**2);
  let hourAngle=(norm360(gmst+location.lon-moon.ra*DEG)+180)%360-180;
  const phi=location.lat*RAD,u=Math.atan(.99664719*Math.tan(phi)),height=observerAltitudeM/(EARTH_RADIUS_KM*1000);
  const rhoSin=.99664719*Math.sin(u)+height*Math.sin(phi),rhoCos=Math.cos(u)+height*Math.cos(phi);
  const h=hourAngle*RAD;
  const deltaRa=Math.atan2(-rhoCos*Math.sin(horizontalParallax)*Math.sin(h),Math.cos(moon.dec)-rhoCos*Math.sin(horizontalParallax)*Math.cos(h));
  const topocentricRa=moon.ra+deltaRa;
  const topocentricDec=Math.atan2((Math.sin(moon.dec)-rhoSin*Math.sin(horizontalParallax))*Math.cos(deltaRa),Math.cos(moon.dec)-rhoCos*Math.sin(horizontalParallax)*Math.cos(h));
  hourAngle-=deltaRa*DEG;
  const topH=hourAngle*RAD;
  const geometricElevation=Math.asin(clamp(Math.sin(phi)*Math.sin(topocentricDec)+Math.cos(phi)*Math.cos(topocentricDec)*Math.cos(topH)))*DEG;
  const elevation=geometricElevation+refraction(geometricElevation);
  const azimuth=norm360(Math.atan2(Math.sin(topH),Math.cos(topH)*Math.sin(phi)-Math.tan(topocentricDec)*Math.cos(phi))*DEG+180);
  return {elevation,geometricElevation,azimuth,zenith:90-geometricElevation,rightAscension:norm360(topocentricRa*DEG),declination:topocentricDec*DEG,
    distanceKm,horizontalParallax:horizontalParallax*DEG,phaseAngle:phaseAngle*DEG,illuminatedFraction,elongation:elongation*DEG,ageDays,waxing,aboveHorizon:elevation>0};
}
