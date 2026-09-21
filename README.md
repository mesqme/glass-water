# Snow globe

A small experiment with glass, water and 12,288 snow particles, built with Three.js, TSL and Three.js Blocks.

## What’s interesting

- **[Three.js Blocks](https://threejs-blocks.com/):** GPU particle density solver, sphere impostors for efficient particle rendering, and glass/water transmission materials.
- **[TSL](https://threejs.org/tsl/):** custom currents, collisions, particle colors, water depth fading and Gaussian blur.
- **Rendering:** particles share one instanced mesh; water effects reuse existing depth and render textures. Reflection lighting is baked once.
- **Views:** Snow, Flow particles, Flow trace, Depth and Activity show different parts of the simulation.

Currents are procedural. WebGPU runs the particle simulation; WebGL uses a CPU fallback.

## Run

Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Move the pointer to shake the globe. Hold the left mouse button to turn it upside down, then release. Phones support tilt and shake over HTTPS.

Add `#debug` to the URL for **Tweakpane** controls and access to the **TSL inspector**.

```sh
npm run build
npm run preview
```

[Deployment](docs/DEPLOYMENT.md) · [Controls](docs/CONTROLS.md) · [Performance](PERFORMANCE.md)

Three.js and Tweakpane use MIT licenses. Three.js Blocks uses PolyForm Noncommercial 1.0.0. [Dependency notices](static/THIRD_PARTY_NOTICES.txt).
