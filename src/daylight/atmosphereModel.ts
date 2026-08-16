import { calculateClearSkyIrradiance,STANDARD_ATMOSPHERE,type AtmosphereProfile,type ClearSkyIrradiance } from "./clearSkyModel";
import { calculateSpectralIlluminants,type SpectralIlluminant } from "./spectralModel";
import { UNAVAILABLE_MOONLIGHT,type MoonlightState } from "./moonlightModel";
import type { SolarPosition } from "./solarPosition";

const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
export const smootherstep=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};

export interface PhysicalDaylightState extends SolarPosition {
  quality:"physical-clear-sky"|"qualitative-reference";
  profile:AtmosphereProfile;
  irradiance:ClearSkyIrradiance;
  sunIlluminant:SpectralIlluminant;
  skyIlluminant:SpectralIlluminant;
  moon:MoonlightState;
  solarDepression:number; airMass:number; sunIntensity:number; skyIrradiance:number; directDiffuseRatio:number;
  sunCCT:number; skyCCT:number; sunWarmth:number; skyCoolness:number; rayleigh:number;
  mie:number; haze:number; lowSunFactor:number; spectralSeparation:number; twilight:number; night:number;
  deepNightDepth:number; nightProgress:number; midnightDepth:number; eveningAfterglow:number;
  preDawnAirglow:number; scotopicAdaptation:number; dayProgress:number; evening:number;
  moonlightContribution:number;
}
export type AtmosphereState=PhysicalDaylightState;

export function calculateAirMass(elevation:number){
  if(elevation<=0)return 0;
  const z=90-elevation;
  return 1/(Math.cos(z*Math.PI/180)+.50572*Math.pow(96.07995-z,-1.6364));
}

export function calculateAtmosphereState(solar:SolarPosition,profile:AtmosphereProfile=STANDARD_ATMOSPHERE,moon:MoonlightState=UNAVAILABLE_MOONLIGHT):AtmosphereState{
  const e=solar.geometricElevation;
  const irradiance=calculateClearSkyIrradiance(e,solar.earthSunDistanceAU,profile);
  const {sun:sunIlluminant,sky:skyIlluminant}=calculateSpectralIlluminants(e,irradiance,profile);
  const solarDepression=Math.max(0,-e),above=smootherstep(-1,3,e);
  const dniNorm=clamp01(irradiance.dni/1000),dhiNorm=clamp01(irradiance.dhi/260),ghiNorm=clamp01(irradiance.ghi/1050);
  const twilightRadiance=Math.exp(-.27*solarDepression)*smootherstep(-18,-12,e)*(1-smootherstep(2,8,e));
  const sunIntensity=solar.located?dniNorm:clamp01(dniNorm*.88+smootherstep(0,22,e)*.12);
  const skyIrradiance=solar.located?clamp01(dhiNorm*.78+ghiNorm*.22+twilightRadiance*.1):clamp01(dhiNorm*.55+ghiNorm*.35+twilightRadiance*.1);
  const directHorizontal=irradiance.dni*Math.max(0,Math.sin(e*Math.PI/180));
  const directDiffuseRatio=irradiance.ghi>0?clamp01(directHorizontal/irradiance.ghi):0;
  const scatteringVisibility=smootherstep(-2,8,e);
  const rayleigh=(1-irradiance.transmissions.rayleigh)*scatteringVisibility;
  const mie=(1-irradiance.transmissions.aerosol)*scatteringVisibility;
  const haze=clamp01(.06+.58*mie+.24*(1-directDiffuseRatio)*above+.18*twilightRadiance);
  const eveningSide=solar.hourAngle>=0;
  const subHorizonGlow=smootherstep(-6,-.5,e)*(1-smootherstep(0,4,e))*(eveningSide?.70:.35);
  // Color character survives at much lower beam energy than broadband
  // irradiance. Keep a restrained, asymmetric horizon glow through civil twilight.
  const aboveHorizonWarmth=smootherstep(-2,4,e);
  const warmthVisibility=1-(1-aboveHorizonWarmth)*(1-subHorizonGlow);
  const sunWarmth=clamp01((6500-sunIlluminant.cct)/4300)*warmthVisibility;
  const skyCoolness=clamp01((skyIlluminant.cct-6500)/10000+.18*twilightRadiance);
  const chromaticDistance=Math.hypot(sunIlluminant.xy[0]-skyIlluminant.xy[0],sunIlluminant.xy[1]-skyIlluminant.xy[1]);
  const spectralSeparation=clamp01((chromaticDistance-.12)/.20);
  // Low-sun art response is now derived from physical air mass and surviving
  // beam energy instead of an hourly or Gaussian "golden hour" pulse.
  const lowSunAirMass=clamp01((irradiance.opticalAirMass-1)/8);
  const lowSunPresence=smootherstep(-1.5,1.5,e)*(1-smootherstep(14,34,e));
  const lowSunBeam=.58+.42*smootherstep(0,10,e);
  const lowSunAbove=lowSunAirMass*lowSunPresence*lowSunBeam*smootherstep(0,3,e),lowSunBelow=subHorizonGlow*.60;
  const lowSunFactor=1-(1-lowSunAbove)*(1-lowSunBelow);
  const twilight=smootherstep(-20,-8,e)*(1-smootherstep(-8,8,e));
  const night=1-smootherstep(-24,-8,e);
  const deepNightDepth=night*smootherstep(18,65,solarDepression);
  const darkHemisphereAngle=solar.hourAngle>=0?solar.hourAngle-90:solar.hourAngle+270;
  const nightProgress=clamp01(darkHemisphereAngle/180);
  const midnightDistance=(nightProgress-.5)/.24;
  const midnightDepth=night*Math.exp(-.5*midnightDistance*midnightDistance);
  const eveningAfterglow=(solar.hourAngle>=0?1:0)*night*(1-smootherstep(18,42,solarDepression));
  const preDawnAirglow=(solar.hourAngle<0?1:0)*night*(1-smootherstep(18,42,solarDepression));
  const scotopicAdaptation=night*smootherstep(.08,.55,nightProgress);
  const moonlightContribution=moon.available?moon.normalizedIntensity*(1-smootherstep(-12,-6,e)):0;
  const {sunrise,sunset,solarNoon,polarState}=solar.events,clock=solar.solarTime;
  let dayProgress=.5+.5*Math.sin(solar.hourAngle*Math.PI/180);
  if(polarState==="normal"&&sunrise!==null&&sunset!==null){
    dayProgress=clock<=solarNoon?.5*(clock-sunrise)/Math.max(.1,solarNoon-sunrise):.5+.5*(clock-solarNoon)/Math.max(.1,sunset-solarNoon);
  }
  const evening=eveningSide?1:0;
  return {...solar,quality:solar.located?"physical-clear-sky":"qualitative-reference",profile,irradiance,sunIlluminant,skyIlluminant,moon,solarDepression,
    airMass:irradiance.opticalAirMass,sunIntensity,skyIrradiance,directDiffuseRatio,sunCCT:sunIlluminant.cct,skyCCT:skyIlluminant.cct,
    sunWarmth,skyCoolness,rayleigh,mie,haze,lowSunFactor,spectralSeparation,twilight,night,deepNightDepth,nightProgress,midnightDepth,
    eveningAfterglow,preDawnAirglow,scotopicAdaptation,moonlightContribution,dayProgress:clamp01(dayProgress),evening};
}
