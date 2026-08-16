import assert from "node:assert/strict";
import test from "node:test";
import { calculateAirMass } from "../src/daylight/atmosphereModel";
import { ATMOSPHERE_PRESETS,calculateClearSkyIrradiance } from "../src/daylight/clearSkyModel";
import { daylightAt } from "../src/daylight/daylightModel";
import { calculateLunarPosition } from "../src/daylight/lunarPosition";
import { calculateMoonlight,calculateStoryMoonlight,UNAVAILABLE_MOONLIGHT } from "../src/daylight/moonlightModel";
import { calculateSolarPosition } from "../src/daylight/solarPosition";
import { exportFilename,exportFrameCount,exportFrameProgress,getExportDimensions,sampleDayCycleTimeline } from "../src/export/videoExportModel";
import { extractWebMVideoFrames,muxWebM } from "../src/export/webmMuxer";

test("video export muxes one finite timestamped WebM timeline for Linux players",async()=>{
  const blob=muxWebM({width:1280,height:720,frameRate:30,durationUs:15_000_000,codec:"vp9",chunks:[
    {timestamp:0,duration:33_333,type:"key",data:new Uint8Array([1,2,3])},
    {timestamp:33_333,duration:33_334,type:"delta",data:new Uint8Array([4,5])},
  ]});
  const fixed=new Uint8Array(await blob.arrayBuffer());
  let duration=-1;
  for(let index=0;index<=fixed.length-11;index++)if(fixed[index]===0x44&&fixed[index+1]===0x89&&fixed[index+2]===0x88)duration=new DataView(fixed.buffer,fixed.byteOffset+index+3,8).getFloat64(0,false);
  assert.equal(duration,15_000);
  assert.equal(blob.type,"video/webm;codecs=vp9");
  assert.deepEqual([...fixed.subarray(0,4)],[0x1a,0x45,0xdf,0xa3]);
  const extracted=await extractWebMVideoFrames(blob);
  assert.deepEqual(extracted.map(frame=>frame.type),["key","delta"]);
  assert.deepEqual([...extracted[0].data],[1,2,3]);
});

test("video export maps one chronological local day without quantization",()=>{
  const base=new Date(2026,7,16,12),start=sampleDayCycleTimeline(base,0),quarter=sampleDayCycleTimeline(base,.25),end=sampleDayCycleTimeline(base,1);
  assert.equal(start.hour,0);assert.equal(quarter.hour,6);assert.equal(end.hour,0);
  assert.equal(start.date.getDate(),16);assert.equal(end.date.getDate(),17);
  let previous=start.date.getTime();
  for(let frame=1;frame<=450;frame++){const sample=sampleDayCycleTimeline(base,frame/450);assert.ok(sample.date.getTime()>previous);previous=sample.date.getTime();}
});

test("video export uses stable dimensions and output metadata",()=>{
  assert.deepEqual(getExportDimensions("1080p"),{width:1920,height:1080});assert.deepEqual(getExportDimensions("720p"),{width:1280,height:720});
  assert.equal(exportFilename(new Date(2026,7,16),"comparison"),"daylight-cycle-2026-08-16-comparison.webm");
});

test("video export samples every frame deterministically instead of wall-clock skipping",()=>{
  const total=exportFrameCount(15,30);assert.equal(total,450);
  const progress=Array.from({length:total},(_,index)=>exportFrameProgress(index,total));
  assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
  for(let i=1;i<progress.length;i++)assert.ok(progress[i]>progress[i-1]);
  const phases=new Set(progress.map(value=>daylightAt(sampleDayCycleTimeline(new Date(2026,7,16),value).hour).grade.name));
  for(const phase of ["Pre-dawn Night","Astronomical Twilight","Nautical Twilight","Civil Twilight","Early Sunrise"])assert.ok(phases.has(phase),`${phase} must receive recorded frames`);
});

test("the 24-hour physical model closes seamlessly",()=>{
  const a=daylightAt(0),b=daylightAt(24);
  for(const key of ["exposure","temperature","tint","contrast","saturation","vibrance","blackPoint","highlightRolloff","clarity","filmStrength","bloomStrength","bloomThreshold","bloomKnee","halationStrength","glareStrength","moonGlowStrength"] as const) assert.ok(Math.abs(a.grade[key]-b.grade[key])<1e-10,key);
});

