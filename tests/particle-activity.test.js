import test from 'node:test'
import assert from 'node:assert/strict'
import { BufferGeometry, WebGPURenderer } from 'three/webgpu'
import { Fn, instancedArray, vec3 } from 'three/tsl'
import { createActivityState, updateActivityState, ParticleActivity } from '../src/experience/rendering/ParticleActivity.js'
import { FlowHistory } from '../src/experience/rendering/FlowHistory.js'
import { createSettings } from '../src/experience/config/Settings.js'

const config = createSettings().activity
test('GPU history dispatch includes displacement tracking and writes the activity buffer', () =>
{
    const renderer = new WebGPURenderer({ canvas: { width: 1, height: 1, style: {} } })
    renderer.hasFeature = () => false; renderer.backend.renderer = renderer
    const positions = new Float32Array([0, 0, 0]), geometry = new BufferGeometry()
    const solver = { positions: instancedArray(positions, 'vec3'), velocities: instancedArray(1, 'vec3') }
    const activity = new ParticleActivity(solver, true, geometry, positions, config)
    const flow = { settings: createSettings(), sample: Fn(() => vec3(0)) }
    const history = new FlowHistory(solver, true, geometry, flow, 1, null, activity)
    const builder = renderer.backend.createNodeBuilder(history.capture, renderer)
    builder.build()
    assert.match(builder.computeShader, /\.w\s*=\s*mix\(/, 'nested tracking Fn must execute as a void statement, not be discarded')
    activity.dispose(); history.dispose(); solver.positions.dispose(); solver.velocities.dispose(); geometry.dispose()
})

test('stationary and sub-pixel contact jitter stay dark despite solver velocity spikes', () =>
{
    const positions = new Float32Array([0, 0, 0]), state = createActivityState(positions)
    for(let i = 0; i < 240; i++)
    {
        positions[0] = i % 2 ? 0.001 : -0.001
        updateActivityState(state, positions, 1 / 60, config)
    }
    assert.equal(state[3], 0)
    const geometry = new BufferGeometry()
    const solver = { positions, velocities: new Float32Array([20, 0, 0]), sleeping: false }
    const activity = new ParticleActivity(solver, false, geometry, positions, config)
    for(let i = 0; i < 120; i++) { solver.velocities[0] = i % 2 ? 20 : 0; activity.update(1 / 60) }
    assert.equal(activity.values[3], 0, 'constrained impulses cannot brighten a motionless ball')
    geometry.dispose()
})

test('measured activity follows actual travel speed across frame rates and fades after stopping', () =>
{
    for(const fps of [30, 60, 120]) for(const speed of [0.2, 0.8])
    {
        const positions = new Float32Array([0, 0, 0]), state = createActivityState(positions)
        for(let i = 1; i <= fps * 3; i++)
        {
            positions[0] = i / fps * speed
            updateActivityState(state, positions, 1 / fps, config)
        }
        assert.ok(Math.abs(state[3] - speed) < 0.001, `${fps} fps, speed ${speed}`)
        let previous = state[3]
        for(let i = 0; i < fps * 2; i++)
        {
            updateActivityState(state, positions, 1 / fps, config)
            assert.ok(state[3] <= previous + 0.000001, 'no rebrightening on a stopped particle')
            previous = state[3]
        }
        assert.ok(state[3] < 0.001)
    }
})

test('sleep fades activity without touching buffers and wake does not resurrect old speed', () =>
{
    const geometry = new BufferGeometry(), solver = { positions: new Float32Array([0, 0, 0]), sleeping: false }
    const activity = new ParticleActivity(solver, false, geometry, solver.positions, config)
    for(let i = 0; i < 120; i++) { solver.positions[0] += 0.01; activity.update(1 / 60) }
    const before = activity.values.slice(), version = activity.buffer.version
    solver.sleeping = true
    for(let i = 0; i < 120; i++) activity.update(1 / 60)
    assert.deepEqual(activity.values, before)
    assert.equal(activity.buffer.version, version)
    assert.equal(activity.fade.value, 0)
    solver.sleeping = false; activity.update(1 / 60)
    assert.equal(activity.values[3], 0)
    geometry.dispose()
})
