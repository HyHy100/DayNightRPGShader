import vertexSource from "../shaders/image.vert?raw";
import fragmentSourceRaw from "../shaders/grading.frag?raw";
import colorScience from "../shaders/colorScience.glsl?raw";
import type { DaylightGrade } from "../daylight/artDirection";
import { ShaderProgram } from "./ShaderProgram";
import { createFilmLut, loadImageTexture } from "./TextureLoader";

export type ComparisonMode = "graded" | "split" | "original";

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private shader: ShaderProgram;
  private imageTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture;
  private imageWidth = 1;
  private imageHeight = 1;
  private intensity = 1;
  private split = .5;
  private comparison: ComparisonMode = "split";
  private frame = 0;
  private pendingWidth = 1;
  private pendingHeight = 1;
  private destroyed = false;
  private resizeObserver: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is required for the daylight grading pipeline.");
    this.gl = gl;
    this.shader = new ShaderProgram(gl, vertexSource, fragmentSourceRaw.replace('#include "colorScience.glsl"', colorScience));
    this.lutTexture = createFilmLut(gl);
    this.createGeometry();
    this.shader.use();
    gl.uniform1i(this.shader.uniform("uImage"), 0);
    gl.uniform1i(this.shader.uniform("uFilmLut"), 1);
    // ResizeObserver can fire repeatedly while the panel or viewport is settling.
    // Only record the desired backing-store size here. Applying it inside the
    // render callback prevents a canvas resize from exposing its cleared buffer.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private createGeometry() {
    const { gl } = this;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,
      -1,1, 0,1,  1,-1, 1,0,   1,1, 1,1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  }

  async setImage(source: string | Blob) {
    const next = await loadImageTexture(this.gl, source);
    if (this.imageTexture) this.gl.deleteTexture(this.imageTexture);
    this.imageTexture = next.texture;
    this.imageWidth = next.width;
    this.imageHeight = next.height;
    this.draw();
    return { width: next.width, height: next.height };
  }

  setGrade(g: DaylightGrade) {
    const { gl, shader: s } = this;
    s.use();
    gl.uniform1f(s.uniform("uExposure"), g.exposure);
    gl.uniform1f(s.uniform("uTemperature"), g.temperature);
    gl.uniform1f(s.uniform("uTint"), g.tint);
    gl.uniform1f(s.uniform("uContrast"), g.contrast);
    gl.uniform1f(s.uniform("uSaturation"), g.saturation);
    gl.uniform1f(s.uniform("uVibrance"), g.vibrance);
    gl.uniform3fv(s.uniform("uLift"), g.lift);
    gl.uniform3fv(s.uniform("uGamma"), g.gamma);
    gl.uniform3fv(s.uniform("uGain"), g.gain);
    gl.uniform3fv(s.uniform("uShadows"), g.shadows);
    gl.uniform3fv(s.uniform("uMidtones"), g.midtones);
    gl.uniform3fv(s.uniform("uHighlights"), g.highlights);
    gl.uniform1f(s.uniform("uBlackPoint"), g.blackPoint);
    gl.uniform1f(s.uniform("uHighlightRolloff"), g.highlightRolloff);
    gl.uniform1f(s.uniform("uClarity"), g.clarity);
    gl.uniform1f(s.uniform("uFilmStrength"), g.filmStrength);
    this.draw();
  }

  setIntensity(value: number) { this.intensity = value; this.draw(); }
  setSplit(value: number) { this.split = Math.max(0, Math.min(1, value)); this.draw(); }
  setComparison(mode: ComparisonMode) { this.comparison = mode; this.draw(); }

  private resize() {
    const maxDpr = 2;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    this.pendingWidth = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    this.pendingHeight = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.draw();
  }

  private draw() {
    // Coalesce uniform and resize updates without canceling the pending frame.
    // Cancel-and-reschedule can starve rendering during 60 fps time playback.
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const { gl, shader: s, canvas } = this;
      if (canvas.width !== this.pendingWidth || canvas.height !== this.pendingHeight) {
        canvas.width = this.pendingWidth;
        canvas.height = this.pendingHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(.018, .019, .020, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!this.imageTexture) return;
      s.use();
      const canvasAspect = canvas.width / canvas.height;
      const imageAspect = this.imageWidth / this.imageHeight;
      const scale: [number, number] = imageAspect > canvasAspect ? [1, canvasAspect/imageAspect] : [imageAspect/canvasAspect, 1];
      gl.uniform2f(s.uniform("uImageScale"), scale[0], scale[1]);
      gl.uniform1f(s.uniform("uIntensity"), this.intensity);
      gl.uniform1f(s.uniform("uSplit"), this.split);
      gl.uniform1i(s.uniform("uComparisonMode"), this.comparison === "split" ? 1 : this.comparison === "original" ? 2 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }

  destroy() { this.destroyed = true; cancelAnimationFrame(this.frame); this.frame = 0; this.resizeObserver.disconnect(); }
}
