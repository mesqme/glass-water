# Snow globe

An interactive water-filled globe built with Vite, Three.js / TSL, Three.js Blocks and Tweakpane. Move the pointer to shake it; hold the left mouse button to turn it upside down and release to spring upright.

## Run

Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

Debug settings persist locally. **Restore all defaults** restores the Snow appearance without reloading; **Download controls** exports the current settings as JSON. Use `/?defaults=1` to ignore saved settings for one load.

**Snow** is the default appearance. It uses white particles with radius 0.035, size variation 0, brightness 1.05, water-flow saturation 1.5, Depth start −0.185, depth softness 0.2 and blur falloff 3. Knot stirring is 1.0 and knot glass IOR is 1.47. **Reset snow**, at the top of the controls, restarts particles with the current settings.

The main experience shows only the five view buttons. Add **`#debug`** to the URL to load the settings panel (for example `https://192.168.1.100:5174/#debug`). Removing the hash disposes the panel. Tweakpane is a separate chunk, loaded only for debugging.

## Views

- **Snow:** white particles by default. Snow particles → Colors can still switch to the water-flow palette.
- **Flow particles:** color particles by remembered water direction, with saturation 1.5 by default. Settling particles retain their last meaningful colors. This view preserves Snow's Colors preference.
- **Flow trace:** inspect currents over the rendered globe. Lines remain undistorted by water and glass; opaque objects hide lines behind them. Moving highlights show direction, trace length reflects speed, and color indicates water direction. Trace saturation (2) and brightness (1) are independent of particle colors. Slice the volume or show particles to compare their response.
- **Depth:** inspect water distance to the visible interior, or the mapped depth range and curve.
- **Activity:** actual particle travel speed controls monochrome brightness; filtered contact jitter stays dark.

See [the controls guide](docs/CONTROLS.md) for simulation, material and debug controls.

## Rendering

There is one rendering configuration: 12,288 WebGPU particles, 60 Hz simulation, two density iterations, pixel ratio 1.5 and 4× MSAA. Knot glass captures one surface layer; water optics and Gaussian depth blur are enabled. Scene & rendering retains manual antialias and pixel-ratio controls. Phones use these same defaults. A particle-count change restarts the simulation; a view change preserves it.

Adaptive resolution can reduce pixel ratio to 1 after sustained slow frames. Both WebGPU and WebGL use the requested count: 12,288 particles by default, on desktop and phone. WebGL uses CPU contacts and is slower; it retains the full particle count. Low-end hardware needs its own performance check; no fixed frame rate is assumed. [Performance and profiling](PERFORMANCE.md).

## Phone motion

Phones use larger framing with room for the globe, base and bottom view buttons. Motion starts automatically when the browser permits it. Browsers that require a gesture request permission on the first touch of the globe or a view button. A denied request is not repeated on every touch; swipe remains available. Sensor status is visible in `#debug`.

### Local HTTPS

`npm run dev` listens on the LAN. WebGPU and motion sensors need a trusted secure context; an HTTP LAN URL forces WebGL even on a WebGPU-capable phone.

```sh
npm run https:setup
npm run https:certificate
```

The setup script generates a local development CA and a 90-day server certificate for localhost, your hostname and current LAN IPv4 addresses. They live in the ignored `.certs/` directory. The second command temporarily serves **only the public CA certificate** at `http://<your-LAN-IP>:5175/snow-globe.cer`.

