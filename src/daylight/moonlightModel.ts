import { pressureAtAltitude,type AtmosphereProfile } from "./clearSkyModel";
import { calculateLunarPosition,type LunarPosition } from "./lunarPosition";
import { integrateSpectralIlluminant,solarBlackbody,type SpectralIlluminant } from "./spectralModel";
import type { GeoLocation } from "./solarPosition";

const RAD=Math.PI/180;
const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
const smootherstep=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};

export interface MoonlightState {
  available:boolean;
  quality:"physical-clear-sky"|"story-sky"|"unavailable-location";
  position:LunarPosition|null;
  topOfAtmosphereIlluminanceLux:number;
  groundIlluminanceLux:number;
  directIlluminanceLux:number;
  diffuseIlluminanceLux:number;
  opticalAirMass:number;
  atmosphericTransmission:number;
  normalizedIntensity:number;
  spectralIlluminant:SpectralIlluminant;
}

export interface StoryMoonConfig {
  illuminatedFraction:number;
  transitHour:number;
  maximumElevation:number;
  waxing:boolean;
}

export const DEFAULT_STORY_MOON:StoryMoonConfig={illuminatedFraction:.95,transitHour:0,maximumElevation:68,waxing:true};

const neutralMoonIlluminant=()=>integrateSpectralIlluminant(w=>solarBlackbody(w)*(0.86+.18*(w-380)/400));

function lunarAirMass(elevation:number){
  if(elevation<=0)return 0;
  const z=90-elevation;
  return 1/(Math.cos(z*RAD)+.50572*Math.pow(96.07995-z,-1.6364));
}

export function unavailableMoonlight():MoonlightState{
  return {available:false,quality:"unavailable-location",position:null,topOfAtmosphereIlluminanceLux:0,groundIlluminanceLux:0,
    directIlluminanceLux:0,diffuseIlluminanceLux:0,opticalAirMass:0,atmosphericTransmission:0,normalizedIntensity:0,
    spectralIlluminant:neutralMoonIlluminant()};
}

export const UNAVAILABLE_MOONLIGHT=unavailableMoonlight();

function calculateFromPosition(position:LunarPosition,profile:AtmosphereProfile,quality:MoonlightState["quality"]):MoonlightState{
  const alpha=Math.abs(position.phaseAngle);
  // Krisciunas–Schaefer lunar phase function, normalized to full Moon.
  const phaseBrightness=Math.pow(10,-.4*(.026*alpha+4e-9*alpha**4));
  const distanceScale=(384400/position.distanceKm)**2;
  const topOfAtmosphereIlluminanceLux=.36*phaseBrightness*distanceScale;
  const opticalAirMass=lunarAirMass(position.geometricElevation);
  const pressureScale=Math.max(100,profile.pressureHpa)*pressureAtAltitude(profile.altitudeM)/(1013.25*1013.25);
  const verticalOpticalDepth=.096*pressureScale+profile.aerosolOpticalDepth500+.012*(profile.ozoneAtmCm/.30)+.009*(profile.precipitableWaterCm/1.5);
  const atmosphericTransmission=opticalAirMass?Math.exp(-verticalOpticalDepth*opticalAirMass):0;
  const horizonVisibility=smootherstep(-.5,2,position.geometricElevation);
  const incidence=Math.max(0,Math.sin(position.elevation*RAD));
  const directIlluminanceLux=topOfAtmosphereIlluminanceLux*atmosphericTransmission*incidence*horizonVisibility;
  const scatteredFraction=(1-atmosphericTransmission)*(.08+.10*clamp01(profile.aerosolOpticalDepth500/.35));
  const diffuseIlluminanceLux=topOfAtmosphereIlluminanceLux*scatteredFraction*horizonVisibility;
  const groundIlluminanceLux=directIlluminanceLux+diffuseIlluminanceLux;
  const normalizedIntensity=clamp01(groundIlluminanceLux/.30);
  const spectralIlluminant=integrateSpectralIlluminant(wavelength=>{
    const um=wavelength/1000;
    const rayleighTau=.008735*Math.pow(um,-4.08)*pressureScale;
    const aerosolTau=profile.aerosolOpticalDepth500*Math.pow(um/.5,-profile.angstromExponent);
    const extinction=Math.exp(-Math.max(1,opticalAirMass)*(rayleighTau+aerosolTau));
    const regolithReflectance=.86+.18*(wavelength-380)/400;
    return solarBlackbody(wavelength)*regolithReflectance*extinction;
  });
  return {available:true,quality,position,topOfAtmosphereIlluminanceLux,groundIlluminanceLux,directIlluminanceLux,
    diffuseIlluminanceLux,opticalAirMass,atmosphericTransmission,normalizedIntensity,spectralIlluminant};
}

export function calculateMoonlight(date:Date,location:GeoLocation,profile:AtmosphereProfile):MoonlightState{
  return calculateFromPosition(calculateLunarPosition(date,location,profile.altitudeM),profile,"physical-clear-sky");
}

/**
 * Location-free celestial rig for fictional scenes. It preserves a smooth,
 * plausible rise/transit/set arc while exposing phase and timing as art controls.
 * Values are intentionally identified as story-world estimates, not ephemerides.
 */
export function calculateStoryMoonlight(hour:number,profile:AtmosphereProfile,config:StoryMoonConfig=DEFAULT_STORY_MOON):MoonlightState{
  const wrappedHour=((hour-config.transitHour+12)%24+24)%24-12;
  const hourAngle=wrappedHour*15,maximumElevation=Math.max(20,Math.min(88,config.maximumElevation));
  const geometricElevation=maximumElevation*Math.cos(hourAngle*RAD);
  const elevation=geometricElevation+((geometricElevation>-1&&geometricElevation<10)?(.55*smootherstep(-1,1,geometricElevation)*(1-smootherstep(5,10,geometricElevation))):0);
  const fraction=Math.max(.001,Math.min(.999,config.illuminatedFraction));
  const phaseAngle=Math.acos(2*fraction-1)*180/Math.PI,halfMonth=29.530588853*.5;
  const position:LunarPosition={elevation,geometricElevation,azimuth:((180+hourAngle)%360+360)%360,zenith:90-geometricElevation,
    rightAscension:0,declination:0,distanceKm:384400,horizontalParallax:.9507,phaseAngle,illuminatedFraction:fraction,
    elongation:180-phaseAngle,ageDays:config.waxing?halfMonth*(1-phaseAngle/180):halfMonth*(1+phaseAngle/180),waxing:config.waxing,aboveHorizon:elevation>0};
  return calculateFromPosition(position,profile,"story-sky");
}
