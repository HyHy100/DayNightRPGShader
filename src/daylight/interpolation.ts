import type { GradePreset, Vec3 } from "./presets";

export const wrap24 = (hour: number) => ((hour % 24) + 24) % 24;
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export interface InterpolatedGrade extends GradePreset {
  previousName: string;
  nextName: string;
  blend: number;
}

export function interpolateGrade(hourValue: number, anchors: GradePreset[]): InterpolatedGrade {
  const hour = wrap24(hourValue);
  let upper = anchors.findIndex((p) => p.hour > hour);
  if (upper < 1) upper = anchors.length - 1;
  const a = anchors[upper - 1];
  const b = anchors[upper];
  const rawT = (hour - a.hour) / Math.max(.0001, b.hour - a.hour);
  const t = smooth(Math.max(0, Math.min(1, rawT)));
  const scalarKeys: (keyof Pick<GradePreset, "exposure"|"temperature"|"tint"|"contrast"|"saturation"|"vibrance"|"blackPoint"|"highlightRolloff"|"clarity"|"filmStrength">)[] = ["exposure","temperature","tint","contrast","saturation","vibrance","blackPoint","highlightRolloff","clarity","filmStrength"];
  const out = { ...a } as InterpolatedGrade;
  for (const key of scalarKeys) (out[key] as number) = mix(a[key], b[key], t);
  out.lift = mix3(a.lift, b.lift, t);
  out.gamma = mix3(a.gamma, b.gamma, t);
  out.gain = mix3(a.gain, b.gain, t);
  out.shadows = mix3(a.shadows, b.shadows, t);
  out.midtones = mix3(a.midtones, b.midtones, t);
  out.highlights = mix3(a.highlights, b.highlights, t);
  out.hour = hour;
  out.name = rawT < .5 ? a.name : b.name;
  out.description = rawT < .5 ? a.description : b.description;
  out.previousName = a.name;
  out.nextName = b.name;
  out.blend = t;
  return out;
}
