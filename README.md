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
  lunarPosition.ts           topocentric Meeus-derived Moon geometry and phase
  moonlightModel.ts          clear-sky lunar extinction, illuminance and spectrum
  clearSkyModel.ts           Bird-style DNI/DHI/GHI and atmosphere profiles
  spectralModel.ts           sampled solar/sky spectra, CIE XYZ, chromaticity and CCT
  atmosphereModel.ts         physical state orchestration and nocturnal art signals
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
  brightPass.frag            exposure-relative soft-knee highlight extraction
  blur.frag                  separable Gaussian optical diffusion
  composite.frag             bloom, halation, comparison, display encoding
  colorScience.glsl          transfer functions, adaptation, gamut and tone tools
src/ui/DaylightStudio.tsx    controls, clock, file flow, comparison interaction
```

Rendering, astronomical geometry, atmospheric physics, cinematic interpretation, perceptual color, and UI state are deliberately separate. Time changes update uniforms only: image and LUT textures remain resident and shaders are never recompiled.

## Daylight model

There are no hourly grading presets. With permission, the model calculates SPA-oriented/NOAA-derived Julian solar geometry: Earth–sun distance, equation of time, declination, hour angle, geometric and refracted elevation, azimuth, solar noon, sunrise/sunset, polar-day/night state, and civil/nautical/astronomical twilight for the current date and latitude/longitude.

A Bird-style broadband clear-sky model produces direct normal (DNI), diffuse horizontal (DHI), and global horizontal irradiance (GHI) in W/m², with explicit Rayleigh, ozone, mixed-gas, water-vapor, and aerosol transmission. Energy closes as `GHI = DNI × cos(zenith) + DHI`. Clean, Standard, Hazy, and Custom offline atmosphere profiles expose pressure, altitude, precipitable water, ozone, aerosol optical depth, Ångström exponent, and albedo assumptions.

A compact 380–780 nm spectral model integrates a solar spectrum and wavelength-dependent atmospheric extinction through analytic CIE 1931 color-matching functions. It yields separate direct-sun and diffuse-sky XYZ/xy chromaticities, CCT, tint, and linear-RGB adaptation colors. This is a compact photographic illuminant model, not a replacement for line-by-line radiative-transfer software such as SMARTS.

Those physical signals feed a separate art-direction model. Direct sunlight influences highlights and upper midtones; diffuse sky influences shadows and lower midtones. Illuminant colors mix in OKLab, while exposure and chromatic adaptation remain physically appropriate linear/LMS operations. Morning/evening asymmetry is introduced through normalized sunrise→solar-noon→sunset progress without overriding elevation.

Story Sky uses a deterministic, internally coherent fictional temperate solar rig (35° authoring latitude, +8° solar declination, 12:15 solar noon). Spherical solar geometry produces sunrise near 05:45, sunset near 18:45, and the civil/nautical/astronomical crossings from the same arc; the numbers are qualitative story-world assumptions, not a claim about the device location. The low-sun color response is intentionally decoupled from the broadband irradiance horizon fade: weak beam energy can still create warm upper-midtone/highlight character against cool diffuse sky. A C2-smooth, evening-weighted horizon glow persists through civil twilight, so sunrise, clean morning, late-afternoon warmth, golden sunset, and afterglow remain visually distinct without becoming hard presets.

Below −18° the classification is physically **true night**, but the grade does not freeze. Solar hour angle continues around the dark hemisphere and drives a smooth evening-afterglow → anti-solar-midnight → pre-dawn-airglow trajectory. Solar-depression depth, a Gaussian midnight response, and restrained scotopic-adaptation shaping vary exposure, density, chroma, black point, and film response continuously.

Located mode also runs a compact Meeus-derived lunar ephemeris entirely offline. It produces observer-centered elevation/azimuth, distance, horizontal parallax, phase angle, illuminated fraction, lunar age, and waxing/waning state. A Krisciunas–Schaefer-style nonlinear phase response is distance-scaled and attenuated through the selected pressure, aerosol, ozone, and water profile. Direct horizontal and diffuse moonlight are reported separately in lux. A sampled reflected-solar spectrum includes restrained lunar-regolith reddening and wavelength-dependent atmospheric extinction before CIE integration.

Lunar grading is gated by both Moon visibility and solar depression: it begins below −6° and reaches full availability below −12°. Physical device-location mode caps a favorable full Moon near +0.45 EV. Location-free **Story Sky** is the default for fictional scenes: it supplies a deterministic, continuous Moon rise/transit/set arc with author-controlled illumination and transit time, plus a stronger visual-adaptation allowance so RPG backgrounds remain readable. Both modes slightly open shadow separation and black density with a restrained silver-neutral response; neither multiplies the image blue or fabricates directional relighting. Optional device-location mode replaces the art-directed rig with the real terrestrial ephemeris. Clouds, artificial light, aurora, eclipses, zodiacal light, scene normals, and scene depth are not modeled.

Golden and blue-hour behavior now emerges from air mass, surviving beam energy, diffuse-sky contribution, spectral sun/sky separation, and solar depression rather than dedicated time pulses. Regression tests bound minute-to-minute derivatives for both the atmospheric signals and final grade, verify sub-second playback resolution, verify irradiance energy closure, and verify the 24:00→00:00 closure. Story Sky is explicitly labeled art-directed and non-geographic; only located mode presents the solar model as geographically physical.

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
10. keep the graded result linear in an HDR-capable offscreen target, extract highlights with an exposure-relative soft knee, and build quarter- and eighth-resolution Gaussian diffusion scales;
11. recombine broad neutral bloom, tighter red-biased film halation, and restrained warm veiling glare using continuously modeled low-sun/noon/night optical controls;
12. apply a final soft display shoulder, encode linear light to sRGB, and add sub-LSB spatial dithering.

Optical glow is intentionally a lens/film interpretation downstream of atmospheric physics. Low-angle sunlight gradually lowers the extraction threshold and increases warm halation; solar noon stays tighter and cleaner; night raises the threshold and suppresses broad bloom so the renderer never invents a glowing Moon or globally lifts the frame. The UI control scales this model without replacing it.

The LUT is generated once at startup and represents subtle film density, channel crosstalk, a cool toe, and a warm shoulder. Daylight-specific decisions remain structured parameters, so LUT character and environmental grade can evolve independently.

## Image handling and browser limitations

Browsers cannot silently read arbitrary files from `~/Downloads`. During project creation, the newest compatible file was copied into `public/latest-download.png` (`leste-refugio.png`, 1456×1080). The **Open image** control uses the browser's explicit file picker for later images; selections remain local and are uploaded nowhere. If the contents of Downloads change, replace `public/latest-download.png` or use the picker.

`createImageBitmap` is requested without browser color conversion, and shader code performs explicit sRGB decoding/encoding. Embedded ICC-profile interpretation can vary because browser image decoders do not expose a portable raw-profile pipeline to WebGL.

## Controls

- **Auto time / Manual:** live local date/time or arbitrary date and minute-precision preview, with a **Today** shortcut.
- **Celestial source:** Story Sky works without location and exposes Moon illumination and transit-time controls. Match Device optionally enables real-world date/location-aware solar and lunar calculations, entirely on-device.
- **Physics:** located mode shows Sun and Moon elevation, separate clear-sky DNI/DHI/GHI in W/m², and a logarithmic lunar-lux plot. Story Sky shows its deterministic fictional Moon arc and adapted lux response without claiming geographic accuracy. The inspector exposes lunar phase, distance, air mass, transmission, ground illuminance, and contribution alongside the solar/atmospheric state.
- **Atmosphere profile:** choose Clean, Standard, Hazy, or edit all clear-sky assumptions manually. No network or weather service is used.
- **Play full day:** 15, 30, or 60-second accelerated continuity preview; crossing midnight advances the preview date so lunar motion remains chronological.
- **Original / Compare:** graded, original, or draggable split view.
- **Export video:** records a silent midnight-to-midnight WebM entirely in the browser at 720p or 1080p and 30 FPS. Choose a graded render or a labeled 50/50 original/graded comparison; 15, 30, and 60-second durations are available. The recording includes the current time and daylight-phase name using the studio typography.
- **Grade intensity:** perceptual blend from original to full grade.
- **Optical glow:** scales scene-linear multi-resolution bloom, warm halation, and veiling glare; its temporal character still comes from the continuous daylight state.
- The comparison divider supports pointer drag and arrow-key adjustment.

## Performance

The renderer uses WebGL2, cached uniform locations, resident image/LUT textures, reusable framebuffer targets, no CPU per-pixel grading, requestAnimationFrame-coalesced updates, a `ResizeObserver`, and a 2× device-pixel-ratio ceiling. The primary scene target uses RGBA16F when float rendering and filtering are supported and falls back cleanly to RGBA8. Bloom runs at quarter and eighth resolution, keeping the added separable blur passes inexpensive while preserving responsive high-DPI interaction.

Video export creates an isolated fixed-resolution WebGL renderer, composites typography on a recording canvas, and uses `canvas.captureStream()` plus `MediaRecorder`. VP9 WebM is preferred with VP8 WebM as fallback. Recording is real-time, local-only, contains no audio, and is unavailable in browsers that do not expose a compatible WebM encoder; no image or video data is uploaded.
