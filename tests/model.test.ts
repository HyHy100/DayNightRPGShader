import assert from "node:assert/strict";
import test from "node:test";
import { calculateAirMass } from "../src/daylight/atmosphereModel";
import { ATMOSPHERE_PRESETS,calculateClearSkyIrradiance } from "../src/daylight/clearSkyModel";
import { daylightAt } from "../src/daylight/daylightModel";
import { calculateSolarPosition } from "../src/daylight/solarPosition";

test("the 24-hour physical model closes seamlessly",()=>{
  const a=daylightAt(0),b=daylightAt(24);
  for(const key of ["exposure","temperature","tint","contrast","saturation","vibrance","blackPoint","highlightRolloff","clarity","filmStrength"] as const) assert.ok(Math.abs(a.grade[key]-b.grade[key])<1e-10,key);
});

test("all grading derivatives remain bounded at minute resolution",()=>{
  let previous=daylightAt(0).grade;
  const limits={exposure:.04,temperature:.04,contrast:.025,saturation:.025,highlightRolloff:.025};
  for(let minute=1;minute<=1440;minute++){
    const current=daylightAt(minute/60).grade;
    for(const key of Object.keys(limits) as (keyof typeof limits)[]) assert.ok(Math.abs(current[key]-previous[key])<limits[key],`${key} discontinuity at minute ${minute}`);
    previous=current;
  }
});

test("atmospheric influences are smooth and playback is not minute-quantized",()=>{
  const limits={sunIntensity:.12,skyIrradiance:.12,rayleigh:.12,mie:.12,haze:.08,lowSunFactor:.18,spectralSeparation:.18,twilight:.05,night:.04};
  let previous=daylightAt(0).atmosphere;
  for(let minute=1;minute<=1440;minute++){
    const current=daylightAt(minute/60).atmosphere;
    for(const key of Object.keys(limits) as (keyof typeof limits)[]) assert.ok(Math.abs(current[key]-previous[key])<limits[key],`${key} spike at minute ${minute}`);
    previous=current;
  }
  assert.notEqual(daylightAt(6.5001).atmosphere.elevation,daylightAt(6.5).atmosphere.elevation);
});

test("daylight stages are meaningfully distinct without preset tables",()=>{
  const sunrise=daylightAt(7),morning=daylightAt(8),noon=daylightAt(12),afternoon=daylightAt(16),golden=daylightAt(17);
  assert.ok(sunrise.grade.highlights[0]>morning.grade.highlights[0]+.006);
  assert.ok(sunrise.atmosphere.spectralSeparation>morning.atmosphere.spectralSeparation+.1);
  assert.ok(noon.grade.clarity>morning.grade.clarity);
  assert.ok(afternoon.grade.temperature>noon.grade.temperature+.04);
  assert.ok(golden.grade.temperature>afternoon.grade.temperature+.15);
  assert.ok(golden.atmosphere.lowSunFactor>.4);
});

test("twilight exposure darkens monotonically below daytime",()=>{
  const nearest=(target:number)=>{let best=daylightAt(0),error=Infinity;for(let minute=0;minute<1440;minute++){const state=daylightAt(minute/60),next=Math.abs(state.atmosphere.geometricElevation-target);if(next<error){best=state;error=next;}}return best.grade;};
  const noon=nearest(60),civil=nearest(-3),nautical=nearest(-9),astronomical=nearest(-15),night=nearest(-21);
  assert.ok(noon.exposure>civil.exposure+.3);
  assert.ok(civil.exposure>nautical.exposure+.3);
  assert.ok(nautical.exposure>astronomical.exposure+.6);
  assert.ok(astronomical.exposure>night.exposure);
  for(const grade of [noon,civil,nautical,astronomical,night])assert.ok(grade.blackPoint>=0,"twilight toe must not lift the black point");
});

test("true night evolves through afterglow, anti-solar midnight, and pre-dawn",()=>{
  const evening=daylightAt(19),late=daylightAt(21),midnight=daylightAt(0),preDawn=daylightAt(5);
  assert.equal(evening.grade.name,"Early Night");
  assert.equal(midnight.grade.name,"Deep Night");
  assert.equal(preDawn.grade.name,"Pre-dawn Night");
  assert.ok(evening.atmosphere.eveningAfterglow>.7);
  assert.ok(midnight.atmosphere.midnightDepth>.95);
  assert.ok(preDawn.atmosphere.preDawnAirglow>.7);
  assert.ok(evening.grade.exposure>late.grade.exposure+.15);
  assert.ok(preDawn.grade.exposure>midnight.grade.exposure+.2);
  assert.ok(midnight.atmosphere.nightProgress>late.atmosphere.nightProgress);
  assert.ok(preDawn.atmosphere.nightProgress>midnight.atmosphere.nightProgress);
});

