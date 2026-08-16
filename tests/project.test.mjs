import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the daylight cycle exposes every required anchor and a midnight loop", async () => {
  const source = await read("src/daylight/presets.ts");
  const hours = [...source.matchAll(/\{ hour: ([\d.]+), name:/g)].map((m) => Number(m[1]));
  assert.deepEqual(hours, [0,3,5,6,7,8,10,12,14,16,17.5,18.5,19.5,21,23,24]);
  assert.equal((source.match(/name: "Midnight"/g) ?? []).length, 2);
});

test("time interpolation is cyclic and eases the complete state", async () => {
  const source = await read("src/daylight/interpolation.ts");
  assert.match(source, /wrap24/);
  assert.match(source, /t \* t \* \(3 - 2 \* t\)/);
  for (const field of ["lift", "gamma", "gain", "shadows", "midtones", "highlights"]) assert.match(source, new RegExp(`out\\.${field} = mix3`));
});

test("the fragment shader contains the documented high-precision color pipeline", async () => {
  const shader = await read("src/shaders/grading.frag");
  const science = await read("src/shaders/colorScience.glsl");
  assert.match(shader, /precision highp float/);
  assert.match(shader, /srgbToLinear/);
  assert.match(shader, /chromaticAdaptation/);
  assert.match(shader, /sampleFilmLut/);
  assert.match(shader, /filmicCurve/);
  assert.match(shader, /softGamutCompress/);
  assert.match(shader, /interleavedGradientNoise/);
  assert.match(science, /linearToSrgb/);
});

test("the product metadata and local-image workflow replaced the starter", async () => {
  const layout = await read("app/layout.tsx");
  const ui = await read("src/ui/DaylightStudio.tsx");
  assert.match(layout, /Daylight — Cinematic Grade/);
  assert.doesNotMatch(layout, /codex-preview/);
  assert.match(ui, /latest-download\.png/);
  assert.match(ui, /image\/jpeg,image\/png,image\/webp/);
});
