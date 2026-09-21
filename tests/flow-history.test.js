import test from 'node:test'
import assert from 'node:assert/strict'
import { updateFlowHistory } from '../src/experience/rendering/FlowHistoryMath.js'
import { createSettings, mergeSettings } from '../src/experience/config/Settings.js'
import { CPUSnowSolver } from '../src/experience/simulation/CPUSnowSolver.js'
import { makeSnowSeeds } from '../src/experience/simulation/SnowPhysics.js'
import controls from '../src/experience/config/defaults.json' with { type: 'json' }

test('the exported controls become defaults and newer controls survive merging saved settings', () =>
{
    const settings = createSettings()
    const check = (actual, expected) =>
    {
        for(const [key, value] of Object.entries(expected))
            if(value && typeof value === 'object') check(actual[key], value)
            else assert.equal(actual[key], value, key)
    }
    const expected = structuredClone(controls)
    delete expected.lights; delete expected.lighting
    check(settings, expected)
    assert.equal(settings.debug.mode, 0)
    mergeSettings(settings, { glass: { roughness: 0.4 }, snow: { brightness: 1.4 } })
    assert.equal(settings.glass.roughness, 0.4)
    assert.equal(settings.snow.brightness, 1.4)
    assert.equal(settings.glass.samples, 1)
})

test('zero current, cleared velocity, and individual sleep retain the previous visible vectors', () =>
{
    const config = createSettings().simulation, history = new Float32Array(6)
    const solver = { positions: new Float32Array([-.4, 0, .3, .4, 0, -.3]), velocities: new Float32Array([.2, -.3, .1, -.1, .3, .4]), ages: new Float32Array(2), sleeping: false }
    const motion = { energy: .5, current: { x: .4, y: -.2 } }
    updateFlowHistory(history, solver, motion, 1, config)
    const previous = history.slice()
    motion.energy = 0; solver.velocities.fill(0)
    updateFlowHistory(history, solver, motion, 2, config)
    assert.deepEqual(history, previous)
    solver.ages[0] = 10
    motion.energy = 1; solver.velocities.fill(.8)
    updateFlowHistory(history, solver, motion, 3, config)
    assert.deepEqual(history.slice(0, 3), previous.slice(0, 3), 'sleeping particle preserves its water color')
    assert.notDeepEqual(history.slice(3), previous.slice(3), 'awake particle still updates')
    solver.ages.fill(0)
    updateFlowHistory(history, solver, motion, 4, config)
    assert.notDeepEqual(history.slice(0, 3), previous.slice(0, 3), 'wake resumes color tracking')
})

test('a complete settling simulation freezes its color history before the sleep transition clears velocity', () =>
{
    const settings = createSettings(), solver = new CPUSnowSolver(makeSnowSeeds(80), settings)
    const history = new Float32Array(80 * 3), motion = { energy: .2, current: { x: .3, y: .2 } }
    let beforeSleep
    for(let frame = 0; frame < 2400 && !solver.sleeping; frame++)
    {
        beforeSleep = history.slice()
        motion.energy = frame < 60 ? .2 : 0
        solver.update(motion, frame / 60, 1 / 60)
        updateFlowHistory(history, solver, motion, frame / 60, settings.simulation)
    }
    assert.equal(solver.sleeping, true)
    assert.deepEqual(history, beforeSleep)
    assert.ok(history.some(value => value !== 0))
    updateFlowHistory(history, solver, { energy: 0, current: { x: 0, y: 0 } }, 200, settings.simulation)
    assert.deepEqual(history, beforeSleep)
})