1. Download that certificate on the phone.
2. On iPhone, install the downloaded profile in **Settings → General → VPN & Device Management**, then enable **Snow Globe Local Development** under **Settings → General → About → Certificate Trust Settings**. See [Apple's certificate instructions](https://support.apple.com/en-gb/102390). On Android, use the device's security settings to install it as a CA certificate.
3. Restart `npm run dev` and open the printed **HTTPS** Network URL. Stop the certificate-download server after installation.

Do not commit or share the CA private key. Only trust this development CA on your own test devices; remove it when finished. Re-run setup if your LAN IP changes or the server certificate expires. No system trust store is changed by the script. `HTTPS_KEY` and `HTTPS_CERT` can supply existing certificates instead. `DEV_HTTP=1 npm run dev` is available for loopback testing.

The full scene has been confirmed working on iOS. GPU performance and sensor behavior still vary by device and browser. Permission handling follows the [device motion specification](https://www.w3.org/TR/orientation-event/).

## Structure

```text
src/
    index.html
    script.js                  Scene lifecycle and ordered rendering
    style.css
    experience/
        config/                Snow defaults, saved settings and export
        controls/              Lazy-loaded debug panel and bindings
        input/                 Pointer, elastic rotation, phone and knot motion
        simulation/            Blocks PBF, CPU fallback, currents and collisions
        rendering/             Particle materials, optics, flow traces, inspector
        scene/                 Globe, ground, knot, pedestal and reflection rig
deploy/                        Nginx location snippet
static/                        Favicon and third-party notices
tests/                         Simulation, controls and shader regression checks
```

Four-space indentation; `.editorconfig` records the formatting. Defaults contain only active settings. The local lesson archive is preserved and excluded from Git.

## Rendering and physics

Particles use Blocks sphere impostors and PBF density constraints on WebGPU. Compression-only contacts avoid attraction; impacts, drag and sleep dissipate motion. The current field combines stored shake energy, vortices, turbulence, knot entrainment and globe angular motion. It is a prescribed velocity field, not a full fluid-momentum solver.

| Layer | Implementation |
| --- | --- |
| Particle neighbors and density constraints on WebGPU | Three.js Blocks PBF |
| Particle rendering | Blocks sphere impostors; one instanced mesh |
| Glass shell, water interface and glass knot | Blocks transmission materials |
| Currents, drag, impact response, boundaries and sleep | Custom TSL compute around Blocks PBF |
| Water depth, fading and Gaussian blur | Custom TSL image pass |
| Particle direction colors, remembered colors and activity | Custom TSL shaders and compute |
| Flow trace overlay | CPU streamline integration; TSL interpolation, color and depth occlusion |
| Input, scene setup and WebGL physics fallback | JavaScript / Three.js |

TSL builds the shaders; Three compiles them to WGSL for WebGPU or GLSL for WebGL. Compute simulation runs on WebGPU, with CPU physics as the WebGL fallback. The Blocks integrations are built on TSL too. Glass uses Blocks screen-space transmission; optical thickness is an approximation, not hidden-surface ray tracing. The knot captures one front surface layer. Water reuses the interior depth attachment. A small TSL pass applies depth fading and Gaussian blur once per pixel, then Blocks refracts that image. The pass reuses the knot backdrop after knot rendering, so it needs no additional full-size target. Ground geometry shares the collision height function and fits inside the sphere.

Ground provides one light color and intensity, scoped to the interior ground. The base has one fixed plinth shape with color, roughness and metalness. Thin-film interference is disabled on all materials. Other materials use the baked reflection environment. The rotating knot is a powered motor: disable auto rotation to let the whole simulation settle and sleep.

## Debugging

- **`#debug`:** settings, renderer/solver status, reset and export. Tweakpane loads only when requested.
- **Performance → Open TSL inspector → Capture 180 frames:** optional GPU/CPU pass profiling. Inspector mode disables adaptive resolution.
- **`?renderer=webgl`:** verify the automatic WebGL/CPU fallback explicitly.
- **`?defaults=1`:** ignore saved controls for one load.

Temporary iOS optical-stage overrides, full-buffer audits and per-frame DOM diagnostics are removed. Shader errors use the browser console. Automated checks cover physics, containment, sleep, color history, saved settings, streamline integration, phone framing and sensor permissions, and WGSL/GLSL generation.

## Deploy

`npm run package:site` builds for **`https://mesq.me/globe-tsl-blocks/`** and creates `artifacts/globe-tsl-blocks.tar.gz`. The archive contains only deployable static files and dependency notices. Production source maps are disabled; source stays in the repository.

See [the deployment guide](docs/DEPLOYMENT.md) for the exact Nginx location, upload and validation steps. Local development keeps `/`; production and `npm run preview` use `/globe-tsl-blocks/`.

## Dependencies and notices

- [Three.js / TSL](https://threejs.org/) 0.185.1 — MIT
- [Three.js Blocks](https://threejs-blocks.com/) 0.12.0 — PolyForm Noncommercial 1.0.0; see its included license for distribution terms
- [Tweakpane](https://tweakpane.github.io/docs/) 4.0.5 — MIT

Copies of dependency licenses and notices are in `static/`. The Blocks particle simulation follows the [SPH/PBF example](https://threejs-blocks.com/examples/webgpu_simulation_sph_3d).
