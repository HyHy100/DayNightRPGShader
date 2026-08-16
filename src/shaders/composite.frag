#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uOriginal;
uniform sampler2D uScene;
uniform sampler2D uBloomTight;
uniform sampler2D uBloomWide;
uniform vec2 uImageScale;
uniform float uIntensity;
uniform float uSplit;
uniform int uComparisonMode;
uniform float uOpticalGlow;
uniform float uBloomStrength;
uniform float uHalationStrength;
uniform float uGlareStrength;
uniform float uMoonGlowStrength;

float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  if (abs(p.x) > uImageScale.x || abs(p.y) > uImageScale.y) {
    fragColor = vec4(0.018, 0.019, 0.020, 1.0);
    return;
  }
  vec2 imageUv = (p / uImageScale + 1.0) * 0.5;
  vec3 original = texture(uOriginal, imageUv).rgb;
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 tight = texture(uBloomTight, vUv).rgb;
  vec3 wide = texture(uBloomWide, vUv).rgb;

  float tightY = luminance(tight);
  float wideY = luminance(wide);
  vec3 neutralBloom = wide * uBloomStrength;
  // Film halation is red-biased and compact; it is deliberately not orange fog.
  vec3 halation = tightY * vec3(1.0, 0.24, 0.08) * uHalationStrength;
  vec3 glare = wideY * vec3(1.0, 0.88, 0.70) * uGlareStrength;
  // Strong Story Moon illumination receives a broad silver-neutral response.
  // It blooms existing high-value structures; it does not invent a Moon disc.
  vec3 moonGlow = wideY * vec3(0.78, 0.88, 1.0) * uMoonGlowStrength;
  // A perceptual control curve gives the upper half of the authoring slider a
  // clearly visible range while retaining fine control near zero.
  float glowControl = uOpticalGlow * (0.55 + 0.85 * uOpticalGlow);
  vec3 optical = (neutralBloom + halation + glare + moonGlow) * glowControl;
  vec3 gradedLinear = max(scene + optical, vec3(0.0));
  // A final soft display shoulder contains additive energy without bleaching color.
  gradedLinear /= 1.0 + max(gradedLinear - 0.92, vec3(0.0)) * 0.34;
  vec3 graded = clamp(linearToSrgb(gradedLinear), 0.0, 1.0);
  vec3 result = mix(original, graded, uIntensity);
  // uSplit is controlled by a handle positioned in canvas coordinates. Using
  // imageUv here shifts the wipe whenever the contained image is letterboxed.
  if (uComparisonMode == 1 && vUv.x < uSplit) result = original;
  if (uComparisonMode == 2) result = original;
  float dither = (noise(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(result + dither * step(0.001, uIntensity), 0.0, 1.0), 1.0);
}
