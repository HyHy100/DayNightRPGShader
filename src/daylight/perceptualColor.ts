export type Vec3=[number,number,number];
const linear=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const gamma=(x:number)=>x<=.0031308?12.92*x:1.055*Math.max(0,x)**(1/2.4)-.055;
export function rgbToOklab(rgb:Vec3):Vec3{const r=linear(rgb[0]),g=linear(rgb[1]),b=linear(rgb[2]);const l=Math.cbrt(.412221*r+.536333*g+.051446*b),m=Math.cbrt(.211904*r+.680700*g+.107396*b),s=Math.cbrt(.088302*r+.281719*g+.629979*b);return [.210454*l+.793618*m-.004072*s,1.977998*l-2.428592*m+.450594*s,.025904*l+.782772*m-.808676*s];}
export function oklabToRgb(lab:Vec3):Vec3{const l=(lab[0]+.396338*lab[1]+.215804*lab[2])**3,m=(lab[0]-.105561*lab[1]-.063854*lab[2])**3,s=(lab[0]-.089484*lab[1]-1.291486*lab[2])**3;return [gamma(4.076742*l-3.307712*m+.230970*s),gamma(-1.268438*l+2.609758*m-.341319*s),gamma(-.004196*l-.703419*m+1.707615*s)];}
export function mixOklab(a:Vec3,b:Vec3,t:number):Vec3{const x=rgbToOklab(a),y=rgbToOklab(b);return oklabToRgb([x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t]);}
export const rgbOffset=(rgb:Vec3,scale:number):Vec3=>{const mean=(rgb[0]+rgb[1]+rgb[2])/3;return [(rgb[0]-mean)*scale,(rgb[1]-mean)*scale,(rgb[2]-mean)*scale];};
