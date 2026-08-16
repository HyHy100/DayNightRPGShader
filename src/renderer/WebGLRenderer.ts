import imageVertexSource from "../shaders/image.vert?raw";
import fullscreenVertexSource from "../shaders/fullscreen.vert?raw";
import gradingFragmentRaw from "../shaders/grading.frag?raw";
import brightFragmentSource from "../shaders/brightPass.frag?raw";
import blurFragmentSource from "../shaders/blur.frag?raw";
import downsampleFragmentSource from "../shaders/downsample.frag?raw";
import compositeFragmentSource from "../shaders/composite.frag?raw";
import colorScience from "../shaders/colorScience.glsl?raw";
import type { DaylightGrade } from "../daylight/artDirection";
import { ShaderProgram } from "./ShaderProgram";
import { createFilmLut, loadImageTexture } from "./TextureLoader";

export type ComparisonMode = "graded" | "split" | "original";
export interface WebGLRendererOptions { width?: number; height?: number; observeResize?: boolean }

interface RenderTarget { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number }

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private gradeShader: ShaderProgram;
  private brightShader: ShaderProgram;
  private blurShader: ShaderProgram;
  private downsampleShader: ShaderProgram;
  private compositeShader: ShaderProgram;
  private vao: WebGLVertexArrayObject;
  private imageTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture;
  private targets: RenderTarget[] = [];
  private targetWidth = 0;
  private targetHeight = 0;
  private useHdrTargets = false;
  private imageWidth = 1;
  private imageHeight = 1;
  private intensity = 1;
  private opticalGlow = .58;
  private split = .5;
  private comparison: ComparisonMode = "split";
  private grade: DaylightGrade | null = null;
  private frame = 0;
  private pendingWidth = 1;
  private pendingHeight = 1;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement, options: WebGLRendererOptions = {}) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is required for the daylight grading pipeline.");
    this.gl = gl;
    this.gradeShader = new ShaderProgram(gl, imageVertexSource, gradingFragmentRaw.replace('#include "colorScience.glsl"', colorScience));
    this.brightShader = new ShaderProgram(gl, fullscreenVertexSource, brightFragmentSource);
    this.blurShader = new ShaderProgram(gl, fullscreenVertexSource, blurFragmentSource);
    this.downsampleShader = new ShaderProgram(gl, fullscreenVertexSource, downsampleFragmentSource);
    this.compositeShader = new ShaderProgram(gl, fullscreenVertexSource, compositeFragmentSource);
    this.lutTexture = createFilmLut(gl);
    this.vao = this.createGeometry();
    this.useHdrTargets = Boolean(gl.getExtension("EXT_color_buffer_float") && gl.getExtension("OES_texture_float_linear"));
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    this.setSampler(this.gradeShader, "uImage", 0); this.setSampler(this.gradeShader, "uFilmLut", 1);
    this.setSampler(this.brightShader, "uSource", 0);
    this.setSampler(this.blurShader, "uSource", 0);
    this.setSampler(this.downsampleShader, "uSource", 0);
    this.setSampler(this.compositeShader, "uOriginal", 0);
    this.setSampler(this.compositeShader, "uScene", 1);
    this.setSampler(this.compositeShader, "uBloomTight", 2);
    this.setSampler(this.compositeShader, "uBloomWide", 3);
    if (options.width && options.height) {
      this.pendingWidth = Math.max(1, Math.round(options.width)); this.pendingHeight = Math.max(1, Math.round(options.height));
      canvas.width = this.pendingWidth; canvas.height = this.pendingHeight;
    } else {
      if (options.observeResize !== false) { this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement ?? canvas); }
      this.resize();
    }
  }

  private setSampler(shader: ShaderProgram, name: string, unit: number) { shader.use(); this.gl.uniform1i(shader.uniform(name), unit); }

  private createGeometry() {
    const { gl } = this;
    const vao = gl.createVertexArray(); const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error("Unable to create fullscreen geometry.");
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,
      -1,1, 0,1,  1,-1, 1,0,   1,1, 1,1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    return vao;
  }

  private createTarget(width: number, height: number): RenderTarget {
    const { gl } = this; const texture = gl.createTexture(); const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Unable to allocate optical render targets.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.useHdrTargets ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, this.useHdrTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Optical framebuffer is incomplete.");
    return { texture, framebuffer, width, height };
  }

  private ensureTargets(width: number, height: number) {
    if (width === this.targetWidth && height === this.targetHeight) return;
    for (const t of this.targets) { this.gl.deleteTexture(t.texture); this.gl.deleteFramebuffer(t.framebuffer); }
    const qw = Math.max(1, Math.ceil(width / 4)), qh = Math.max(1, Math.ceil(height / 4));
    const ew = Math.max(1, Math.ceil(width / 8)), eh = Math.max(1, Math.ceil(height / 8));
    this.targets = [this.createTarget(width,height),this.createTarget(qw,qh),this.createTarget(qw,qh),this.createTarget(qw,qh),this.createTarget(ew,eh),this.createTarget(ew,eh),this.createTarget(ew,eh)];
    this.targetWidth = width; this.targetHeight = height; this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  async setImage(source: string | Blob) {
    const next = await loadImageTexture(this.gl, source);
    if (this.destroyed) {
      this.gl.deleteTexture(next.texture);
      throw new Error("Renderer was disposed while the image was loading.");
    }
    if (this.imageTexture) this.gl.deleteTexture(this.imageTexture);
    this.imageTexture = next.texture; this.imageWidth = next.width; this.imageHeight = next.height; this.draw();
    return { width: next.width, height: next.height };
  }

  setGrade(g: DaylightGrade) {
    if (this.destroyed) return;
    this.grade = g; const { gl, gradeShader: s } = this; s.use();
    gl.uniform1f(s.uniform("uExposure"), g.exposure); gl.uniform1f(s.uniform("uTemperature"), g.temperature); gl.uniform1f(s.uniform("uTint"), g.tint);
    gl.uniform1f(s.uniform("uContrast"), g.contrast); gl.uniform1f(s.uniform("uSaturation"), g.saturation); gl.uniform1f(s.uniform("uVibrance"), g.vibrance);
    gl.uniform3fv(s.uniform("uLift"), g.lift); gl.uniform3fv(s.uniform("uGamma"), g.gamma); gl.uniform3fv(s.uniform("uGain"), g.gain);
    gl.uniform3fv(s.uniform("uShadows"), g.shadows); gl.uniform3fv(s.uniform("uMidtones"), g.midtones); gl.uniform3fv(s.uniform("uHighlights"), g.highlights);
    gl.uniform1f(s.uniform("uBlackPoint"), g.blackPoint); gl.uniform1f(s.uniform("uHighlightRolloff"), g.highlightRolloff);
    gl.uniform1f(s.uniform("uClarity"), g.clarity); gl.uniform1f(s.uniform("uFilmStrength"), g.filmStrength);
    gl.uniform1f(s.uniform("uEmissivePreservation"), g.emissivePreservation); this.draw();
  }

  setIntensity(value: number) { this.intensity = value; this.draw(); }
  setOpticalGlow(value: number) { this.opticalGlow = Math.max(0, Math.min(1.5, value)); this.draw(); }
  setSplit(value: number) { this.split = Math.max(0, Math.min(1, value)); this.draw(); }
  setComparison(mode: ComparisonMode) { this.comparison = mode; this.draw(); }
  renderFrame() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.render(); }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.pendingWidth = Math.max(1, Math.round(this.canvas.clientWidth * dpr)); this.pendingHeight = Math.max(1, Math.round(this.canvas.clientHeight * dpr)); this.draw();
  }

  private bindTarget(target: RenderTarget | null, width: number, height: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target?.framebuffer ?? null); this.gl.viewport(0, 0, width, height);
  }

  private post(shader: ShaderProgram, target: RenderTarget, source: RenderTarget, setup?: () => void) {
    const { gl } = this; this.bindTarget(target, target.width, target.height); shader.use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.texture); setup?.(); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private draw() {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => this.render());
  }

  private render() {
      this.frame = 0; if (this.destroyed) return; const { gl, canvas } = this;
      if (canvas.width !== this.pendingWidth || canvas.height !== this.pendingHeight) { canvas.width = this.pendingWidth; canvas.height = this.pendingHeight; }
      this.ensureTargets(canvas.width, canvas.height); this.bindTarget(null, canvas.width, canvas.height);
      gl.clearColor(.018,.019,.020,1); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!this.imageTexture || !this.grade) return;
      gl.bindVertexArray(this.vao);
      const canvasAspect=canvas.width/canvas.height,imageAspect=this.imageWidth/this.imageHeight;
      const scale:[number,number]=imageAspect>canvasAspect?[1,canvasAspect/imageAspect]:[imageAspect/canvasAspect,1];
      const [scene,bright,quarterPing,quarterBlur,wideSource,widePing,wideBlur]=this.targets;

      this.bindTarget(scene,scene.width,scene.height); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); this.gradeShader.use();
      gl.uniform2f(this.gradeShader.uniform("uImageScale"),scale[0],scale[1]);
      gl.uniform2f(this.gradeShader.uniform("uImageTexelSize"),1/this.imageWidth,1/this.imageHeight);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.imageTexture); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this.lutTexture); gl.drawArrays(gl.TRIANGLES,0,6);

      this.post(this.brightShader,bright,scene,()=>{gl.uniform2f(this.brightShader.uniform("uTexelSize"),1/scene.width,1/scene.height);gl.uniform1f(this.brightShader.uniform("uThreshold"),this.grade!.bloomThreshold);gl.uniform1f(this.brightShader.uniform("uKnee"),this.grade!.bloomKnee);});
      this.post(this.blurShader,quarterPing,bright,()=>gl.uniform2f(this.blurShader.uniform("uDirection"),1/bright.width,0));
      this.post(this.blurShader,quarterBlur,quarterPing,()=>gl.uniform2f(this.blurShader.uniform("uDirection"),0,1/bright.height));
      this.post(this.downsampleShader,wideSource,quarterBlur,()=>gl.uniform2f(this.downsampleShader.uniform("uTexelSize"),1/quarterBlur.width,1/quarterBlur.height));
      this.post(this.blurShader,widePing,wideSource,()=>gl.uniform2f(this.blurShader.uniform("uDirection"),1/wideSource.width,0));
      this.post(this.blurShader,wideBlur,widePing,()=>gl.uniform2f(this.blurShader.uniform("uDirection"),0,1/wideSource.height));

      this.bindTarget(null,canvas.width,canvas.height); this.compositeShader.use();
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.imageTexture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,scene.texture);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,quarterBlur.texture);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,wideBlur.texture);
      const s=this.compositeShader,g=this.grade;
      gl.uniform2f(s.uniform("uImageScale"),scale[0],scale[1]);gl.uniform1f(s.uniform("uIntensity"),this.intensity);gl.uniform1f(s.uniform("uSplit"),this.split);
      gl.uniform1i(s.uniform("uComparisonMode"),this.comparison==="split"?1:this.comparison==="original"?2:0);gl.uniform1f(s.uniform("uOpticalGlow"),this.opticalGlow);
      gl.uniform1f(s.uniform("uBloomStrength"),g.bloomStrength);gl.uniform1f(s.uniform("uHalationStrength"),g.halationStrength);gl.uniform1f(s.uniform("uGlareStrength"),g.glareStrength);gl.uniform1f(s.uniform("uMoonGlowStrength"),g.moonGlowStrength);
      gl.drawArrays(gl.TRIANGLES,0,6); gl.flush();
  }

  destroy() {
    this.destroyed=true;cancelAnimationFrame(this.frame);this.frame=0;this.resizeObserver?.disconnect();
    for(const t of this.targets){this.gl.deleteTexture(t.texture);this.gl.deleteFramebuffer(t.framebuffer);} this.gl.deleteVertexArray(this.vao);
    if(this.imageTexture)this.gl.deleteTexture(this.imageTexture);this.gl.deleteTexture(this.lutTexture);
    this.gradeShader.destroy();this.brightShader.destroy();this.blurShader.destroy();this.downsampleShader.destroy();this.compositeShader.destroy();
  }
}
