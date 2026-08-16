export type Vec3 = [number, number, number];

export interface GradePreset {
  hour: number;
  name: string;
  description: string;
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  lift: Vec3;
  gamma: Vec3;
  gain: Vec3;
  shadows: Vec3;
  midtones: Vec3;
  highlights: Vec3;
  blackPoint: number;
  highlightRolloff: number;
  clarity: number;
  filmStrength: number;
}

// Values are intentionally restrained. Chroma vectors are density offsets, not overlays.
export const DAYLIGHT_PRESETS: GradePreset[] = [
  { hour: 0, name: "Midnight", description: "Moonlit cobalt ambience · protected practicals", exposure: -1.10, temperature: -.34, tint: -.012, contrast: -.045, saturation: -.24, vibrance: -.08, lift: [.003,.008,.018], gamma: [.970,.995,1.040], gain: [.960,.995,1.045], shadows: [-.030,.020,.070], midtones: [-.022,.010,.042], highlights: [.012,.006,-.004], blackPoint: -.004, highlightRolloff: .55, clarity: -.03, filmStrength: .78 },
  { hour: 3, name: "Deep Night", description: "Low moonlight · dense, readable shadows", exposure: -1.25, temperature: -.38, tint: -.018, contrast: -.060, saturation: -.26, vibrance: -.09, lift: [.003,.009,.020], gamma: [.965,.992,1.045], gain: [.955,.992,1.050], shadows: [-.034,.022,.078], midtones: [-.026,.012,.048], highlights: [.014,.007,-.004], blackPoint: -.005, highlightRolloff: .60, clarity: -.035, filmStrength: .82 },
  { hour: 5, name: "Pre-dawn", description: "Blue-hour haze · soft atmospheric blacks", exposure: -.75, temperature: -.34, tint: .002, contrast: -.050, saturation: -.18, vibrance: -.04, lift: [.005,.011,.022], gamma: [.975,.997,1.038], gain: [.970,.998,1.045], shadows: [-.026,.020,.070], midtones: [-.018,.014,.046], highlights: [.012,.007,.004], blackPoint: -.008, highlightRolloff: .48, clarity: -.03, filmStrength: .68 },
  { hour: 6, name: "Dawn", description: "Cool atmosphere · first warm light", exposure: -.30, temperature: -.14, tint: .016, contrast: -.025, saturation: -.07, vibrance: .015, lift: [.003,.007,.014], gamma: [.990,1.00,1.018], gain: [1.015,1.004,.990], shadows: [-.018,.014,.042], midtones: [.010,.005,-.004], highlights: [.045,.020,-.016], blackPoint: -.006, highlightRolloff: .34, clarity: -.015, filmStrength: .60 },
  { hour: 7, name: "Early Sunrise", description: "Apricot highlights · cool shadow separation", exposure: .03, temperature: .28, tint: .025, contrast: .025, saturation: .035, vibrance: .055, lift: [-.002,.004,.010], gamma: [1.012,1.00,.988], gain: [1.055,1.018,.965], shadows: [-.012,.010,.028], midtones: [.028,.008,-.015], highlights: [.078,.030,-.030], blackPoint: .002, highlightRolloff: .30, clarity: .00, filmStrength: .66 },
  { hour: 8, name: "Morning", description: "Clean whites · fresh, open midtones", exposure: .08, temperature: .12, tint: .005, contrast: .035, saturation: .045, vibrance: .045, lift: [0,.001,.002], gamma: [1.006,1.00,.994], gain: [1.022,1.008,.988], shadows: [-.004,.005,.010], midtones: [.010,.004,-.004], highlights: [.026,.012,-.008], blackPoint: .001, highlightRolloff: .22, clarity: .025, filmStrength: .45 },
  { hour: 10, name: "Late Morning", description: "Neutral daylight · natural color separation", exposure: .10, temperature: .035, tint: 0, contrast: .055, saturation: .035, vibrance: .035, lift: [0,0,0], gamma: [1.002,1.00,.998], gain: [1.008,1.004,.996], shadows: [-.002,.002,.004], midtones: [.003,.002,0], highlights: [.010,.006,-.002], blackPoint: .004, highlightRolloff: .27, clarity: .045, filmStrength: .40 },
  { hour: 12, name: "Solar Noon", description: "Crisp neutrality · controlled specular detail", exposure: .08, temperature: 0, tint: -.004, contrast: .07, saturation: .015, vibrance: .025, lift: [-.001,0,.001], gamma: [1,1,1], gain: [1.002,1.002,1.00], shadows: [-.002,.002,.004], midtones: [0,0,0], highlights: [.003,.004,.003], blackPoint: .006, highlightRolloff: .34, clarity: .065, filmStrength: .42 },
  { hour: 14, name: "Early Afternoon", description: "Clear light · gently softened highs", exposure: .06, temperature: .045, tint: -.002, contrast: .06, saturation: .025, vibrance: .03, lift: [0,0,.001], gamma: [1.003,1,.997], gain: [1.012,1.005,.991], shadows: [-.002,.003,.006], midtones: [.005,.003,-.002], highlights: [.015,.008,-.005], blackPoint: .005, highlightRolloff: .36, clarity: .05, filmStrength: .46 },
  { hour: 16, name: "Late Afternoon", description: "Richer midtones · lengthening warm light", exposure: .035, temperature: .17, tint: .006, contrast: .045, saturation: .045, vibrance: .045, lift: [-.001,.001,.005], gamma: [1.008,1,.991], gain: [1.032,1.010,.977], shadows: [-.006,.006,.016], midtones: [.018,.007,-.009], highlights: [.038,.016,-.014], blackPoint: .004, highlightRolloff: .40, clarity: .025, filmStrength: .54 },
  { hour: 17.5, name: "Golden Hour", description: "Amber density · cool, open shadows", exposure: .015, temperature: .38, tint: .016, contrast: .035, saturation: .07, vibrance: .065, lift: [-.003,.003,.010], gamma: [1.015,1,.982], gain: [1.066,1.022,.950], shadows: [-.014,.009,.026], midtones: [.032,.010,-.016], highlights: [.082,.034,-.034], blackPoint: .002, highlightRolloff: .52, clarity: .005, filmStrength: .74 },
  { hour: 18.5, name: "Sunset", description: "Burnished warmth · preserved horizon color", exposure: -.06, temperature: .44, tint: .035, contrast: .025, saturation: .055, vibrance: .07, lift: [-.002,.003,.010], gamma: [1.018,1,.978], gain: [1.070,1.012,.945], shadows: [-.015,.010,.030], midtones: [.042,.006,-.022], highlights: [.092,.022,-.042], blackPoint: .003, highlightRolloff: .58, clarity: -.01, filmStrength: .80 },
  { hour: 19.5, name: "Evening Blue Hour", description: "Cyan ambience · a trace of warmth in lights", exposure: -.55, temperature: -.30, tint: .010, contrast: -.025, saturation: -.16, vibrance: -.02, lift: [.004,.009,.018], gamma: [.975,.997,1.035], gain: [.975,.998,1.040], shadows: [-.026,.020,.068], midtones: [-.018,.014,.044], highlights: [.028,.012,-.008], blackPoint: -.006, highlightRolloff: .54, clarity: -.025, filmStrength: .78 },
  { hour: 21, name: "Night", description: "Moonlit environment · luminous protected highlights", exposure: -.90, temperature: -.35, tint: -.010, contrast: -.050, saturation: -.22, vibrance: -.07, lift: [.003,.008,.019], gamma: [.968,.994,1.043], gain: [.960,.994,1.048], shadows: [-.032,.021,.076], midtones: [-.024,.012,.046], highlights: [.018,.008,-.005], blackPoint: -.005, highlightRolloff: .60, clarity: -.035, filmStrength: .84 },
  { hour: 23, name: "Late Night", description: "Dense navy ambience · quiet filmic moonlight", exposure: -1.05, temperature: -.36, tint: -.014, contrast: -.055, saturation: -.24, vibrance: -.08, lift: [.003,.008,.019], gamma: [.968,.993,1.043], gain: [.958,.993,1.048], shadows: [-.032,.021,.074], midtones: [-.024,.011,.045], highlights: [.014,.007,-.004], blackPoint: -.005, highlightRolloff: .58, clarity: -.035, filmStrength: .82 },
  { hour: 24, name: "Midnight", description: "Moonlit cobalt ambience · protected practicals", exposure: -1.10, temperature: -.34, tint: -.012, contrast: -.045, saturation: -.24, vibrance: -.08, lift: [.003,.008,.018], gamma: [.970,.995,1.040], gain: [.960,.995,1.045], shadows: [-.030,.020,.070], midtones: [-.022,.010,.042], highlights: [.012,.006,-.004], blackPoint: -.004, highlightRolloff: .55, clarity: -.03, filmStrength: .78 },
];
