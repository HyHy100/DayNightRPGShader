#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uThreshold;
uniform float uKnee;

float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  // Four-tap box filtering makes the first reduction stable under animation.
  vec2 o = uTexelSize * 0.5;
  vec3 c = (texture(uSource, vUv + vec2(-o.x, -o.y)).rgb
          + texture(uSource, vUv + vec2( o.x, -o.y)).rgb
          + texture(uSource, vUv + vec2(-o.x,  o.y)).rgb
          + texture(uSource, vUv + vec2( o.x,  o.y)).rgb) * 0.25;
  float y = luminance(c);
  float knee = max(1e-4, uKnee);
  float soft = clamp(y - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contribution = max(y - uThreshold, soft) / max(y, 1e-4);
  fragColor = vec4(c * contribution, 1.0);
}
