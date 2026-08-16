import { pressureAtAltitude,type AtmosphereProfile,type ClearSkyIrradiance } from "./clearSkyModel";
import type { Vec3 } from "./perceptualColor";

const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const gaussian=(x:number,c:number,w:number)=>Math.exp(-.5*((x-c)/w)**2);

export interface SpectralIlluminant {
  xyz:Vec3;
  xy:[number,number];
  cct:number;
  tint:number;
  linearRgb:Vec3;
}

const asymmetricGaussian=(w:number,mean:number,left:number,right:number)=>gaussian(w,mean,w<mean?left:right);
function cie1931(w:number):Vec3{
  // Analytic fit to the CIE 1931 2° observer (Wyman, Sloan & Shirley).
  const x=1.056*asymmetricGaussian(w,599.8,37.9,31)+.362*asymmetricGaussian(w,442,16,26)-.065*asymmetricGaussian(w,501.1,20.4,26.2);
  const y=.821*asymmetricGaussian(w,568.8,46.9,40.5)+.286*asymmetricGaussian(w,530.9,16.3,31.1);
  const z=1.217*asymmetricGaussian(w,437,11.8,36)+.681*asymmetricGaussian(w,459,26,13.8);
  return [Math.max(0,x),Math.max(0,y),Math.max(0,z)];
}

export function solarBlackbody(wavelengthNm:number){
  const wavelength=wavelengthNm*1e-9,c2=1.438776877e-2,t=5778;
  return 1/(Math.pow(wavelength,5)*(Math.exp(c2/(wavelength*t))-1));
}

function xyzToRgb([x,y,z]:Vec3):Vec3{
  const rgb:[number,number,number]=[3.2406*x-1.5372*y-.4986*z,-.9689*x+1.8758*y+.0415*z,.0557*x-.204*y+1.057*z];
  const peak=Math.max(.0001,...rgb);return [clamp(rgb[0]/peak),clamp(rgb[1]/peak),clamp(rgb[2]/peak)];
}

function finishIlluminant(xyz:Vec3):SpectralIlluminant{
  const sum=Math.max(1e-8,xyz[0]+xyz[1]+xyz[2]),xy:[number,number]=[xyz[0]/sum,xyz[1]/sum];
  const scale=Math.max(1e-8,xyz[1]),normalized:Vec3=[xyz[0]/scale,1,xyz[2]/scale];
  const n=(xy[0]-.332)/(.1858-xy[1]);
  const cct=clamp(449*n*n*n+3525*n*n+6823.3*n+5520.33,1800,25000);
  // Signed distance from a compact daylight-locus approximation, for a
  // restrained green↔magenta correction rather than a second WB control.
  const locusY=-3*xy[0]*xy[0]+2.87*xy[0]-.275;
  const tint=clamp((xy[1]-locusY)*8,-.25,.25);
  return {xyz:normalized,xy,cct,tint,linearRgb:xyzToRgb(normalized)};
}

/** Integrate a sampled spectral power distribution through the CIE 1931 observer. */
export function integrateSpectralIlluminant(sample:(wavelengthNm:number)=>number):SpectralIlluminant{
  let x=0,y=0,z=0;
  for(let wavelength=380;wavelength<=780;wavelength+=10){
    const power=Math.max(0,sample(wavelength));
    const [cx,cy,cz]=cie1931(wavelength);
    x+=power*cx;y+=power*cy;z+=power*cz;
  }
  return finishIlluminant([x,y,z]);
}

export function calculateSpectralIlluminants(
  elevationDeg:number,
  irradiance:ClearSkyIrradiance,
  profile:AtmosphereProfile,
):{sun:SpectralIlluminant;sky:SpectralIlluminant}{
  let sunX=0,sunY=0,sunZ=0,skyX=0,skyY=0,skyZ=0;
  // Continue the long slant path smoothly below the geometric horizon for
  // twilight chromaticity. Bird broadband energy remains zero there.
  const m=elevationDeg>0?Math.max(1,irradiance.opticalAirMass):Math.min(80,38+Math.max(0,-elevationDeg)*2.5);
  const pressure=Math.max(.4,profile.pressureHpa/1013.25*pressureAtAltitude(profile.altitudeM)/1013.25);
  for(let wavelength=380;wavelength<=780;wavelength+=10){
    const um=wavelength/1000,solar=solarBlackbody(wavelength)/1e29;
    const rayleighTau=.008735*Math.pow(um,-4.08)*pressure;
    const aerosolTau=profile.aerosolOpticalDepth500*Math.pow(um/.5,-profile.angstromExponent);
    const ozoneTau=profile.ozoneAtmCm/.30*(.0035*gaussian(wavelength,600,85)+.0008*gaussian(wavelength,450,40));
    const waterTau=profile.precipitableWaterCm/1.5*(.008*gaussian(wavelength,720,35)+.003*gaussian(wavelength,650,45));
    const directT=Math.exp(-m*(rayleighTau+aerosolTau+ozoneTau+waterTau));
    const rayleighScatter=1-Math.exp(-Math.min(12,m)*rayleighTau);
    const aerosolScatter=1-Math.exp(-Math.min(12,m)*aerosolTau*.82);
    const twilightBoost=elevationDeg<0?Math.exp(Math.max(-18,elevationDeg)/7):1;
    const skySpectrum=solar*(.78*rayleighScatter+.22*aerosolScatter)*twilightBoost;
    const [cx,cy,cz]=cie1931(wavelength);
    sunX+=solar*directT*cx;sunY+=solar*directT*cy;sunZ+=solar*directT*cz;
    skyX+=skySpectrum*cx;skyY+=skySpectrum*cy;skyZ+=skySpectrum*cz;
  }
  return {sun:finishIlluminant([sunX,sunY,sunZ]),sky:finishIlluminant([skyX,skyY,skyZ])};
}
