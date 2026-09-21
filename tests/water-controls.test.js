import test from 'node:test'
import assert from 'node:assert/strict'
import { DepthTexture, FloatType, HalfFloatType, Mesh, NearestFilter, PerspectiveCamera, RedFormat, RenderTarget, Scene, SphereGeometry, Texture, WebGPURenderer } from 'three/webgpu'
import { texture } from 'three/tsl'
import { MeshTransmissionNodeMaterial } from 'three-blocks/transmission'
import { WaterOptics } from '../src/experience/rendering/WaterOptics.js'
import { createSettings, mergeSettings } from '../src/experience/config/Settings.js'
import { serializeSettings } from '../src/experience/config/SettingsExport.js'

test('depth and blur edits reach the live shader without replacing its backdrop', () =>
{
    const settings = createSettings(), target = new RenderTarget()
    const optics = new WaterOptics(texture(new Texture()), new DepthTexture(), new Texture(), settings, target)
    const backdrop = optics.buffer
    Object.assign(settings.water, {
        clearDepth: -0.6, depthEnd: 1.7, depthCurve: 'smoothstep', fadeStrength: 0.4,
        depthFalloff: 2, depthSoftness: 0, blurDepthFalloff: 1.8,
        fadeColor: '#abcdef', depthPreview: 'mapped'
    })
    settings.scene.view = 'depth'
    optics.configure(true)
    for(const [key, expected] of Object.entries({
        clearDepth: -0.6, depthEnd: 1.7, curve: 1, strength: 0.4, falloff: 2,
        softness: 0, blurFalloff: 1.8, preview: 2, layered: 1
    })) assert.equal(optics.u[key].value, expected, key)
    assert.equal(optics.buffer, backdrop, 'live edits keep the compiled graph')
    assert.equal(optics.buffer.value, target.texture, 'the existing target is reused')
    assert.equal(optics.u.fade.value.getHexString(), 'abcdef')
    settings.water.depthCurve = 'linear'
    settings.water.depthEnd = -0.8
    optics.configure(false)
    assert.equal(optics.u.curve.value, 0)
    assert.ok(optics.u.depthEnd.value > optics.u.clearDepth.value, 'crossed depth endpoints stay finite')
    assert.equal(optics.u.layered.value, 0)
    optics.dispose(); target.dispose()
})

test('old controls keep their values and new water controls survive export/import', () =>
{
    const settings = mergeSettings(createSettings(), { water: { clearDepth: 0.4, depthSoftness: 1.2, clarityDistance: 12 } })
    assert.equal(settings.water.clarityDistance, undefined)
    assert.equal(settings.water.clearDepth, 0.4)
    assert.equal(settings.water.depthSoftness, 1.2)
    Object.assign(settings.water, { depthEnd: 2.1, depthCurve: 'smoothstep', fadeColor: '#123456', fadeStrength: 2, blurDepthFalloff: 2 })
    const exported = JSON.parse(serializeSettings(settings))
    assert.deepEqual(mergeSettings(createSettings(), exported.settings).water, settings.water)
})

for(const forceWebGL of [false, true]) test(`water depth and Blocks transmission stay separate in ${forceWebGL ? 'GLSL' : 'WGSL'}`, () =>
{
    // Offline TSL graph check, not a GPU or visual validation. Use the bundled
    // builder to share Three's TSL stack with the material and its dependencies.
    const renderer = new WebGPURenderer({ forceWebGL, canvas: { width: 1280, height: 720, style: {} } })
    renderer.hasFeature = () => false
    renderer.backend.renderer = renderer
    if(forceWebGL) renderer.backend.extensions = { has: () => false }
    const source = new Texture({ width: 1280, height: 720 })
    source.type = HalfFloatType
    const material = new MeshTransmissionNodeMaterial({ samples: 1, transmission: 1, dispersion: 0.1 })
    const settings = createSettings()
    const knotDepth = new Texture({ width: 1280, height: 720 })
    Object.assign(knotDepth, { type: FloatType, format: RedFormat, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false })
    const target = new RenderTarget(1280, 720, { type: HalfFloatType, generateMipmaps: true, depthBuffer: false })
    const optics = new WaterOptics(texture(source), new DepthTexture(1280, 720), knotDepth, settings, target)
    optics.configure(true)
    material.viewportBuffer = optics.buffer
    const geometry = new SphereGeometry()
    const builder = renderer.backend.createNodeBuilder(new Mesh(geometry, material), renderer)
    builder.scene = new Scene()
    builder.camera = new PerspectiveCamera()
    builder.build()
    const depthLoads = forceWebGL ? /texelFetch\(/g : /textureLoad\(/g
    assert.equal((builder.fragmentShader.match(depthLoads) ?? []).length, 0, 'transmission only samples the processed color texture')
    assert.ok(builder.fragmentShader.length < 100000, 'depth and blur cannot expand once per transmission sample')
    assert.ok(!/\b(NaN|Infinity|undefined)\b/.test(builder.fragmentShader), 'shader contains no invalid constants')
    const image = renderer.backend.createNodeBuilder(optics.mesh, renderer)
    image.scene = optics.scene; image.camera = builder.camera
    image.build()
    assert.equal((image.fragmentShader.match(forceWebGL ? /textureLod\(/g : /textureSampleLevel\(/g) ?? []).length, 10, 'one direct sample and nine Gaussian taps')
    assert.equal((image.fragmentShader.match(depthLoads) ?? []).length, 2, 'opaque and knot depth are loaded once each')
    assert.ok(image.fragmentShader.length < 25000, 'water processing remains a small independent shader')
    material.dispose(); geometry.dispose(); source.dispose(); knotDepth.dispose(); optics.dispose(); target.dispose()
})

test('water image rendering follows the globe and restores renderer state without owning its shared target', () =>
{
    const target = new RenderTarget(), previousTarget = new RenderTarget(), camera = new PerspectiveCamera()
    const optics = new WaterOptics(texture(new Texture()), new DepthTexture(), new Texture(), createSettings(), target)
    const water = new Mesh()
    water.position.set(0.2, 1.7, -0.3)
    water.rotation.set(0.4, 0.2, 0.1)
    let currentTarget = previousTarget, renders = 0, released = false
    target.addEventListener('dispose', () => { released = true })
    const renderer = {
        autoClear: false,
        getRenderTarget: () => currentTarget,
        setRenderTarget: value => { currentTarget = value },
        render: (scene, actualCamera) => {
            assert.equal(actualCamera, camera)
            assert.equal(scene, optics.scene)
            assert.equal(currentTarget, target)
            assert.equal(renderer.autoClear, true)
            assert.deepEqual(optics.mesh.matrix.elements, water.matrixWorld.elements)
            renders++
        }
    }
    optics.render(renderer, camera, water)
    assert.equal(renders, 1)
    assert.equal(currentTarget, previousTarget)
    assert.equal(renderer.autoClear, false)
    renderer.render = () => { throw new Error('test failure') }
    assert.throws(() => optics.render(renderer, camera, water), /test failure/)
    assert.equal(currentTarget, previousTarget)
    assert.equal(renderer.autoClear, false)
    optics.dispose()
    assert.equal(released, false, 'knot refraction owns and releases the shared texture')
    target.dispose(); previousTarget.dispose()
})
