const rad = Math.PI / 180;
const deg = 180 / Math.PI;

/** Lightweight NOAA-style solar elevation estimate; no network calls required. */
export function solarElevation(date: Date, latitude: number, longitude: number) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const hour = date.getHours() + date.getMinutes() / 60;
  const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
  const eqTime = 229.18 * (.000075 + .001868*Math.cos(gamma) - .032077*Math.sin(gamma) - .014615*Math.cos(2*gamma) - .040849*Math.sin(2*gamma));
  const decl = .006918 - .399912*Math.cos(gamma) + .070257*Math.sin(gamma) - .006758*Math.cos(2*gamma) + .000907*Math.sin(2*gamma) - .002697*Math.cos(3*gamma) + .00148*Math.sin(3*gamma);
  const timezoneHours = -date.getTimezoneOffset() / 60;
  const solarMinutes = hour * 60 + eqTime + 4 * longitude - 60 * timezoneHours;
  const hourAngle = (solarMinutes / 4 - 180) * rad;
  return Math.asin(Math.sin(latitude*rad)*Math.sin(decl) + Math.cos(latitude*rad)*Math.cos(decl)*Math.cos(hourAngle)) * deg;
}

/** Remaps seasonal solar elevation into the stable 24-hour artistic cycle. */
export function solarAwareArtisticHour(date: Date, latitude: number, longitude: number) {
  const elevation = solarElevation(date, latitude, longitude);
  const clock = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const evening = clock >= 12;
  if (elevation <= -12) return clock;
  if (elevation < -6) return evening ? 19.5 + (-(elevation + 6) / 6) * 1.5 : 5 + ((elevation + 12) / 6);
  if (elevation < 0) return evening ? 18.5 + (-elevation / 6) : 6 + ((elevation + 6) / 6);
  if (elevation < 8) return evening ? 17.5 + (8 - elevation) / 8 : 7 + elevation / 8;
  return evening ? 12 + Math.min(4, (90 - elevation) / 20) : 12 - Math.min(4, (90 - elevation) / 20);
}
