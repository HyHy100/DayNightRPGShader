export async function loadImageTexture(gl: WebGL2RenderingContext, source: string | Blob) {
  const blob = typeof source === "string" ? await fetch(source).then((r) => { if (!r.ok) throw new Error(`Image request failed (${r.status})`); return r.blob(); }) : source;
  const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create image texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { texture, ...dimensions };
}

export function createFilmLut(gl: WebGL2RenderingContext) {
  const size = 32, tilesX = 8, tilesY = 4, width = size * tilesX, height = size * tilesY;
  const data = new Uint8Array(width * height * 4);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    let rr = r / (size - 1), gg = g / (size - 1), bb = b / (size - 1);
    const y = .2126*rr + .7152*gg + .0722*bb;
    // Film density: subtle channel crosstalk, cyan-biased toe and warm shoulder.
    const toe = 1 - smoothstep(.02, .34, y);
    const shoulder = smoothstep(.48, .94, y);
    rr += .010*gg - .006*bb + .009*shoulder - .004*toe;
    gg += .005*bb - .004*rr + .002*shoulder + .003*toe;
    bb += .006*rr - .007*gg - .009*shoulder + .010*toe;
    const density = (x: number) => Math.pow(Math.max(0, Math.min(1, x)), .985) * .997;
    rr = density(rr); gg = density(gg); bb = density(bb);
    const tx = b % tilesX, ty = Math.floor(b / tilesX);
    const index = ((ty*size + g) * width + tx*size + r) * 4;
    data[index] = Math.round(Math.max(0, Math.min(1, rr)) * 255);
    data[index+1] = Math.round(Math.max(0, Math.min(1, gg)) * 255);
    data[index+2] = Math.round(Math.max(0, Math.min(1, bb)) * 255);
    data[index+3] = 255;
  }
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create LUT texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return texture;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x-a)/(b-a)));
  return t*t*(3-2*t);
}
