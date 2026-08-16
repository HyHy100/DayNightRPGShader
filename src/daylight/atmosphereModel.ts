import type { SolarPosition } from "./solarPosition";

const clamp01=(x:number)=>Math.max(0,Math.min(1,x));
export const smootherstep=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};
const gaussian=(x:number,c:number,w:number)=>Math.exp(-.5*((x-c)/w)**2);

export interface AtmosphereState extends SolarPosition {
  solarDepression:number; airMass:number; sunIntensity:number; directDiffuseRatio:number;
  sunCCT:number; skyCCT:number; sunWarmth:number; skyCoolness:number; rayleigh:number;
  mie:number; haze:number; goldenHour:number; blueHour:number; twilight:number; night:number;
  deepNightDepth:number; nightProgress:number; midnightDepth:number; eveningAfterglow:number;
  preDawnAirglow:number; scotopicAdaptation:number; dayProgress:number; evening:number;
}

export function calculateAirMass(elevation:number){
  if(elevation<=-1) return 40;
  const e=Math.max(-.99,elevation);
  return Math.min(40,1/(Math.sin(e*Math.PI/180)+.50572*((e+6.07995)**-1.6364)));
}

export function calculateAtmosphereState(solar:SolarPosition):AtmosphereState{
  const e=solar.elevation;
  const airMass=calculateAirMass(e);
  const above=smootherstep(-6,8,e);
  const altitude=clamp01(Math.sin(Math.max(0,e)*Math.PI/180));
  const sunIntensity=above*Math.pow(altitude,.32)*Math.exp(-.025*Math.max(0,airMass-1));
  const horizon=gaussian(e,1.5,9.5);
  const mie=clamp01(horizon*(.45+.55*clamp01((airMass-1)/12)));
  const rayleigh=clamp01(.28+.62*(1-Math.pow(altitude,.45)))*smootherstep(-17,-4,e);
  const twilight=smootherstep(-18,-10,e)*(1-smootherstep(-2,3,e));
  const blueHour=gaussian(e,-4.5,5.5)*(1-smootherstep(0,8,e));
  const goldenHour=gaussian(e,5,8)*smootherstep(-4,1,e);
  const night=1-smootherstep(-18,-12,e);
  const deepNightDepth=night*smootherstep(18,65,Math.max(0,-e));
  // Follow the sun around the dark hemisphere: approximately 0 at evening
  // horizon, .5 at anti-solar midnight and 1 at the morning horizon. This
  // remains useful even when solar depression has saturated at deep night.
  const darkHemisphereAngle=solar.hourAngle>=0 ? solar.hourAngle-90 : solar.hourAngle+270;
  const nightProgress=clamp01(darkHemisphereAngle/180);
  // A Gaussian keeps both the value and its rate of change smooth through
  // midnight. A triangular response produced a subtle derivative cusp there.
  const midnightDistance=(nightProgress-.5)/.24;
  const midnightDepth=night*Math.exp(-.5*midnightDistance*midnightDistance);
  const eveningAfterglow=(solar.hourAngle>=0?1:0)*night*(1-smootherstep(18,42,Math.max(0,-e)));
  const preDawnAirglow=(solar.hourAngle<0?1:0)*night*(1-smootherstep(18,42,Math.max(0,-e)));
  const scotopicAdaptation=night*smootherstep(.08,.55,nightProgress);
  const sunWarmth=(1-Math.exp(-Math.max(0,airMass-1)/6))*above;
  const skyCoolness=clamp01(.25+.55*rayleigh+.35*blueHour-.18*sunIntensity);
  const directDiffuseRatio=clamp01(sunIntensity*(1-.55*mie));
  const haze=clamp01(.10+.62*mie+.28*twilight);
  const sunCCT=1850+4400*(1-Math.exp(-Math.max(0,e+.5)/13));
  const skyCCT=7200+3800*rayleigh+2200*blueHour;
  const {sunrise,sunset,solarNoon}=solar.events;
  const clock=solar.solarTime;
  const evening=solar.hourAngle>=0?1:0;
  const dayProgress=clock<=solarNoon ? .5*(clock-sunrise)/Math.max(.1,solarNoon-sunrise) : .5+.5*(clock-solarNoon)/Math.max(.1,sunset-solarNoon);
  return {...solar,solarDepression:Math.max(0,-e),airMass,sunIntensity,directDiffuseRatio,sunCCT,skyCCT,sunWarmth,skyCoolness,rayleigh,mie,haze,goldenHour,blueHour,twilight,night,deepNightDepth,nightProgress,midnightDepth,eveningAfterglow,preDawnAirglow,scotopicAdaptation,dayProgress:clamp01(dayProgress),evening};
}
