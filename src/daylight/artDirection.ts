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
  // Twilight definitions use the unrefracted solar-disc center. Apparent
  // elevation has a piecewise near-horizon refraction correction and is not a
  // safe continuous control signal for grading.
  const e=s.geometricElevation;
  if(e<-18){
    if(s.eveningAfterglow>.12)return ["Early Night","Residual upper-atmosphere glow fading into night"] as const;
    if(s.preDawnAirglow>.12)return ["Pre-dawn Night","Airglow strengthening before astronomical dawn"] as const;
    if(s.moonlightContribution>.06)return ["Moonlit Night",`${Math.round((s.moon.position?.illuminatedFraction??0)*100)}% ${s.moon.quality==="story-sky"?"Story Moon · art-directed night adaptation":"Moon · clear-sky adapted illumination"}`] as const;
    if(s.midnightDepth>.72)return ["Deep Night","Maximum solar depression · fully adapted nocturnal vision"] as const;
    return ["Night","Dark solar hemisphere · restrained airglow"] as const;
  }
  if(e<-12)return ["Astronomical Twilight","Last atmospheric blue above night"] as const;
  if(e<-6)return ["Nautical Twilight","Deep blue environment · minimal direct light"] as const;
  if(e<0)return ["Civil Twilight",s.evening?"Warm horizon fading into cool sky":"Fragile blue dawn before direct sun"] as const;
  if(e<12)return [s.evening?"Golden Sunset":"Early Sunrise",s.evening?"Amber low sun · cool environmental separation":"Warm low sun · clean cool skylight"] as const;
  if(e<25)return [s.evening?"Late Afternoon":"Early Morning",s.evening?"Directional warmth gathering gradually":"Sunlight cleaning toward yellow-white"] as const;
  if(e<50)return [s.evening?"Early Afternoon":"Late Morning",s.evening?"Neutral light gaining midtone richness":"Bright clean directional daylight"] as const;
  return ["High Solar Daylight","Neutral direct sun · minimal atmospheric path"] as const;
}