test("all grading derivatives remain bounded at minute resolution",()=>{
  let previous=daylightAt(0).grade;
  const limits={exposure:.04,temperature:.04,contrast:.025,saturation:.025,highlightRolloff:.025,bloomStrength:.025,bloomThreshold:.025,bloomKnee:.025,halationStrength:.025,glareStrength:.025,moonGlowStrength:.025};
  for(let minute=1;minute<=1440;minute++){
    const current=daylightAt(minute/60).grade;
    for(const key of Object.keys(limits) as (keyof typeof limits)[]) assert.ok(Math.abs(current[key]-previous[key])<limits[key],`${key} discontinuity at minute ${minute}`);
    previous=current;
  }
});

test("optical response emerges at low sun and remains restrained at night",()=>{
  const moonless={illuminatedFraction:.001,transitHour:0,maximumElevation:68,waxing:true};
  const noon=daylightAt(12.25).grade,golden=daylightAt(18.25).grade;
  const night=daylightAt(0,new Date(),null,ATMOSPHERE_PRESETS.Standard,moonless).grade;
  assert.ok(golden.halationStrength>noon.halationStrength+.03);
  assert.ok(golden.glareStrength>noon.glareStrength+.01);
  assert.ok(night.bloomThreshold>golden.bloomThreshold+.15);
  assert.ok(night.bloomStrength<noon.bloomStrength);
  assert.ok(golden.bloomThreshold<.15,"low-sun threshold must extract energy from dark story plates");
  assert.ok(golden.bloomStrength>.2,"full optical control must be visibly authorable");
});

