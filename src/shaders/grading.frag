#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform sampler2D uFilmLut;
uniform float uExposure;
uniform float uTemperature;
uniform float uTint;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uShadows;
uniform vec3 uMidtones;
uniform vec3 uHighlights;
uniform float uBlackPoint;
uniform float uHighlightRolloff;
uniform float uClarity;
uniform float uFilmStrength;
uniform float uIntensity;
uniform float uSplit;
uniform int uComparisonMode;

#include "colorScience.glsl"

vec3 sampleLutSlice(vec3 c, float slice) {
  const float size = 32.0;
  const float tilesX = 8.0;
  const vec2 atlasSize = vec2(256.0, 128.0);
  float tx = mod(slice, tilesX);
  float ty = floor(slice / tilesX);
  vec2 pixel = vec2(tx, ty) * size + c.rg * (size - 1.0) + 0.5;
  return texture(uFilmLut, pixel / atlasSize).rgb;
}

vec3 sampleFilmLut(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float z = c.b * 31.0;
  float z0 = floor(z);
  float z1 = min(31.0, z0 + 1.0);
  return mix(sampleLutSlice(c, z0), sampleLutSlice(c, z1), fract(z));
}

float interleavedGradientNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 grade(vec3 source) {
  vec3 c = srgbToLinear(source);
  c *= exp2(uExposure);
  c = chromaticAdaptation(c, uTemperature, uTint);

  // Day-for-night shaping is continuous and exposure-driven: it suppresses the
  // telltale sunlit mid/high range without crushing low-luminance scene detail.
  float dayForNight = smoothstep(0.35, 1.05, -uExposure);
  float daylightY = luminance(c);
  float sunlitMask = smoothstep(0.045, 0.52, daylightY);
  c *= 1.0 - dayForNight * sunlitMask * 0.30;
  c = mix(c, vec3(luminance(c)), dayForNight * sunlitMask * 0.12);

  // Log-like lift/gamma/gain preserves ordering and keeps negative excursions controlled.
  c = max(c + uLift, vec3(0.0));
  c = pow(max(c, vec3(1e-6)), 1.0 / max(uGamma, vec3(0.1))) * uGain;

  float y = luminance(c);
  float shadowW = 1.0 - smoothstep(0.07, 0.38, y);
  float highlightW = smoothstep(0.42, 1.10, y);
  float midW = max(0.0, 1.0 - shadowW - highlightW);
  c += (uShadows * shadowW + uMidtones * midW + uHighlights * highlightW) * (0.16 + 0.55 * y);

  // Pivoted contrast in log2 exposure space, with a gentle clarity S-curve.
  vec3 logC = log2(max(c, vec3(1e-5)));
  c = exp2((logC + 2.0) * (1.0 + uContrast * 0.48) - 2.0);
  y = luminance(c);
  c *= 1.0 + uClarity * (smoothstep(0.08, 0.55, y) - smoothstep(0.55, 1.15, y));
  c = max(c - uBlackPoint * (1.0 - smoothstep(0.0, 0.18, y)), vec3(0.0));

  c = applyVibrance(c, uSaturation, uVibrance);
  c = softGamutCompress(c);

  // Creative 3D film-stock LUT is applied in a compressive scene-linear domain.
  vec3 lutDomain = c / (1.0 + c);
  vec3 film = sampleFilmLut(lutDomain);
  lutDomain = mix(lutDomain, film, uFilmStrength);
  c = lutDomain / max(vec3(1e-4), 1.0 - lutDomain);

  c = filmicCurve(max(c, vec3(0.0)), uHighlightRolloff);
  c = highlightDesaturate(c);
  c = softGamutCompress(c);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}

void main() {
  vec3 original = texture(uImage, vUv).rgb;
  vec3 graded = grade(original);
  vec3 result = mix(original, graded, uIntensity);
  if (uComparisonMode == 1 && vUv.x < uSplit) result = original;
  if (uComparisonMode == 2) result = original;
  float dither = (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(result + dither * step(0.001, uIntensity), 0.0, 1.0), 1.0);
}
