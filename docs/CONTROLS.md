# Controls guide

Add `#debug` to the URL to open these controls. The normal experience shows only the view buttons. Solver stability, sleep thresholds, density calibration and the direction palette use fixed defaults in the source. Snow supplies the default appearance. Reset snow is the first control and restarts particles with your current settings. Antialiasing and pixel ratio remain adjustable under Scene & rendering.

## Snow particles

- **Count, Radius, Size variation:** number and appearance of the particles. Radius ranges from 0.002–0.075; count ranges from 1,024–32,768 on both rendering backends. The default is 12,288 on phones and desktops.
- **Brightness:** overall particle brightness in Snow, Flow particles and Activity views.
- **Colors:** Water flow or White in Snow view, defaulting to White. Flow particles always uses Water flow without changing this preference. The water palette remembers the last meaningful direction while particles settle; it does not reset to white during sleep.
- **Saturation:** strength of particle direction colors, default 1.5. Flow trace has its own Trace saturation control.

Collision volume is fixed at 1.0. The density solver adjusts mass and effective spacing with particle radius. The palette uses a fixed minimum intensity of 0.2 and the established exposure. It emits no light onto other objects.

## Water depth

Depth measures distance **inside the water**, from the front sphere surface to the visible object, capped by the sphere's back surface. It is not fog based on distance from the camera.

- **Depth start:** where fading and blur begin, default **−0.185**. Its default slider range is **−3.03 to 1**, with 0.005 steps. Negative values start the effect before the water surface, so foreground particles also receive some fading and blur.
- **Depth end:** distance where the mapped depth reaches one; the globe is 3.03 units across.
- **Depth curve:** Linear or Smoothstep (default). Smoothstep eases into and out of the range.
- **Depth falloff:** higher values delay the effect toward the back.
- **Fade color / Fade strength:** one color and one amount replace the old tint, haze, clarity distance and overlapping strength controls. Strength zero disables fading.
- **Depth softness / Blur falloff:** amount and distribution of Gaussian blur. Softness zero skips the blur branch.
- **Depth view:** inspect actual distance or the mapped range and curve.

The fade blends toward Fade color with `1 − exp(−mappedDepth × fadeStrength)`. Defaults match the former neutral-gray absorption and black haze closely; Smoothstep intentionally changes its distribution. Water refraction keeps Snow's optical travel internally to preserve its appearance. Its IOR is fixed at 1.333, with no chromatic separation. The alternate Backdrop sampling path is removed.

The Gaussian filter uses nine weighted color reads and existing mipmaps. Depth fading and blur run in a small TSL image pass before refraction, reusing the knot backdrop after knot rendering. There is no additional full-size target. Turning off Depth effect skips this image pass. Texture counts alone do not establish an FPS difference; device profiling is needed. Gaussian remains the sole filter.

## Simulation

| Control | Effect |
| --- | --- |
| Fall speed | Settling speed relative to water, along gravity. |
| Water drag | How quickly particles follow currents and lose leftover motion. |
| Particle inertia | Resistance to changes in water direction. |
| Current strength | Scales water velocity; gravity and solid contacts remain at zero. |
| Knot stirring | How strongly the rotating knot drives water; default 1.0. |
| Turbulence | Irregular motion while shaking or knot rotation supplies energy. |
| Speed limit | Maximum particle velocity. |

These former tweaks remain internal physics settings:

| Internal setting | Meaning and cost |
| --- | --- |
| Volume iterations | Repeated corrections of crowded/overlapping particles. The default is two iterations. More costs compute work. |
| Contact viscosity | Touching particles exchange some velocity, reducing sliding differences. It is not attraction. |
| Impact bounce | How much a fast collision rebounds. |
| Impact threshold | Minimum approach speed before extra bounce applies; quiet contacts do not gain energy. |
| Substeps | Splits elapsed time into smaller simulation steps. More can improve fast-contact accuracy but increases work. The default GPU simulation uses 60 Hz. |

**Sleep remains automatic.** Once the complete system settles, the GPU solver and color-history dispatch stop; CPU particles also stop updating. Rendering continues. This saves work with 12,288 particles and prevents resting-contact jitter. A continuously rotating knot keeps the system active, so disable auto rotation when evaluating rest. Pointer or phone movement wakes it again.

### Cursor response

Shake energy decay removes stored shake energy. It does not brake the powered knot or replace particle drag. The energy scalar is a bounded animation envelope, not a conserved physical energy measurement.

Globe movement controls elastic translation. Spring stiffness and damping control its return. Hold the left mouse button to turn at up to 240°/s, then release to spring upright. Knot rotation has independent axes and a speed control. Shake and reset-knot buttons are removed; pointer and phone gestures remain.

## Flow trace view

Curves integrate the same current sampler used by the CPU simulation and mirrored in TSL. Highlights travel with water velocity; Trace time makes faster currents draw longer curves. Slice isolates a slab. Show particles displays the actual balls, which can lag behind the current because of inertia, gravity and contacts.

Flow trace keeps the full globe. Trace saturation adjusts line colors independently of particle saturation, and zero gives monochrome traces. Lines render afterward, unaffected by water/glass refraction, blur or tint, and reuse interior depth for opaque-object occlusion. Particles retain their normal optics. Traces update at 12 Hz with GPU interpolation and only while displayed. Pause freezes them; simulation edits recompute the preview.

## Other materials

- **Glass / knot glass:** reflection, coating, transmission and refraction controls remain. Knot glass defaults to IOR 1.47. Thin-film interference and its controls are removed; it added iridescent reflection colors and was not required for transparent glass.
- **Base:** fixed smooth plinth, with color, roughness and metalness only. No finish presets, trim rings or grain shader.
- **Ground:** illumination color and intensity only, scoped to the ground and its substrate.
- **Activity:** actual displacement controls monochrome brightness. Contact impulses without movement stay dark.

## Phone motion

Motion starts automatically where supported. On iPhone, tap the globe or a view button and allow motion. Permission belongs to the website, so allowing the local test URL does not allow mesq.me. A short status above the view buttons disappears when sensor data arrives; the debug panel also reports sensor status. Failed requests can retry on the next tap. If access was denied, allow Motion & Orientation in the browser's site settings and reload.

For local phone testing, run `npm run https:setup` and `npm run https:certificate`. Download the public CA certificate from `http://<your-LAN-IP>:5175/snow-globe.cer` on the phone and install it. On iPhone, enable its full trust under Settings → General → About → Certificate Trust Settings. Restart `npm run dev` and use its HTTPS Network URL. Stop the certificate server after installation. The generated certificates stay in the ignored `.certs/` folder; re-run setup if your LAN IP changes. The deployed site uses the server’s existing HTTPS certificate.