test("the full Story Moon range drives useful adaptation and silver optical response",()=>{
  const config=(illuminatedFraction:number)=>({illuminatedFraction,transitHour:0,maximumElevation:68,waxing:true});
  const base=new Date("2026-08-16T12:00:00-03:00"),profile=ATMOSPHERE_PRESETS.Standard;
  const moonless=daylightAt(0,base,null,profile,config(.001)).grade;
  const quarter=daylightAt(0,base,null,profile,config(.25)).grade;
  const half=daylightAt(0,base,null,profile,config(.50)).grade;
  const full=daylightAt(0,base,null,profile,config(1)).grade;
  assert.ok(quarter.exposure>moonless.exposure+1.1,"quarter Moon must be visibly useful in Story Sky");
  assert.ok(half.exposure>quarter.exposure+.25,"quarter-to-half Moon must retain meaningful exposure range");
  assert.ok(full.exposure>half.exposure+.7,"half-to-full Moon must retain meaningful exposure range");
  assert.ok(half.moonGlowStrength>.4,"half Moon should already drive a usable silver optical response");
  assert.ok(full.moonGlowStrength>.5,"full Story Moon should drive a visible silver optical response");
  assert.ok(full.bloomThreshold<.08,"full-Moon extraction must reach highlights in dark story plates");
  let previous=moonless;
  for(let percent=1;percent<=100;percent++){
    const current=daylightAt(0,base,null,profile,config(percent/100)).grade;
    assert.ok(current.exposure>=previous.exposure-.001,`Moon exposure must rise monotonically at ${percent}%`);
    assert.ok(current.exposure-previous.exposure<.12,`Moon exposure step is too large at ${percent}%`);
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
  const sunrise=daylightAt(6.25),morning=daylightAt(7.25),noon=daylightAt(12.25),afternoon=daylightAt(16.25),golden=daylightAt(18.25);
  assert.ok(sunrise.grade.highlights[0]>morning.grade.highlights[0]+.006);
  assert.ok(sunrise.atmosphere.spectralSeparation>morning.atmosphere.spectralSeparation+.1);
  assert.ok(noon.grade.clarity>morning.grade.clarity);
  assert.ok(afternoon.grade.temperature>noon.grade.temperature+.04);
  assert.ok(golden.grade.temperature>afternoon.grade.temperature+.15);
  assert.ok(golden.atmosphere.lowSunFactor>.4);
});

test("the full sun-above-horizon arc keeps evolving photographically",()=>{
  const earlyMorning=daylightAt(7).grade,lateMorning=daylightAt(10).grade,noon=daylightAt(12.25).grade;
  const earlyAfternoon=daylightAt(14.5).grade,lateAfternoon=daylightAt(17.25).grade;
  assert.ok(earlyMorning.temperature>lateMorning.temperature+.10,"early morning should retain low-angle warmth");
  assert.ok(noon.exposure>lateMorning.exposure+.04,"solar noon should have a brighter upper-mid exposure");
  assert.ok(noon.contrast>lateMorning.contrast+.015,"solar noon should read cleaner and crisper");
  assert.ok(earlyAfternoon.temperature>noon.temperature+.05,"warmth must start rebuilding before late afternoon");
  assert.ok(lateAfternoon.temperature>earlyAfternoon.temperature+.18,"late afternoon should clearly approach low-sun warmth");
  assert.ok(lateAfternoon.saturation>earlyAfternoon.saturation+.04,"late-afternoon midtones should become richer gradually");
  assert.ok(noon.exposure>earlyAfternoon.exposure+.06,"afternoon density must begin evolving before golden hour");
});

test("horizon lighting survives the irradiance fade and remains asymmetric",()=>{
  const dawn=daylightAt(6),sunrise=daylightAt(6.25),sunset=daylightAt(18.25),horizon=daylightAt(18.625),afterglow=daylightAt(18.75);
  assert.ok(dawn.atmosphere.lowSunFactor>.2,"dawn color must not vanish with broadband beam energy");
  assert.ok(horizon.atmosphere.lowSunFactor>.4,"sunset color must survive the horizon irradiance ramp");
  assert.ok(sunrise.grade.highlights[0]>.015);
  assert.ok(sunset.grade.highlights[0]>sunrise.grade.highlights[0]+.015,"evening should be richer than morning");
  assert.ok(afterglow.atmosphere.lowSunFactor>.1,"warm horizon must persist into civil twilight");
  assert.ok(sunset.grade.temperature>sunrise.grade.temperature+.15);
  assert.ok(sunset.grade.midtones[0]>sunrise.grade.midtones[0]+.012,"golden sunset must reach upper midtones, not only highlights");
  assert.ok(sunset.grade.exposure>sunrise.grade.exposure,"story sunset should retain luminous photographic presence");
});

test("twilight exposure darkens monotonically below daytime",()=>{
  const moonless={illuminatedFraction:.001,transitHour:0,maximumElevation:68,waxing:true},base=new Date("2026-08-16T12:00:00-03:00");
  const nearest=(target:number)=>{let best=daylightAt(0,base,null,ATMOSPHERE_PRESETS.Standard,moonless),error=Infinity;for(let minute=0;minute<1440;minute++){const state=daylightAt(minute/60,base,null,ATMOSPHERE_PRESETS.Standard,moonless),next=Math.abs(state.atmosphere.geometricElevation-target);if(next<error){best=state;error=next;}}return best.grade;};
  const noon=nearest(60),civil=nearest(-3),nautical=nearest(-9),astronomical=nearest(-15),night=nearest(-21);
  assert.ok(noon.exposure>civil.exposure+.3);
  assert.ok(civil.exposure>nautical.exposure+.3);
  assert.ok(nautical.exposure>astronomical.exposure+.5);
  assert.ok(astronomical.exposure>night.exposure);
  for(const grade of [noon,civil,nautical,astronomical,night])assert.ok(grade.blackPoint>=0,"twilight toe must not lift the black point");
});

test("a full Story Moon hands twilight into night without a dark evening valley",()=>{
  let previous=daylightAt(18.6).grade.exposure;
  for(let minute=Math.ceil(18.6*60)+1;minute<=Math.floor(19.35*60);minute++){
    const state=daylightAt(minute/60),current=state.grade.exposure;
    assert.ok(current<=previous+.002,`early twilight exposure brightened at ${minute} minutes: ${previous} -> ${current}`);
    previous=current;
  }
  const civil=daylightAt(18.9).grade,nautical=daylightAt(19.4).grade,astronomical=daylightAt(19.9).grade;
  assert.ok(civil.exposure>nautical.exposure+.2);
  assert.ok(astronomical.exposure>nautical.exposure,"a bright rising Moon should overtake the fading sky during astronomical twilight");
  const midnight=daylightAt(0).grade.exposure,lateTwilight=[];
  for(let minute=Math.ceil(19.4*60);minute<=22*60;minute++)lateTwilight.push(daylightAt(minute/60).grade.exposure);
  assert.ok(Math.min(...lateTwilight)>midnight-.75,"rising Moon must prevent a deep post-twilight exposure valley");
  for(let i=1;i<lateTwilight.length;i++)assert.ok(Math.abs(lateTwilight[i]-lateTwilight[i-1])<.025,`Moonrise handoff jumped at sample ${i}`);
  const nauticalStart=daylightAt(19.15).grade,nauticalEnd=daylightAt(19.6).grade;
  assert.ok(nauticalEnd.lift[1]<=nauticalStart.lift[1]+.0002,"lunar toe adaptation must not lift nautical twilight");
  assert.ok(nauticalEnd.blackPoint>=nauticalStart.blackPoint-.0005,"lunar black-point opening must wait until astronomical twilight");
});

test("a high Story Moon hands off smoothly into astronomical dawn",()=>{
  const base=new Date("2026-08-16T12:00:00-03:00"),moon=(illuminatedFraction:number)=>({illuminatedFraction,transitHour:0,maximumElevation:68,waxing:true});
  for(const illumination of [.5,.8,1]){
    const samples=[];
    for(let minute=4*60;minute<=6*60;minute+=5)samples.push(daylightAt(minute/60,base,null,ATMOSPHERE_PRESETS.Standard,moon(illumination)).grade.exposure);
    const allowedDip=illumination===.5?.018:.012;
    for(let i=1;i<samples.length;i++)assert.ok(samples[i]>=samples[i-1]-allowedDip,`${illumination*100}% Moon dawn exposure reversed at sample ${i}`);
  }
  const fullMoon=moon(1),moonless=moon(.001);
  assert.ok(daylightAt(4.5,base,null,ATMOSPHERE_PRESETS.Standard,fullMoon).grade.exposure>daylightAt(4.5,base,null,ATMOSPHERE_PRESETS.Standard,moonless).grade.exposure+.7);
});

test("true night evolves through afterglow, story moon, and pre-dawn",()=>{
  const evening=daylightAt(20.25),late=daylightAt(22),midnight=daylightAt(0),preDawn=daylightAt(4);
  const moonless={illuminatedFraction:.001,transitHour:0,maximumElevation:68,waxing:true};
  const moonlessEvening=daylightAt(20.25,new Date(),null,ATMOSPHERE_PRESETS.Standard,moonless);
  const moonlessLate=daylightAt(22,new Date(),null,ATMOSPHERE_PRESETS.Standard,moonless);
  assert.equal(evening.grade.name,"Moonrise Transition");
  assert.equal(late.grade.name,"Moonlit Night");
  assert.equal(midnight.grade.name,"Moonlit Night");
  assert.equal(preDawn.grade.name,"Pre-dawn Night");
  assert.ok(evening.atmosphere.eveningAfterglow>.7);
  assert.ok(midnight.atmosphere.midnightDepth>.95);
  assert.ok(preDawn.atmosphere.preDawnAirglow>.7);
  assert.ok(midnight.atmosphere.moonlightContribution>late.atmosphere.moonlightContribution);
  assert.ok(moonlessEvening.grade.exposure>moonlessLate.grade.exposure+.1,"residual afterglow should fade into the moonless night baseline");
  assert.ok(midnight.atmosphere.moonlightContribution>late.atmosphere.moonlightContribution+.03);
  assert.ok(late.atmosphere.moonlightContribution>preDawn.atmosphere.moonlightContribution+.1);
  assert.ok(midnight.atmosphere.nightProgress>late.atmosphere.nightProgress);
  assert.ok(preDawn.atmosphere.nightProgress>midnight.atmosphere.nightProgress);
});

test("Story Sky solar timing comes from one coherent temperate geometry",()=>{
  const noon=daylightAt(12.25).atmosphere,events=noon.events;
  assert.ok(Math.abs(noon.geometricElevation-63)<.1,"noon altitude must match latitude minus declination");
  assert.ok(events.sunrise!==null&&events.sunset!==null&&events.civilDawn!==null&&events.civilDusk!==null);
  assert.ok(events.sunrise!>5.6&&events.sunrise!<5.9);
  assert.ok(events.sunset!>18.6&&events.sunset!<18.9);
  assert.ok(events.civilDawn!<events.sunrise!&&events.civilDusk!>events.sunset!);
  let goldenMinutes=0,largestElevationStep=0,previous=daylightAt(0).atmosphere.geometricElevation;
  for(let minute=1;minute<=1440;minute++){
    const state=daylightAt(minute/60);
    if(state.grade.name==="Golden Sunset")goldenMinutes++;
    largestElevationStep=Math.max(largestElevationStep,Math.abs(state.atmosphere.geometricElevation-previous));
    previous=state.atmosphere.geometricElevation;
  }
  assert.ok(goldenMinutes>=55&&goldenMinutes<=70,`expected a useful one-hour low-sun window, got ${goldenMinutes} minutes`);
  assert.ok(largestElevationStep<.25,"solar motion must remain smooth at minute resolution");
});

test("Kasten-Young air mass falls as solar elevation rises",()=>{
  assert.ok(calculateAirMass(2)>calculateAirMass(10));
  assert.ok(calculateAirMass(10)>calculateAirMass(45));
  assert.ok(calculateAirMass(45)>calculateAirMass(75));
});

test("Story Sky supplies an authorable Moon without device location",()=>{
  const profile=ATMOSPHERE_PRESETS.Standard;
  const bright=calculateStoryMoonlight(0,profile,{illuminatedFraction:.95,transitHour:0,maximumElevation:68,waxing:true});
  const dark=calculateStoryMoonlight(0,profile,{illuminatedFraction:.02,transitHour:0,maximumElevation:68,waxing:true});
  const below=calculateStoryMoonlight(12,profile,{illuminatedFraction:.95,transitHour:0,maximumElevation:68,waxing:true});
  assert.equal(bright.quality,"story-sky");assert.equal(bright.available,true);
  assert.ok((bright.position?.geometricElevation??0)>60);
  assert.ok(bright.groundIlluminanceLux>dark.groundIlluminanceLux*20);
  assert.equal(below.directIlluminanceLux,0);assert.equal(below.diffuseIlluminanceLux,0);
  const shifted=calculateStoryMoonlight(3,profile,{illuminatedFraction:.95,transitHour:3,maximumElevation:55,waxing:false});
  assert.ok(Math.abs((shifted.position?.geometricElevation??0)-55)<1e-10);
  assert.equal(shifted.position?.waxing,false);
  const fallback=daylightAt(0);
  assert.equal(fallback.atmosphere.moon.quality,"story-sky");
  assert.ok(fallback.atmosphere.moonlightContribution>.3);
});

test("Story Moon illumination uses the full authoring range without a full-Moon cliff",()=>{
  const profile=ATMOSPHERE_PRESETS.Standard;
  const intensity=(fraction:number)=>calculateStoryMoonlight(0,profile,{illuminatedFraction:fraction,transitHour:0,maximumElevation:68,waxing:true}).normalizedIntensity;
  const samples=[.01,.10,.25,.50,.75,.90,.95,.98,1].map(intensity);
  for(let i=1;i<samples.length;i++)assert.ok(samples[i]>samples[i-1],`phase response must rise at sample ${i}`);
  assert.ok(samples[3]-samples[2]>.08,"quarter-to-half Moon must have a useful visual range");
  assert.ok(samples[7]-samples[6]>.03,"95–98% must remain responsive");
  assert.ok(samples[8]-samples[7]<.15,"98–100% must not behave like a switch");
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

test("lunar ephemeris agrees with USNO navigation fixtures",()=>{
  const date=new Date("2026-08-16T21:00:00Z");
  const fixtures=[
    {location:{lat:-23.55,lon:-46.63},elevation:49.96,azimuth:283.46},
    {location:{lat:0,lon:0},elevation:3.69,azimuth:259.79},
    {location:{lat:40,lon:-74},elevation:38.54,azimuth:195.49},
  ];
  for(const fixture of fixtures){
    const moon=calculateLunarPosition(date,fixture.location);
    // USNO hc is geocentric; our observer-centered altitude includes parallax.
    // The one-degree allowance covers that distinction close to the horizon.
    assert.ok(Math.abs(moon.elevation-fixture.elevation)<1.05,`Moon elevation at ${fixture.location.lat},${fixture.location.lon}`);
    assert.ok(Math.abs(moon.azimuth-fixture.azimuth)<.7,`Moon azimuth at ${fixture.location.lat},${fixture.location.lon}`);
    assert.ok(Math.abs(moon.illuminatedFraction-.20)<.01);
  }
  const polar=calculateLunarPosition(date,{lat:70,lon:0});
  for(const value of [polar.elevation,polar.azimuth,polar.distanceKm,polar.phaseAngle,polar.illuminatedFraction])assert.ok(Number.isFinite(value));
});

test("moonlight is physical, phase ordered, and horizon gated",()=>{
  const location={lat:-23.55,lon:-46.63},profile=ATMOSPHERE_PRESETS.Standard;
  const newMoon=calculateMoonlight(new Date("2026-08-12T03:00:00Z"),location,profile);
  const crescent=calculateMoonlight(new Date("2026-08-16T03:00:00Z"),location,profile);
  const quarter=calculateMoonlight(new Date("2026-08-20T03:00:00Z"),location,profile);
  const fullMoon=calculateMoonlight(new Date("2026-08-28T03:00:00Z"),location,profile);
  assert.ok(fullMoon.topOfAtmosphereIlluminanceLux>quarter.topOfAtmosphereIlluminanceLux);
  assert.ok(quarter.topOfAtmosphereIlluminanceLux>crescent.topOfAtmosphereIlluminanceLux);
  assert.ok(crescent.topOfAtmosphereIlluminanceLux>newMoon.topOfAtmosphereIlluminanceLux);
  for(const state of [newMoon,crescent,quarter,fullMoon])for(const value of [state.groundIlluminanceLux,state.atmosphericTransmission,state.normalizedIntensity,...state.spectralIlluminant.xyz])assert.ok(Number.isFinite(value)&&value>=0);
  let below=fullMoon;
  for(let hour=0;hour<24;hour++){const state=calculateMoonlight(new Date(`2026-08-28T${String(hour).padStart(2,"0")}:00:00Z`),location,profile);if((state.position?.geometricElevation??0)<-.5){below=state;break;}}
  assert.equal(below.directIlluminanceLux,0);assert.equal(below.diffuseIlluminanceLux,0);
  assert.equal(UNAVAILABLE_MOONLIGHT.available,false);assert.equal(UNAVAILABLE_MOONLIGHT.normalizedIntensity,0);
});

test("haze increases lunar extinction and the grade stays restrained",()=>{
  const location={lat:-23.55,lon:-46.63},date=new Date("2026-08-28T03:00:00Z");
  const clean=calculateMoonlight(date,location,ATMOSPHERE_PRESETS.Clean),hazy=calculateMoonlight(date,location,ATMOSPHERE_PRESETS.Hazy);
  if((clean.position?.geometricElevation??0)>0){
    assert.ok(clean.atmosphericTransmission>hazy.atmosphericTransmission);
    assert.ok(clean.directIlluminanceLux>hazy.directIlluminanceLux);
  }
  const located=daylightAt(0,new Date("2026-08-28T12:00:00-03:00"),location);
  assert.ok(located.atmosphere.moonlightContribution>=0&&located.atmosphere.moonlightContribution<=1);
  assert.ok(located.grade.exposure<-.5,"moonlit night remains far below daylight exposure");
  assert.ok(Math.abs(located.grade.temperature)<.5,"moonlight does not create a global blue cast");
});

test("lunar motion and grading remain continuous across chronological midnight",()=>{
  const location={lat:-23.55,lon:-46.63},start=new Date("2026-08-27T23:58:00-03:00");
  let previous=calculateMoonlight(start,location,ATMOSPHERE_PRESETS.Standard);
  let previousGrade=daylightAt(23+58/60,start,location).grade;
  for(let seconds=10;seconds<=240;seconds+=10){
    const date=new Date(start.getTime()+seconds*1000),current=calculateMoonlight(date,location,ATMOSPHERE_PRESETS.Standard);
    assert.ok(Math.abs((current.position?.elevation??0)-(previous.position?.elevation??0))<.08,"Moon elevation derivative spike");
    assert.ok(Math.abs(current.groundIlluminanceLux-previous.groundIlluminanceLux)<.01,"moonlight derivative spike");
    const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600,currentGrade=daylightAt(hour,date,location).grade;
    assert.ok(Math.abs(currentGrade.exposure-previousGrade.exposure)<.02,"midnight exposure jump");
    assert.ok(Math.abs(currentGrade.temperature-previousGrade.temperature)<.02,"midnight temperature jump");
    previous=current;previousGrade=currentGrade;
  }
});
