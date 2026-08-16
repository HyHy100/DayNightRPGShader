export class ShaderProgram {
  readonly program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation>();

  constructor(private gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
    const vertex = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create WebGL program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader link failed:\n${gl.getProgramInfoLog(program)}`);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    this.program = program;
  }

  private compile(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error("Unable to create shader");
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const kind = type === this.gl.VERTEX_SHADER ? "vertex" : "fragment";
      throw new Error(`${kind} shader compile failed:\n${this.gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  use() { this.gl.useProgram(this.program); }
  uniform(name: string) {
    let location = this.uniforms.get(name);
    if (!location) {
      location = this.gl.getUniformLocation(this.program, name) ?? undefined;
      if (!location) throw new Error(`Missing uniform ${name}`);
      this.uniforms.set(name, location);
    }
    return location;
  }
}
