# Performance

## Current rendering budget

The largest repeated workloads are the Blocks neighbor/density solver and per-pixel transmission. Their relative cost depends on the GPU, resolution, materials and how many simulation steps run per rendered frame.

| Work | Snow defaults |
| --- | --- |
| PBF | 12,288 particles, 2 iterations, 60 Hz |
| Pixel ratio / MSAA | 1.5 / 4× |
| Knot optics | One depth draw, one glass draw, backdrop copy |
| Water optics | One depth/blur image draw, then Blocks refraction |
| Outer glass | Color reflection, coating and chromatic settings |
| Flow trace | 192 traces by default |

Rendering controls remain editable under `#debug`. Phones use the same Snow defaults and full particle count. The WebGL fallback also retains the full count; use trusted HTTPS to make WebGPU available on supported phones. One-layer knot transmission does not resolve multiple glass tubes overlapping in depth. This is an intentional quality/cost tradeoff.

Water depth and Gaussian filtering run once per image pixel, before refraction. The image pass has ten color reads (one sharp, nine Gaussian) and two depth loads. It reuses the knot backdrop after the knot has finished reading it, adding one draw and mipmap generation without allocating another full-size target. Turning off Depth effect skips this pass. Depth view uses only the depth graph.

This separation replaces the old nested shader, which expanded depth/blur inside every Blocks sample. An offline graph check reduced the generated GLSL from about 349 KB to 60 KB across the two shaders (without environment lighting). This measures shader complexity, not device frame rate. The user confirmed that the full scene renders on iOS after this change; device performance still needs measurement.

## Conditional work

- **Flow trace view:** creates trace geometry on first use and samples CPU streamlines at 12 Hz only while displayed, interpolates positions and animates highlights with TSL. It reuses the field math without particle readbacks or volume textures. One line draw overlays the finished globe before tone mapping, reusing the existing interior depth for occlusion. This needs no extra render target and keeps lines free of refraction and blur. The existing particle mesh can be shown alongside the traces. Actual physics still runs.
- **Color history:** one remembered water vector per particle; the removed particle-direction option no longer allocates or updates a second vector. The palette is fixed; materials have no thin-film layer.
- **Activity:** one vec4 per particle tracks actual displacement inside the existing color-history dispatch. No extra compute submission. The existing output pass makes the image monochrome.
- **Sleep:** solver/history updates stop when the whole system settles. The default rotating knot is an active motor; switch it off to evaluate sleep.
- **Debug panel:** Tweakpane is imported only at `#debug` and disposed when the hash is removed. No control-layout editor or hidden control registration runs in the main experience.
- **Phone input:** filtered CPU sensor values update the existing current/gravity uniforms.
- **Reflection environment:** baked once at startup. Ambient illumination uses a ground-only TSL light node.
- **Inspector:** dynamically imported only when requested.

View changes preserve particle state. Reset snow, restoring defaults and changing particle count restart the startup flow.

## Measure on the target device

1. Open **Performance → Open TSL inspector**.
2. Choose a view and rendering settings; let shader compilation finish.
3. Press **Capture 180 frames**.
4. Repeat with the same viewport and motion. Record count, DPR, MSAA, frequency and material edits.

Inspector mode disables adaptive resolution. Use `?defaults=1&inspect=1#debug` for the default appearance, then set Pixel ratio and Depth softness in the panel for controlled comparisons.

The integration awaits asynchronous simulation and labels pass timings. A profiling-only r185 shim fixes timestamp IDs for batched compute arrays. Summed pass GPU times are not GPU wall-clock frame times, and copies/mipmap generation are not separate rows. If timestamp queries are unavailable, reports mark GPU timings unavailable rather than substituting CPU timings.

No low-end PC or physical-phone frame-rate guarantee has been established.
