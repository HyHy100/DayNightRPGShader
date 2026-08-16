import { smootherstep,type AtmosphereState } from "./atmosphereModel";
import { mixOklab, rgbOffset, type Vec3 } from "./perceptualColor";

export interface DaylightGrade {
  hour:number; name:string; description:string; exposure:number; temperature:number; tint:number;
  contrast:number; saturation:number; vibrance:number; lift:Vec3; gamma:Vec3; gain:Vec3;
  shadows:Vec3; midtones:Vec3; highlights:Vec3; blackPoint:number; highlightRolloff:number;
  clarity:number; filmStrength:number;
}
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function daylightPhase(s:AtmosphereState){
  const e=s.elevation;
  if(e<-18)return ["True Night","Astronomical daylight has fully receded"] as const;
  if(e<-12)return ["Astronomical Twilight","Last atmospheric blue above night"] as const;
  if(e<-6)return ["Nautical Twilight","Deep blue environment · minimal direct light"] as const;
  if(e<0)return ["Civil Twilight",s.evening?"Warm horizon fading into cool sky":"Fragile blue dawn before direct sun"] as const;
  if(e<8)return [s.evening?"Golden Sunset":"Early Sunrise",s.evening?"Amber low sun · cool environmental separation":"Warm low sun · clean cool skylight"] as const;
  if(e<25)return [s.evening?"Late Afternoon":"Early Morning",s.evening?"Directional warmth gathering gradually":"Sunlight cleaning toward yellow-white"] as const;
  if(e<50)return [s.evening?"Early Afternoon":"Late Morning",s.evening?"Neutral light gaining midtone richness":"Bright clean directional daylight"] as const;
  return ["High Solar Daylight","Neutral direct sun · minimal atmospheric path"] as const;
}

/** Maps continuous atmospheric physics into restrained photographic controls. */
export function calculateDaylightGrade(s:AtmosphereState,hour:number):DaylightGrade{
  const daylight=1-s.night;
  const lowSun=s.goldenHour;
  const skyIllumination=smootherstep(-18,2,s.elevation);
  const noon=Math.pow(clamp(Math.sin(Math.max(0,s.elevation)*Math.PI/180)),.7);
  const afternoon=smootherstep(.5,.98,s.dayProgress)*smootherstep(-2,10,s.elevation);
  const afternoonWarmth=afternoon*Math.pow(1-noon,.65);
  const morningFreshness=(1-s.evening)*smootherstep(0,12,s.elevation)*(1-smootherstep(28,48,s.elevation));
  const eveningBias=s.evening*(.25+.75*lowSun);
  const sunColor=mixOklab([1,.985,.95],[1,.48,.16],clamp(s.sunWarmth*(.72+.18*eveningBias)));
  const skyColor=mixOklab([.93,.97,1],[.36,.62,1],clamp(s.skyCoolness*.72));
  const sunOffset=rgbOffset(sunColor,.23+.30*lowSun);
  const skyOffset=rgbOffset(skyColor,.16+.20*(s.rayleigh+s.blueHour));
  const warmSeparation=lowSun*(.58+.24*eveningBias)+afternoonWarmth*.10;
  const coolSeparation=clamp(s.skyCoolness*(.28+.42*(1-noon))+.24*lowSun+.08*morningFreshness);
  const exposure=-1.42+1.46*skyIllumination+.13*noon-.14*s.haze*skyIllumination-.04*afternoon;
  const temperature=s.sunWarmth*(.44+.18*eveningBias)-s.blueHour*.20-s.night*.28+afternoonWarmth*.11-morningFreshness*.025;
  const tint=eveningBias*lowSun*.030-s.blueHour*.008;
  const contrast=.025+.070*noon-.13*s.haze*skyIllumination-.05*s.twilight-.025*s.night-.018*afternoonWarmth;
  const saturation=.015+.055*(1-noon)*daylight+.025*lowSun+.018*afternoonWarmth-.14*s.twilight-.25*s.night;
  const vibrance=.025+.050*daylight*(1-s.haze)-.09*s.night;
  const shadows:Vec3=[skyOffset[0]*coolSeparation,skyOffset[1]*coolSeparation,skyOffset[2]*coolSeparation];
  const highlights:Vec3=[sunOffset[0]*warmSeparation,sunOffset[1]*warmSeparation,sunOffset[2]*warmSeparation];
  const midtones:Vec3=[highlights[0]*.45+shadows[0]*.22,highlights[1]*.45+shadows[1]*.22,highlights[2]*.45+shadows[2]*.22];
  const nightLift=-.006*s.night+.004*s.twilight;
  const lift:Vec3=[nightLift-s.night*.003,nightLift,nightLift+s.night*.005+s.blueHour*.004];
  const gamma:Vec3=[1-.028*s.night+.008*s.haze,1-.012*s.night+.008*s.haze,1+.012*s.night+.010*s.blueHour];
  const gain:Vec3=[1-.055*s.night+highlights[0]*.22,1-.025*s.night+highlights[1]*.22,1+.010*s.night+highlights[2]*.22];
  const [name,description]=daylightPhase(s);
  return {hour,name,description,exposure,temperature,tint,contrast,saturation,vibrance,lift,gamma,gain,shadows,midtones,highlights,
    blackPoint:.004+.010*s.night-.010*s.twilight,
    highlightRolloff:.28+.25*noon+.20*lowSun+.16*s.twilight+.14*s.night,
    clarity:.065*noon-.055*s.haze-.025*s.twilight,
    filmStrength:.42+.20*lowSun+.18*s.twilight+.24*s.night};
}
