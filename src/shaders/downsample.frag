#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
void main() {
  vec2 o = uTexelSize * 0.75;
  vec3 c = texture(uSource, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(uSource, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(uSource, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(uSource, vUv + vec2( o.x,  o.y)).rgb;
  fragColor = vec4(c * 0.25, 1.0);
}
