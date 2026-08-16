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
  solarPosition.ts           NOAA solar position, azimuth, equation of time, events
  atmosphereModel.ts         air mass, irradiance, scattering and twilight signals
  perceptualColor.ts         OKLab conversion and perceptual illuminant mixing
  artDirection.ts            physical-state to cinematic-grade interpretation
  daylightModel.ts           orchestration and clock-only reference fallback
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

Rendering, astronomical geometry, atmospheric physics, cinematic interpretation, perceptual color, and UI state are deliberately separate. Time changes update uniforms only: image and LUT textures remain resident and shaders are never recompiled.

## Daylight model

There are no hourly grading presets. With permission, the model calculates NOAA-derived equation of time, declination, hour angle, apparent solar elevation, azimuth, solar noon, sunrise/sunset, and civil/nautical/astronomical twilight for the current date and latitude/longitude. Kasten–Young air mass then drives continuous approximations of irradiance, direct/diffuse balance, Rayleigh-like sky contribution, Mie-like horizon haze, sun and sky CCT, golden-hour response, blue-hour response, and twilight depth.

Those physical signals feed a separate art-direction model. Direct sunlight influences highlights and upper midtones; diffuse sky influences shadows and lower midtones. Illuminant colors mix in OKLab, while exposure and chromatic adaptation remain physically appropriate linear/LMS operations. Morning/evening asymmetry is introduced through normalized sunrise→solar-noon→sunset progress without overriding elevation.

Every influence uses overlapping Gaussian or C2-continuous smootherstep functions. Minute-resolution tests bound the derivative of exposure, temperature, contrast, saturation, and highlight rolloff, and verify the 24:00→00:00 closure. When location is unavailable, a continuous clock-driven reference solar arc supplies the same atmospheric pipeline rather than reverting to preset interpolation.

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
- **Solar geometry:** optional date/location-aware astronomical calculations, entirely on-device.
- **Physics:** full-day plot and live inspection of elevation, azimuth, solar time, air mass, irradiance, CCT, scattering, haze, golden/blue-hour, twilight, and night signals.
- **Play full day:** 15, 30, or 60-second accelerated continuity preview.
- **Original / Compare:** graded, original, or draggable split view.
- **Grade intensity:** perceptual blend from original to full grade.
- The comparison divider supports pointer drag and arrow-key adjustment.

## Performance

The renderer uses WebGL2, cached uniform locations, resident image/LUT textures, one draw call, no CPU per-pixel grading, requestAnimationFrame-coalesced updates, a `ResizeObserver`, and a 2× device-pixel-ratio ceiling to balance retina quality and interactive frame time.
