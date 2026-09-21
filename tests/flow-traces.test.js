import test from 'node:test'
import assert from 'node:assert/strict'
import { makeFlowSeeds, traceFlow, TRACE_SEGMENTS, insideFlowVolume } from '../src/experience/rendering/FlowTraces.js'
import { sampleFlow } from '../src/experience/simulation/FlowMath.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { setKnotPose } from '../src/experience/simulation/KnotShape.js'

const buffers = count => [new Float32Array(count * TRACE_SEGMENTS * 6), new Float32Array(count * TRACE_SEGMENTS * 6)]

test('streamline travel length and direction follow the sampled velocity', () =>
{
    const [positions, velocities] = buffers(1)
    traceFlow(new Float32Array([0, 0, 0]), {}, 0, {}, { duration: 0.8, slice: 'all' }, positions, velocities,
        (x, y, z, motion, time, simulation, out) => Object.assign(out, { x: 2, y: 0, z: 0 }), () => true)
    assert.ok(Math.abs(positions.at(-3) - 1.6) < 1e-6)
    assert.equal(positions.at(-2), 0)
    assert.equal(velocities.at(-3), 2)
    for(let i = 6; i < positions.length; i += 6) assert.equal(positions[i], positions[i - 3], 'segments join continuously')
})

test('a blocked or zero-speed trace has no spurious energy or wraparound streak', () =>
{
    const [positions, velocities] = buffers(1)
    traceFlow(new Float32Array([0, 0, 0]), {}, 0, {}, { duration: 1, slice: 'all' }, positions, velocities,
        (x, y, z, motion, time, simulation, out) => Object.assign(out, { x: 1, y: 0, z: 0 }), x => x < 0.3)
    assert.ok(positions.every(value => value <= 0.3))
    assert.equal(velocities.at(-3), 0)
    traceFlow(new Float32Array([0, 0, 0]), {}, 0, {}, { duration: 1, slice: 'all' }, positions, velocities,
        (x, y, z, motion, time, simulation, out) => Object.assign(out, { x: 0, y: 0, z: 0 }), () => true)
    assert.ok(positions.every(value => value === 0))
    assert.ok(velocities.every(value => value === 0))
})

test('sliced traces stay in the requested slab and inside the globe obstacles', () =>
{
    const settings = createSettings(), config = { ...settings.flow, slice: 'xy', offset: 0.3, width: 0.4 }
    const seeds = makeFlowSeeds(96, config), [positions, velocities] = buffers(96)
    const motion = { energy: 0.8, current: { x: 1, y: -0.5, z: 0.2 } }
    traceFlow(seeds, motion, 1, settings.simulation, config, positions, velocities)
    for(let i = 0; i < positions.length; i += 3)
    {
        assert.ok(Number.isFinite(positions[i]))
        if(Math.hypot(...velocities.subarray(i, i + 3)) < 1e-5) continue
        assert.ok(Math.abs(positions[i + 2] - config.offset) <= config.width / 2 + 1e-6)
        assert.ok(insideFlowVolume(...positions.subarray(i, i + 3)))
    }
})

test('live field traces react to current strength and disappear when every drive is off', () =>
{
    setKnotPose([1, 0, 0, 0, 1, 0, 0, 0, 1], 1, { x: 0, y: 0, z: 0 })
    const settings = createSettings(), seeds = makeFlowSeeds(24, settings.flow), [positions, velocities] = buffers(24)
    const motion = { energy: 0.6, current: { x: 1, y: 0, z: 0 } }
    traceFlow(seeds, motion, 1, settings.simulation, settings.flow, positions, velocities)
    assert.ok(velocities.some(value => Math.abs(value) > 0.1))
    settings.simulation.currentStrength = 0
    traceFlow(seeds, motion, 1, settings.simulation, settings.flow, positions, velocities)
    assert.ok(velocities.every(value => value === 0))
    settings.simulation.currentStrength = 1
    motion.energy = 0
    traceFlow(seeds, motion, 1, settings.simulation, settings.flow, positions, velocities, sampleFlow)
    assert.ok(velocities.every(value => value === 0), 'debug has no color-freeze history or autonomous motion')
})
