import { DAYLIGHT_PRESETS } from "./presets";
import { interpolateGrade } from "./interpolation";

export const localClockHours = (date = new Date()) => date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
export const daylightAt = (hour: number) => interpolateGrade(hour, DAYLIGHT_PRESETS);

export function formatTime(hourValue: number) {
  const total = Math.round((((hourValue % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
