# Snow globe

TSL and Three.js Blocks experiment with glass, water and snow particles simulation.

## What’s interesting

- **[Three.js Blocks](https://threejs-blocks.com/):** GPU particle density solver, sphere impostors for efficient particle rendering, and glass/water transmission materials.
- **[TSL](https://threejs.org/tsl/):** custom currents, collisions, particle colors, water depth fading and Gaussian blur.

## Run

Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Move the pointer to shake the globe. Hold the left mouse button to turn it upside down. Phones support tilt and shake.

Add `#debug` to the URL for **Tweakpane** controls and access to the **TSL inspector**.

```sh
npm run build
npm run preview
```

[Deployment](docs/DEPLOYMENT.md) · [Controls](docs/CONTROLS.md) · [Performance](PERFORMANCE.md)

Three.js and Tweakpane use MIT licenses. Three.js Blocks uses PolyForm Noncommercial 1.0.0. [Dependency notices](static/THIRD_PARTY_NOTICES.txt).
