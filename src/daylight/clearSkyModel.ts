const RAD=Math.PI/180;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smootherstep=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};

export interface AtmosphereProfile {
  name:string;
  pressureHpa:number;
  altitudeM:number;
  precipitableWaterCm:number;
  ozoneAtmCm:number;
  aerosolOpticalDepth500:number;
  angstromExponent:number;
  groundAlbedo:number;
}

export interface ClearSkyIrradiance {
  dni:number;
  dhi:number;
  ghi:number;
  extraterrestrialNormal:number;
  opticalAirMass:number;
  pressureAirMass:number;
  transmissions:{rayleigh:number;ozone:number;mixedGas:number;water:number;aerosol:number;aerosolAbsorption:number};
}

export const ATMOSPHERE_PRESETS={
  Clean:{name:"Clean",pressureHpa:1013.25,altitudeM:0,precipitableWaterCm:1.0,ozoneAtmCm:.30,aerosolOpticalDepth500:.05,angstromExponent:1.3,groundAlbedo:.15},
  Standard:{name:"Standard",pressureHpa:1013.25,altitudeM:0,precipitableWaterCm:1.5,ozoneAtmCm:.30,aerosolOpticalDepth500:.10,angstromExponent:1.3,groundAlbedo:.20},
  Hazy:{name:"Hazy",pressureHpa:1013.25,altitudeM:0,precipitableWaterCm:3.0,ozoneAtmCm:.32,aerosolOpticalDepth500:.30,angstromExponent:1.0,groundAlbedo:.22},
} satisfies Record<string,AtmosphereProfile>;

export const STANDARD_ATMOSPHERE:AtmosphereProfile={...ATMOSPHERE_PRESETS.Standard};

/** Kasten–Young 1989 relative optical air mass. Undefined below the horizon. */
export function relativeOpticalAirMass(zenithDeg:number){
  if(zenithDeg>=90)return 0;
  const z=Math.max(0,zenithDeg);
  return 1/(Math.cos(z*RAD)+.50572*Math.pow(96.07995-z,-1.6364));
}

/** Pressure estimated from altitude using the standard troposphere. */
export function pressureAtAltitude(altitudeM:number){
  return 1013.25*Math.pow(Math.max(.01,1-2.25577e-5*Math.max(-500,altitudeM)),5.25588);
}

/**
 * Bird & Hulstrom broadband clear-sky parameterization. Outputs are estimates
 * for a cloudless horizontal plane; they are not measured weather data.
 */
export function calculateClearSkyIrradiance(
  geometricElevationDeg:number,
  earthSunDistanceAU:number,
  profile:AtmosphereProfile,
):ClearSkyIrradiance{
  const extraterrestrialNormal=1361.1/Math.max(.94,Math.min(1.06,earthSunDistanceAU))**2;
  if(geometricElevationDeg<=0)return {dni:0,dhi:0,ghi:0,extraterrestrialNormal,opticalAirMass:0,pressureAirMass:0,transmissions:{rayleigh:1,ozone:1,mixedGas:1,water:1,aerosol:1,aerosolAbsorption:1}};

  const zenith=90-geometricElevationDeg;
  const opticalAirMass=relativeOpticalAirMass(zenith);
  const pressure=Math.max(100,profile.pressureHpa)*pressureAtAltitude(profile.altitudeM)/1013.25;
  const pressureAirMass=opticalAirMass*pressure/1013.25;
  const m=Math.max(.001,pressureAirMass);
  const ozoneMass=Math.max(0,profile.ozoneAtmCm)*opticalAirMass;
  const waterMass=Math.max(0,profile.precipitableWaterCm)*opticalAirMass;

  const rayleigh=clamp(Math.exp(-.0903*Math.pow(m,.84)*(1+m-Math.pow(m,1.01))));
  const ozone=clamp(1-.1611*ozoneMass*Math.pow(1+139.48*ozoneMass,-.3035)-.002715*ozoneMass/(1+.044*ozoneMass+.0003*ozoneMass*ozoneMass));
  const mixedGas=clamp(Math.exp(-.0127*Math.pow(m,.26)));
  const water=clamp(1-2.4959*waterMass/(Math.pow(1+79.034*waterMass,.6828)+6.385*waterMass));
  const tau500=clamp(profile.aerosolOpticalDepth500,0,.8);
  const tau380=tau500*Math.pow(.38/.50,-clamp(profile.angstromExponent,.2,2.5));
  const broadbandTau=.2758*tau380+.35*tau500;
  const aerosol=Math.exp(-Math.pow(broadbandTau,.873)*(1+broadbandTau-Math.pow(broadbandTau,.7088))*Math.pow(opticalAirMass,.9108));
  const aerosolAbsorption=clamp(1-.1*(1-opticalAirMass+Math.pow(opticalAirMass,1.06))*(1-aerosol),.7,1);
  const aerosolScattering=clamp(aerosol/Math.max(.001,aerosolAbsorption),0,1);

  const horizonValidity=smootherstep(0,4,geometricElevationDeg);
  const dni=.9662*extraterrestrialNormal*rayleigh*ozone*mixedGas*water*aerosol*horizonValidity;
  const cosZenith=Math.max(0,Math.sin(geometricElevationDeg*RAD));
  const forwardScatter=.84;
  const primaryDiffuse=extraterrestrialNormal*cosZenith*.79*ozone*mixedGas*water*aerosolAbsorption*
    (.5*(1-rayleigh)+forwardScatter*(1-aerosolScattering))/Math.max(.05,1-opticalAirMass+Math.pow(opticalAirMass,1.02));
  const skyReflectance=clamp(.0685+(1-forwardScatter)*(1-aerosolScattering),0,.95);
  const dhi=Math.max(0,primaryDiffuse/Math.max(.2,1-clamp(profile.groundAlbedo,0,.95)*skyReflectance))*horizonValidity;
  const ghi=Math.max(0,dni*cosZenith+dhi);
  return {dni,dhi,ghi,extraterrestrialNormal,opticalAirMass,pressureAirMass,transmissions:{rayleigh,ozone,mixedGas,water,aerosol,aerosolAbsorption}};
}