/** Maps continuous atmospheric physics into restrained photographic controls. */
export function calculateDaylightGrade(s:AtmosphereState,hour:number):DaylightGrade{
  const elevation=s.geometricElevation;
  const daylight=1-s.night;
  const lowSun=s.lowSunFactor;
  const skyIllumination=clamp(s.skyIrradiance+s.twilight*.18);
  const noon=Math.pow(clamp(Math.sin(Math.max(0,elevation)*Math.PI/180)),.7);
  const afternoon=smootherstep(.5,.98,s.dayProgress)*smootherstep(-2,10,elevation);
  const afternoonWarmth=afternoon*Math.pow(1-noon,.65);
  const morningFreshness=(1-s.evening)*smootherstep(0,12,elevation)*(1-smootherstep(28,48,elevation));
  const eveningBias=s.evening*(.25+.75*lowSun);
  const deepNightDensity=s.night*(.60*s.deepNightDepth+.40*s.midnightDepth);
  const moon=s.moonlightContribution;
  const storySky=s.moon.quality==="story-sky"?1:0;
  // Lunar chromatic information may become perceptible during twilight, but
  // toe/lift adaptation belongs to the much darker astronomical/night regime.
  // Delaying those additive controls prevents a dark source image from
  // appearing to brighten as civil twilight gives way to nautical twilight.
  const moonNightTone=moon*smootherstep(12,20,-elevation);
  // In Story Sky mode the frame is a fictional scene, so low evening sun is
  // allowed a little more photographic presence than a strict clear-sky
  // adaptation. Keep it tied to physical elevation and evening geometry.
  const storyGolden=storySky*s.evening*lowSun;
  // A broad C2 ramp makes exposure strictly follow solar depression without
  // the derivative peaks produced by stacked twilight "mode" curves.
  const solarDarkening=1-smootherstep(-30,15,elevation);
  const physicalSunColor=mixOklab([1,.985,.95],s.sunIlluminant.linearRgb,clamp(.30+.55*s.sunWarmth));
  // A low solar spectrum can become red-heavy after adaptation. The subtle
  // OKLab blend preserves its luminance while steering Story Sky's direct
  // light through photographic amber (red + yellow energy, not brown/magenta).
  const sunColor=mixOklab(physicalSunColor,[1,.82,.43],.22*storyGolden);
  const skyColor=mixOklab([.93,.97,1],s.skyIlluminant.linearRgb,clamp(.22+.48*s.skyCoolness));
  const moonColor=mixOklab([.94,.97,1],s.moon.spectralIlluminant.linearRgb,.20);
  const sunOffset=rgbOffset(sunColor,.20+.16*lowSun);
  const skyOffset=rgbOffset(skyColor,.14+.18*(s.rayleigh+s.twilight));
  const moonOffset=rgbOffset(moonColor,.12);
  const warmSeparation=lowSun*(.26+.13*eveningBias)*(.65+.35*s.spectralSeparation)+afternoonWarmth*.10+storyGolden*.16;
  const coolSeparation=clamp(s.skyCoolness*(.26+.35*(1-noon))+.20*lowSun*(.55+.45*s.spectralSeparation)+.07*morningFreshness+.06*s.eveningAfterglow+.08*s.preDawnAirglow-.05*deepNightDensity);
  const exposure=-.04+.14*noon-.12*(1-noon)*daylight-.08*s.haze*skyIllumination-.03*afternoon
    -3.0*solarDarkening-.20*deepNightDensity
    +.05*s.eveningAfterglow+.04*s.preDawnAirglow+.025*s.scotopicAdaptation+(.45+.50*storySky)*moon+.065*storyGolden;
  const temperature=s.sunWarmth*(.40+.16*eveningBias)-s.skyCoolness*.12*s.twilight-s.night*.25-.07*deepNightDensity-.04*s.preDawnAirglow+afternoonWarmth*.11-morningFreshness*.025-.018*moon+.055*storyGolden;
  const tint=clamp(s.sunIlluminant.tint*.08+s.skyIlluminant.tint*.04,-.04,.04)+eveningBias*lowSun*.024;
  const contrast=.025+.070*noon-.13*s.haze*skyIllumination-.05*s.twilight-.025*s.night-.018*afternoonWarmth;
  const saturation=.015+.055*(1-noon)*daylight+.025*lowSun+.018*afternoonWarmth-.14*s.twilight-.22*s.night-.07*deepNightDensity+.035*s.eveningAfterglow+.025*s.preDawnAirglow+.018*storyGolden;
  const vibrance=.025+.050*daylight*(1-s.haze)-.09*s.night+.022*storyGolden;
  const shadows:Vec3=[skyOffset[0]*coolSeparation+moonOffset[0]*moon*.18,skyOffset[1]*coolSeparation+moonOffset[1]*moon*.18,skyOffset[2]*coolSeparation+moonOffset[2]*moon*.18];
  const highlights:Vec3=[sunOffset[0]*warmSeparation,sunOffset[1]*warmSeparation,sunOffset[2]*warmSeparation];
  // The source may contain few specular highlights (common in visual-novel
  // backgrounds). Let golden light reach upper midtones without warming the
  // black floor or collapsing the direct-sun / cool-sky separation.
  const midtoneSun=.45+.34*storyGolden;
  const midtones:Vec3=[highlights[0]*midtoneSun+shadows[0]*.22,highlights[1]*midtoneSun+shadows[1]*.22,highlights[2]*midtoneSun+shadows[2]*.22];
  const nightLift=-.007*s.night-.003*deepNightDensity+.002*s.scotopicAdaptation+.001*s.twilight+(.003+.006*storySky)*moonNightTone;
  const lift:Vec3=[nightLift-s.night*.003,nightLift,nightLift+s.night*.004+s.twilight*.001+moon*.001];
  const gamma:Vec3=[1-.030*s.night+.006*s.haze+moonNightTone*.003,1-.014*s.night+.006*s.haze+moonNightTone*.004,1+.009*s.night+.003*s.twilight+moonNightTone*.004];
  const gain:Vec3=[1-.055*s.night+highlights[0]*.22+moonNightTone*.004,1-.025*s.night+highlights[1]*.22+moonNightTone*.006,1+.010*s.night+highlights[2]*.22+moonNightTone*.007];
  const [name,description]=daylightPhase(s);
  return {hour,name,description,exposure,temperature,tint,contrast,saturation,vibrance,lift,gamma,gain,shadows,midtones,highlights,
    blackPoint:Math.max(0,.003+.010*s.night+.007*deepNightDensity-.003*s.scotopicAdaptation+.002*s.twilight-(.003+.008*storySky)*moonNightTone-.0015*storyGolden),
    highlightRolloff:.28+.25*noon+.20*lowSun+.16*s.twilight+.14*s.night,
    clarity:.065*noon-.055*s.haze-.025*s.twilight+.012*moonNightTone,
    filmStrength:.42+.20*lowSun+.18*s.twilight+.20*s.night+.08*deepNightDensity};
}
