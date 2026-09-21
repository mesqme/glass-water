import test from 'node:test'
import assert from 'node:assert/strict'
import { DepthTexture, Group } from 'three/webgpu'
import { createSettings, mergeSettings, upgradeSavedView, VIEW_OPTIONS } from '../src/experience/config/Settings.js'
import { Snow } from '../src/experience/rendering/Snow.js'
import { FlowDebug } from '../src/experience/rendering/FlowDebug.js'

test('the CPU fallback retains the full requested particle count', () =>
{
    const settings = createSettings()
    const snow = new Snow(new Group(), { backend: { isWebGPUBackend: false } }, settings, { settings })
    assert.equal(snow.count, 12288)
    assert.equal(snow.solver.positions.length, settings.snow.count * 3)
    snow.dispose()
})

test('particle view changes retain simulation state and select their own shading', () =>
{
    const settings = createSettings()
    settings.snow.count = 8
    const snow = new Snow(new Group(), { backend: { isWebGPUBackend: false } }, settings, { settings })
    const solver = snow.solver, positions = solver.positions.slice()
    for(const view of ['snow', 'flowParticles', 'flow', 'depth', 'activity', 'snow'])
    {
        settings.scene.view = view
        settings.snow.brightness = 0.75
        snow.configureMaterial()
        const expected = view === 'activity' ? snow.activityMaterial : snow.basicMaterial
        assert.equal(snow.mesh.material, expected)
        assert.equal(snow.debugEnabled, view === 'flowParticles')
        assert.equal(settings.debug.mode, 0, 'view changes preserve the Snow color preference')
        assert.equal(snow.brightness.value, 0.75)
        assert.equal(snow.solver, solver)
        assert.deepEqual(solver.positions, positions)
    }
    assert.equal(snow.standardMaterial, undefined)
    assert.equal(snow.fresnelMaterial, undefined)
    snow.dispose()
})

test('views follow the requested order and color source remains editable in Snow', () =>
{
    assert.deepEqual(Object.keys(VIEW_OPTIONS), ['Snow', 'Flow particles', 'Flow trace', 'Depth', 'Activity'])
    const settings = createSettings()
    settings.snow.count = 8
    const snow = new Snow(new Group(), { backend: { isWebGPUBackend: false } }, settings, { settings })
    settings.debug.mode = 1
    snow.configureDebug()
    assert.equal(snow.debugEnabled, true)
    settings.debug.mode = 0
    snow.configureDebug()
    assert.equal(snow.debugEnabled, false)
    assert.equal(snow.invertedDepthMaterial, undefined)
    snow.dispose()
})

test('flow trace saturation updates independently of the particle palette', () =>
{
    const settings = createSettings(), depth = new DepthTexture()
    settings.debug.saturation = 1.1
    const flow = new FlowDebug(settings, { inside: new Group() }, depth)
    settings.flow.saturation = 0
    flow.configure()
    assert.equal(flow.palette.saturation.value, 0)
    assert.equal(settings.debug.saturation, 1.1)
    settings.flow.saturation = 1.7
    flow.configure()
    assert.equal(flow.palette.saturation.value, 1.7)
    flow.dispose(); depth.dispose()
})

test('removed views, materials, and collision multiplier migrate to the current controls', () =>
{
    const settings = mergeSettings(createSettings(), { preset: 'druken_settings', scene: { view: 'simple' }, snow: { material: 'standard', collisionScale: 1.8 }, simple: { color: '#ff0000' } })
    upgradeSavedView(settings)
    assert.equal(settings.scene.view, 'snow')
    assert.equal(settings.preset, undefined)
    assert.equal(settings.snow.collisionScale, undefined)
    assert.equal(settings.snow.material, undefined)
    assert.equal(settings.simple, undefined)
    assert.equal(settings.water.depthSoftness, 0.2)
    assert.equal(settings.water.blurDepthFalloff, 3)
})

test('Flow overlay follows the globe without entering the refraction source or removing its model', () =>
{
    const inside = new Group(), model = new Group()
    inside.add(model)
    const depth = new DepthTexture(), flow = new FlowDebug(createSettings(), { inside }, depth)
    assert.equal(flow.root.parent, flow.scene)
    assert.deepEqual(inside.children, [model], 'traces are excluded from the optical source')
    assert.equal(flow.root.children.length, 1, 'no replacement wireframe globe or particle clone')
    inside.position.set(1, 2, 3)
    inside.rotation.set(0.3, 0.7, 1.2)
    const renderer = { autoClear: true, render(scene)
    {
        assert.equal(this.autoClear, false, 'preserve the completed globe image')
        assert.equal(scene, flow.scene)
    } }
    flow.render(renderer, {})
    assert.equal(renderer.autoClear, true)
    assert.deepEqual(flow.root.matrix.elements, inside.matrixWorld.elements)
    flow.dispose()
    depth.dispose()
    assert.deepEqual(inside.children, [model])
})
