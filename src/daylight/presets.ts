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
  { hour: 0, name: "Midnight", description: "Quiet cobalt ambience · protected practicals", exposure: -.16, temperature: -.20, tint: -.01, contrast: .08, saturation: -.10, vibrance: -.02, lift: [-.003,.001,.009], gamma: [.985,1.00,1.025], gain: [.98,1.00,1.035], shadows: [-.018,.010,.042], midtones: [-.012,.004,.024], highlights: [.012,.004,-.006], blackPoint: .012, highlightRolloff: .25, clarity: .01, filmStrength: .72 },
  { hour: 3, name: "Deep Night", description: "Cool air · dense, readable shadows", exposure: -.20, temperature: -.25, tint: -.015, contrast: .10, saturation: -.15, vibrance: -.04, lift: [-.002,.003,.012], gamma: [.975,.995,1.035], gain: [.98,1.00,1.045], shadows: [-.024,.014,.052], midtones: [-.016,.006,.028], highlights: [.018,.006,-.008], blackPoint: .014, highlightRolloff: .30, clarity: .005, filmStrength: .78 },
  { hour: 5, name: "Pre-dawn", description: "Blue-hour haze · soft atmospheric blacks", exposure: -.12, temperature: -.30, tint: .005, contrast: -.02, saturation: -.09, vibrance: .00, lift: [.004,.010,.020], gamma: [.98,1.00,1.03], gain: [.985,1.00,1.04], shadows: [-.018,.018,.060], midtones: [-.012,.012,.040], highlights: [.012,.006,.004], blackPoint: -.008, highlightRolloff: .20, clarity: -.02, filmStrength: .60 },
  { hour: 6, name: "Dawn", description: "Cool atmosphere · first warm light", exposure: -.04, temperature: -.10, tint: .018, contrast: -.01, saturation: -.02, vibrance: .035, lift: [.002,.006,.012], gamma: [.995,1.00,1.012], gain: [1.025,1.005,.985], shadows: [-.014,.012,.034], midtones: [.014,.004,-.008], highlights: [.052,.020,-.020], blackPoint: -.004, highlightRolloff: .23, clarity: -.01, filmStrength: .58 },
  { hour: 7, name: "Early Sunrise", description: "Apricot highlights · cool shadow separation", exposure: .03, temperature: .28, tint: .025, contrast: .025, saturation: .035, vibrance: .055, lift: [-.002,.004,.010], gamma: [1.012,1.00,.988], gain: [1.055,1.018,.965], shadows: [-.012,.010,.028], midtones: [.028,.008,-.015], highlights: [.078,.030,-.030], blackPoint: .002, highlightRolloff: .30, clarity: .00, filmStrength: .66 },
  { hour: 8, name: "Morning", description: "Clean whites · fresh, open midtones", exposure: .08, temperature: .12, tint: .005, contrast: .035, saturation: .045, vibrance: .045, lift: [0,.001,.002], gamma: [1.006,1.00,.994], gain: [1.022,1.008,.988], shadows: [-.004,.005,.010], midtones: [.010,.004,-.004], highlights: [.026,.012,-.008], blackPoint: .001, highlightRolloff: .22, clarity: .025, filmStrength: .45 },
  { hour: 10, name: "Late Morning", description: "Neutral daylight · natural color separation", exposure: .10, temperature: .035, tint: 0, contrast: .055, saturation: .035, vibrance: .035, lift: [0,0,0], gamma: [1.002,1.00,.998], gain: [1.008,1.004,.996], shadows: [-.002,.002,.004], midtones: [.003,.002,0], highlights: [.010,.006,-.002], blackPoint: .004, highlightRolloff: .27, clarity: .045, filmStrength: .40 },
  { hour: 12, name: "Solar Noon", description: "Crisp neutrality · controlled specular detail", exposure: .08, temperature: 0, tint: -.004, contrast: .07, saturation: .015, vibrance: .025, lift: [-.001,0,.001], gamma: [1,1,1], gain: [1.002,1.002,1.00], shadows: [-.002,.002,.004], midtones: [0,0,0], highlights: [.003,.004,.003], blackPoint: .006, highlightRolloff: .34, clarity: .065, filmStrength: .42 },
  { hour: 14, name: "Early Afternoon", description: "Clear light · gently softened highs", exposure: .06, temperature: .045, tint: -.002, contrast: .06, saturation: .025, vibrance: .03, lift: [0,0,.001], gamma: [1.003,1,.997], gain: [1.012,1.005,.991], shadows: [-.002,.003,.006], midtones: [.005,.003,-.002], highlights: [.015,.008,-.005], blackPoint: .005, highlightRolloff: .36, clarity: .05, filmStrength: .46 },
  { hour: 16, name: "Late Afternoon", description: "Richer midtones · lengthening warm light", exposure: .035, temperature: .17, tint: .006, contrast: .045, saturation: .045, vibrance: .045, lift: [-.001,.001,.005], gamma: [1.008,1,.991], gain: [1.032,1.010,.977], shadows: [-.006,.006,.016], midtones: [.018,.007,-.009], highlights: [.038,.016,-.014], blackPoint: .004, highlightRolloff: .40, clarity: .025, filmStrength: .54 },
  { hour: 17.5, name: "Golden Hour", description: "Amber density · cool, open shadows", exposure: .015, temperature: .38, tint: .016, contrast: .035, saturation: .07, vibrance: .065, lift: [-.003,.003,.010], gamma: [1.015,1,.982], gain: [1.066,1.022,.950], shadows: [-.014,.009,.026], midtones: [.032,.010,-.016], highlights: [.082,.034,-.034], blackPoint: .002, highlightRolloff: .52, clarity: .005, filmStrength: .74 },
  { hour: 18.5, name: "Sunset", description: "Burnished warmth · preserved horizon color", exposure: -.06, temperature: .44, tint: .035, contrast: .025, saturation: .055, vibrance: .07, lift: [-.002,.003,.010], gamma: [1.018,1,.978], gain: [1.070,1.012,.945], shadows: [-.015,.010,.030], midtones: [.042,.006,-.022], highlights: [.092,.022,-.042], blackPoint: .003, highlightRolloff: .58, clarity: -.01, filmStrength: .80 },
  { hour: 19.5, name: "Evening Blue Hour", description: "Cyan ambience · a trace of warmth in lights", exposure: -.13, temperature: -.25, tint: .012, contrast: .025, saturation: -.075, vibrance: .015, lift: [.002,.007,.014], gamma: [.982,1,1.025], gain: [.995,1.00,1.025], shadows: [-.020,.016,.052], midtones: [-.012,.012,.036], highlights: [.032,.012,-.010], blackPoint: -.003, highlightRolloff: .46, clarity: -.015, filmStrength: .74 },
  { hour: 21, name: "Night", description: "Cool environment · luminous highlights", exposure: -.17, temperature: -.23, tint: -.008, contrast: .08, saturation: -.12, vibrance: -.025, lift: [-.002,.003,.010], gamma: [.978,.998,1.030], gain: [.985,1.00,1.038], shadows: [-.022,.014,.050], midtones: [-.014,.008,.030], highlights: [.022,.008,-.008], blackPoint: .011, highlightRolloff: .40, clarity: .005, filmStrength: .82 },
  { hour: 23, name: "Late Night", description: "Dense navy shadows · quiet filmic color", exposure: -.18, temperature: -.21, tint: -.012, contrast: .095, saturation: -.13, vibrance: -.035, lift: [-.003,.002,.010], gamma: [.98,.998,1.028], gain: [.985,1.00,1.038], shadows: [-.020,.012,.046], midtones: [-.014,.006,.028], highlights: [.018,.006,-.006], blackPoint: .013, highlightRolloff: .34, clarity: .005, filmStrength: .80 },
  { hour: 24, name: "Midnight", description: "Quiet cobalt ambience · protected practicals", exposure: -.16, temperature: -.20, tint: -.01, contrast: .08, saturation: -.10, vibrance: -.02, lift: [-.003,.001,.009], gamma: [.985,1.00,1.025], gain: [.98,1.00,1.035], shadows: [-.018,.010,.042], midtones: [-.012,.004,.024], highlights: [.012,.004,-.006], blackPoint: .012, highlightRolloff: .25, clarity: .01, filmStrength: .72 },
];
