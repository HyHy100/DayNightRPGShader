#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uDirection;

void main() {
  // Separable 13-tap Gaussian. Paired taps exploit hardware bilinear filtering.
  vec3 c = texture(uSource, vUv).rgb * 0.19648255;
  c += texture(uSource, vUv + uDirection * 1.4117647).rgb * 0.29690696;
  c += texture(uSource, vUv - uDirection * 1.4117647).rgb * 0.29690696;
  c += texture(uSource, vUv + uDirection * 3.2941176).rgb * 0.09447040;
  c += texture(uSource, vUv - uDirection * 3.2941176).rgb * 0.09447040;
  c += texture(uSource, vUv + uDirection * 5.1764706).rgb * 0.01088136;
  c += texture(uSource, vUv - uDirection * 5.1764706).rgb * 0.01088136;
  fragColor = vec4(c, 1.0);
}
