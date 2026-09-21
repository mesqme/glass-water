import test from 'node:test'
import assert from 'node:assert/strict'
import { createSettings, mergeSettings, upgradeSavedSettings, upgradeSavedView } from '../src/experience/config/Settings.js'
import { numberBindingOptions, roundControlValue } from '../src/experience/controls/ControlNumbers.js'

test('Snow has the requested appearance and rendering defaults', () =>
{
    const settings = createSettings()
    assert.equal(settings.preset, undefined)
    assert.equal(settings.scene.view, 'snow')
    assert.equal(settings.snow.variation, 0)
    assert.equal(settings.snow.brightness, 1.05)
    assert.equal(settings.debug.mode, 0)
    assert.equal(settings.debug.saturation, 1.5)
    assert.equal(settings.flow.saturation, 2)
    assert.equal(settings.flow.brightness, 1)
    assert.equal(settings.water.depthSoftness, 0.2)
    assert.equal(settings.water.blurDepthFalloff, 3)
    assert.equal(settings.water.clearDepth, -0.185)
    assert.equal(settings.water.thickness, 0.165)
    assert.equal(settings.glass.roughness, 0)
    assert.equal(settings.glass.envMapIntensity, 1.2)
    assert.equal(settings.ground.intensity, 0.39)
    assert.equal(settings.quality, undefined)
    assert.equal(settings.scene.antialias, true)
    assert.equal(settings.knot.material, 'glass')
})

test('restoring defaults retains live binding objects', () =>
{
    const settings = createSettings()
    const references = [settings.glass, settings.water, settings.snow, settings.knot.glass, settings.flow]
    settings.water.depthFalloff = 2.9
    settings.scene.view = 'flowParticles'
    settings.snow.brightness = 3
    settings.flow.saturation = 0
    mergeSettings(settings, createSettings())
    assert.deepEqual(settings, createSettings())
    for(const [index, object] of [settings.glass, settings.water, settings.snow, settings.knot.glass, settings.flow].entries())
        assert.equal(object, references[index])
})

test('Depth start updates once without resetting other saved Snow controls', () =>
{
    const saved = mergeSettings(createSettings(), { revision: 3, water: { clearDepth: 0, depthSoftness: 0.4 }, scene: { view: 'flow' }, flow: { saturation: 0.7 } })
    const settings = structuredClone(saved)
    upgradeSavedSettings(settings, saved)
    assert.deepEqual(settings, { ...saved, revision: 5, water: { ...saved.water, clearDepth: -0.185 }, flow: { ...saved.flow, brightness: 1, saturation: 2 } })
    settings.water.clearDepth = -0.3
    upgradeSavedSettings(settings, structuredClone(settings))
    assert.equal(settings.water.clearDepth, -0.3)
})

test('trace defaults update saved controls once while preserving other edits', () =>
{
    const saved = mergeSettings(createSettings(), { revision: 4, water: { clearDepth: -0.3 }, snow: { brightness: 0.8 }, flow: { brightness: 1.4, saturation: 1.5, count: 320 } })
    const settings = structuredClone(saved)
    upgradeSavedSettings(settings, saved)
    assert.deepEqual(settings, { ...saved, revision: 5, flow: { ...saved.flow, brightness: 1, saturation: 2 } })
    settings.flow.brightness = 0.9
    settings.flow.saturation = 0.8
    upgradeSavedSettings(settings, structuredClone(settings))
    assert.equal(settings.flow.brightness, 0.9)
    assert.equal(settings.flow.saturation, 0.8)
})

test('old presets and quality profiles migrate once to Snow; subsequent edits survive reload', () =>
{
    const saved = { revision: 2, preset: 'bw', quality: { level: 'low' }, scene: { view: 'invertedDepth', antialias: false }, water: { enabled: false }, knot: { material: 'physical' } }
    const settings = mergeSettings(createSettings(), saved)
    upgradeSavedSettings(settings, saved)
    upgradeSavedView(settings)
    assert.deepEqual(settings, createSettings())
    settings.scene.view = 'flowParticles'
    settings.scene.antialias = false
    settings.water.clearDepth = -0.25
    settings.debug.saturation = 0.7
    settings.flow.saturation = 1.2
    const edited = JSON.parse(JSON.stringify(settings))
    const restored = mergeSettings(createSettings(), edited)
    upgradeSavedSettings(restored, edited)
    upgradeSavedView(restored)
    assert.deepEqual(restored, edited)
})

test('numeric controls reach zero and preserve imported values on refresh', () =>
{
    const options = { min: 0, max: 20, step: 0.05 }
    assert.equal(roundControlValue(0, options), 0)
    assert.equal(roundControlValue(0.001, options), 0)
    assert.equal(roundControlValue(0.74999999, options), 0.75)
    const binding = numberBindingOptions(options)
    assert.equal(binding.step, undefined)
    assert.equal(binding.keyScale, 0.05)
    assert.equal(binding.format(0.75), '0.75')
})