test("Kasten-Young air mass falls as solar elevation rises",()=>{
  assert.ok(calculateAirMass(2)>calculateAirMass(10));
  assert.ok(calculateAirMass(10)>calculateAirMass(45));
  assert.ok(calculateAirMass(45)>calculateAirMass(75));
});

test("Bird-style clear-sky energy closes and remains physical",()=>{
  for(const elevation of [2,10,30,60,85]){
    const result=calculateClearSkyIrradiance(elevation,1,ATMOSPHERE_PRESETS.Standard);
    const horizontal=result.dni*Math.sin(elevation*Math.PI/180)+result.dhi;
    assert.ok(Math.abs(result.ghi-horizontal)<1e-8);
    assert.ok(result.dni>=0&&result.dhi>=0&&result.ghi>=0);
    assert.ok(result.dni<result.extraterrestrialNormal);
  }
  const night=calculateClearSkyIrradiance(-1,1,ATMOSPHERE_PRESETS.Standard);
  assert.equal(night.dni,0);assert.equal(night.dhi,0);assert.equal(night.ghi,0);
  const noon=calculateClearSkyIrradiance(60,1,ATMOSPHERE_PRESETS.Standard);
  assert.ok(noon.dni>750&&noon.dni<1050);
  assert.ok(noon.ghi>650&&noon.ghi<1100);
});

test("spectral illuminants warm at low sun and remain finite",()=>{
  const low=daylightAt(7),high=daylightAt(12);
  assert.ok(low.atmosphere.sunCCT<high.atmosphere.sunCCT);
  for(const state of [low.atmosphere,high.atmosphere])for(const value of [...state.sunIlluminant.xyz,...state.skyIlluminant.xyz,...state.sunIlluminant.xy,...state.skyIlluminant.xy])assert.ok(Number.isFinite(value));
});

test("located clear-sky quantities remain continuous at ten-second resolution",()=>{
  const base=new Date("2026-08-16T00:00:00-03:00");
  const location={lat:-23.55,lon:-46.63};
  let previous=daylightAt(0,base,location);
  for(let seconds=10;seconds<=86400;seconds+=10){
    const current=daylightAt(seconds/3600,base,location);
    assert.ok(Math.abs(current.atmosphere.irradiance.dni-previous.atmosphere.irradiance.dni)<4,"DNI derivative spike");
    assert.ok(Math.abs(current.atmosphere.irradiance.dhi-previous.atmosphere.irradiance.dhi)<1,"DHI derivative spike");
    assert.ok(Math.abs(current.atmosphere.irradiance.ghi-previous.atmosphere.irradiance.ghi)<1,"GHI derivative spike");
    assert.ok(Math.abs(current.atmosphere.sunCCT-previous.atmosphere.sunCCT)<15,"sun CCT derivative spike");
    // A 0.006 EV / 10 s bound is visually sub-threshold while allowing the
    // physically rapid but still smooth irradiance change at the horizon.
    assert.ok(Math.abs(current.grade.exposure-previous.grade.exposure)<.006,"exposure derivative spike");
    previous=current;
  }
});

test("astronomical solar position returns finite seasonal geometry",()=>{
  const solar=calculateSolarPosition(new Date("2026-08-16T12:00:00-03:00"),{lat:-23.55,lon:-46.63});
  for(const value of [solar.elevation,solar.azimuth,solar.declination,solar.equationOfTime,solar.events.sunrise,solar.events.sunset])assert.ok(Number.isFinite(value));
  assert.ok(solar.events.sunrise!==null&&solar.events.sunrise<solar.events.solarNoon);
  assert.ok(solar.events.sunset!==null&&solar.events.solarNoon<solar.events.sunset);
  assert.ok(Math.abs(solar.geometricElevation-52.76)<.15);
  const polarDay=calculateSolarPosition(new Date("2026-06-21T12:00:00Z"),{lat:75,lon:0});
  const polarNight=calculateSolarPosition(new Date("2026-12-21T12:00:00Z"),{lat:75,lon:0});
  assert.equal(polarDay.events.polarState,"polar-day");assert.equal(polarDay.events.sunrise,null);
  assert.equal(polarNight.events.polarState,"polar-night");assert.equal(polarNight.events.sunset,null);
});
