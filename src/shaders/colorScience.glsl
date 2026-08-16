const vec3 REC709 = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 c) {
  bvec3 cutoff = lessThanEqual(c, vec3(0.04045));
  vec3 low = c / 12.92;
  vec3 high = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(high, low, vec3(cutoff));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  bvec3 cutoff = lessThanEqual(c, vec3(0.0031308));
  vec3 low = c * 12.92;
  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, vec3(cutoff));
}

float luminance(vec3 c) { return dot(c, REC709); }

// Bradford-derived adaptation approximation. Temperature is artistic mired delta.
vec3 chromaticAdaptation(vec3 color, float temperature, float tint) {
  vec3 lms = mat3(
    0.8951, -0.7502, 0.0389,
    0.2664,  1.7135, -0.0685,
   -0.1614,  0.0367, 1.0296
  ) * color;
  vec3 balance = exp(vec3(temperature * 0.105 + tint * 0.025,
                          tint * 0.070,
                         -temperature * 0.105 - tint * 0.025));
  lms *= balance;
  return mat3(
     0.986993, 0.432305, -0.008529,
    -0.147054, 0.518360,  0.040043,
     0.159963, 0.049291,  0.968487
  ) * lms;
}

vec3 softGamutCompress(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float luma = luminance(c);
  float excursion = max(mx - 1.0, max(-mn, 0.0));
  float compression = 1.0 / (1.0 + 1.8 * excursion);
  return mix(vec3(luma), c, compression);
}

vec3 applyVibrance(vec3 c, float saturation, float vibrance) {
  float luma = luminance(c);
  float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  float adaptive = saturation + vibrance * (1.0 - smoothstep(0.05, 0.55, chroma));
  // Protect common skin hue relationships from aggressive chroma expansion.
  float skin = smoothstep(0.02, 0.18, c.r - c.g) * smoothstep(0.22, 0.02, abs(c.g - c.b));
  adaptive *= mix(1.0, 0.72, skin * max(vibrance, 0.0));
  return mix(vec3(luma), c, 1.0 + adaptive);
}

vec3 filmicCurve(vec3 x, float shoulder) {
  // ACES-like rational curve with a tunable shoulder; normalized at reference white.
  float a = 2.15;
  float b = 0.03;
  float c = 2.08 + shoulder * 0.45;
  float d = 0.58 + shoulder * 0.18;
  float e = 0.14;
  vec3 y = (x * (a * x + b)) / (x * (c * x + d) + e);
  float pivot = (0.18 * (a * 0.18 + b)) / (0.18 * (c * 0.18 + d) + e);
  return y * (0.18 / pivot);
}

vec3 highlightDesaturate(vec3 c) {
  float y = luminance(c);
  float mask = smoothstep(0.72, 1.7, y);
  return mix(c, vec3(y), mask * 0.16);
}
