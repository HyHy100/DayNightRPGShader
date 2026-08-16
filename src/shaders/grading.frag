#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform sampler2D uFilmLut;
uniform vec2 uImageTexelSize;
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
uniform float uEmissivePreservation;

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

vec3 grade(vec3 source) {
  vec3 sourceLinear = srgbToLinear(source);
  float sourceY = luminance(sourceLinear);
  float sourceMax = max(max(sourceLinear.r, sourceLinear.g), sourceLinear.b);
  float sourceMin = min(min(sourceLinear.r, sourceLinear.g), sourceLinear.b);
  vec2 emissiveRadius = uImageTexelSize * 8.0;
  float neighborhoodY = 0.25 * (
    luminance(srgbToLinear(texture(uImage, vUv + vec2(emissiveRadius.x, 0.0)).rgb)) +
    luminance(srgbToLinear(texture(uImage, vUv - vec2(emissiveRadius.x, 0.0)).rgb)) +
    luminance(srgbToLinear(texture(uImage, vUv + vec2(0.0, emissiveRadius.y)).rgb)) +
    luminance(srgbToLinear(texture(uImage, vUv - vec2(0.0, emissiveRadius.y)).rgb)));

  // Detect encoded warm radiance before exposure and white-balance changes.
  // Ratios matter more than absolute RGB here: a fire core has red at least as
  // strong as green and almost no blue energy. This rejects warm masonry,
  // foliage, and roofs that a broad orange detector would mistake for lights.
  float sourceRange = max(sourceMax - sourceMin, 0.0);
  float redLead = smoothstep(-0.005, 0.12, sourceLinear.r - sourceLinear.g);
  float blueDeficit = smoothstep(0.55, 0.78,
    (min(sourceLinear.r, sourceLinear.g) - sourceLinear.b) / max(sourceMax, 1e-4));
  float emissiveChroma = smoothstep(0.42, 0.72, sourceRange / max(sourceMax, 1e-4));
  float emissiveLuma = smoothstep(0.18, 0.48, sourceY);
  float localRadiance = smoothstep(0.08, 0.40, sourceY - neighborhoodY);
  float emissiveMask = redLead * blueDeficit * emissiveChroma * emissiveLuma * localRadiance;

  vec3 c = sourceLinear;
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

  // A practical light must not lose the same stops as reflected daylight.
  // Restore only positive local radiance toward a modest scene-linear target;
  // subsequent filmic compression, gamut protection, and bloom remain active.
  vec3 emissiveTarget = sourceLinear * (1.12 + 0.62 * emissiveMask);
  float emissiveBlend = emissiveMask * uEmissivePreservation;
  c = mix(c, max(c, emissiveTarget), emissiveBlend);

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
  // Keep the intermediate in linear display light. Optical bloom is extracted
  // and recombined before the final sRGB encode in the composite pass.
  return max(c, vec3(0.0));
}

void main() {
  vec3 original = texture(uImage, vUv).rgb;
  fragColor = vec4(grade(original), 1.0);
}
