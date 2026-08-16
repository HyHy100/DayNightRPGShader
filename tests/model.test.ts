import assert from "node:assert/strict";
import test from "node:test";
import { calculateAirMass } from "../src/daylight/atmosphereModel";
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

test("daylight stages are meaningfully distinct without preset tables",()=>{
  const sunrise=daylightAt(6.5),morning=daylightAt(8),noon=daylightAt(12),afternoon=daylightAt(16),golden=daylightAt(17);
  assert.ok(sunrise.grade.highlights[0]>morning.grade.highlights[0]+.03);
  assert.ok(sunrise.grade.shadows[2]>morning.grade.shadows[2]+.05);
  assert.ok(noon.grade.clarity>morning.grade.clarity);
  assert.ok(afternoon.grade.temperature>noon.grade.temperature+.04);
  assert.ok(golden.grade.temperature>afternoon.grade.temperature+.15);
  assert.ok(golden.atmosphere.goldenHour>.7);
});

test("Kasten-Young air mass falls as solar elevation rises",()=>{
  assert.ok(calculateAirMass(2)>calculateAirMass(10));
  assert.ok(calculateAirMass(10)>calculateAirMass(45));
  assert.ok(calculateAirMass(45)>calculateAirMass(75));
});

test("astronomical solar position returns finite seasonal geometry",()=>{
  const solar=calculateSolarPosition(new Date("2026-08-16T12:00:00-03:00"),{lat:-23.55,lon:-46.63});
  for(const value of [solar.elevation,solar.azimuth,solar.declination,solar.equationOfTime,solar.events.sunrise,solar.events.sunset])assert.ok(Number.isFinite(value));
  assert.ok(solar.events.sunrise<solar.events.solarNoon);
  assert.ok(solar.events.solarNoon<solar.events.sunset);
});
