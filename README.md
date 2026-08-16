# Daylight LUT Shader

A production-oriented WebGL2 color studio that grades a local photograph against a continuous, daylight-aware 24-hour cycle. The application ships with the most recently downloaded compatible image available at build time and supports replacing it with a local JPEG, PNG, or WebP at runtime.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server. For a production build:

```bash
npm run build
npm start
```

## Architecture

```text
app/                         Vinext/React route and application styling
src/daylight/
  presets.ts                 16 authored grading anchors (00:00–24:00)
  interpolation.ts           cyclic, smooth Hermite interpolation
  daylightModel.ts           local-clock model and formatting
  solarPosition.ts           optional on-device solar elevation model
src/renderer/
  WebGLRenderer.ts           WebGL2 lifecycle, state, uniforms, DPR sizing
  ShaderProgram.ts           shader compile/link and uniform cache
  TextureLoader.ts           image textures and generated 32³ film LUT atlas
src/shaders/
  image.vert                 fitted image-plane vertex shader
  grading.frag               scene-linear grading pipeline
  colorScience.glsl          transfer functions, adaptation, gamut and tone tools
src/ui/DaylightStudio.tsx    controls, clock, file flow, comparison interaction
```

Rendering, clock time, daylight interpretation, grading data, interpolation, solar calculations, and UI state are deliberately separate. Time changes update uniforms only: image and LUT textures remain resident and shaders are never recompiled.

## Daylight model

The model uses authored anchors at midnight, deep night, pre-dawn, dawn, sunrise, morning, late morning, noon, early/late afternoon, golden hour, sunset, evening blue hour, night, late night, and the midnight loop endpoint. Each complete parameter vector is interpolated with a cubic smoothstep curve between neighboring anchors. The 24:00 anchor exactly matches 00:00, so the daily wrap is continuous.

Auto mode follows local device time. Optional Solar Sync uses latitude/longitude only in browser memory and a NOAA-style solar elevation approximation, then maps seasonal dawn, golden hour, and twilight onto the same stable artistic cycle. It requires no network call. Denied or unavailable geolocation falls back to local clock time.

## GPU color pipeline

The fragment pipeline is:

1. sample the source and decode its sRGB transfer function;
2. apply exposure in linear light;
3. perform a Bradford-derived chromatic adaptation for temperature and tint;
4. apply lift/gamma/gain and luminance-masked shadow, midtone, and highlight density;
5. apply continuous exposure-driven day-for-night suppression to sunlit mids/highs, then shape pivoted log contrast, black point, and local tonal clarity;
6. apply luminance-preserving saturation/vibrance with skin-like hue protection;
7. soft-compress out-of-gamut excursions;
8. map into a compressive domain and sample a genuine 32³ creative film-stock LUT stored as a 256×128 2D atlas with trilinear interpolation across blue slices;
9. apply a tunable ACES-like filmic curve, highlight desaturation, and final gamut protection;
10. encode linear light to sRGB and add sub-LSB spatial dithering.

The LUT is generated once at startup and represents subtle film density, channel crosstalk, a cool toe, and a warm shoulder. Daylight-specific decisions remain structured parameters, so LUT character and environmental grade can evolve independently.

## Image handling and browser limitations

Browsers cannot silently read arbitrary files from `~/Downloads`. During project creation, the newest compatible file was copied into `public/latest-download.png` (`leste-refugio.png`, 1456×1080). The **Open image** control uses the browser's explicit file picker for later images; selections remain local and are uploaded nowhere. If the contents of Downloads change, replace `public/latest-download.png` or use the picker.

`createImageBitmap` is requested without browser color conversion, and shader code performs explicit sRGB decoding/encoding. Embedded ICC-profile interpretation can vary because browser image decoders do not expose a portable raw-profile pipeline to WebGL.

## Controls

- **Auto time / Manual:** live local time or arbitrary minute-precision preview.
- **Solar Sync:** optional daylight remapping from local solar elevation.
- **Original / Compare:** graded, original, or draggable split view.
- **Grade intensity:** perceptual blend from original to full grade.
- The comparison divider supports pointer drag and arrow-key adjustment.

## Performance

The renderer uses WebGL2, cached uniform locations, resident image/LUT textures, one draw call, no CPU per-pixel grading, requestAnimationFrame-coalesced updates, a `ResizeObserver`, and a 2× device-pixel-ratio ceiling to balance retina quality and interactive frame time.
