import test from 'node:test'
import assert from 'node:assert/strict'
import { MeshPhysicalNodeMaterial, Texture } from 'three/webgpu'
import { applyMaterialSettings, applyMaterialEnvironment } from '../src/experience/rendering/MaterialSettings.js'
import { sampleFlow } from '../src/experience/simulation/FlowMath.js'
import { rememberVector } from '../src/experience/rendering/FlowHistoryMath.js'
import { setKnotPose } from '../src/experience/simulation/KnotShape.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { integrateSnow } from '../src/experience/simulation/SnowPhysics.js'

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]

test('material edits preserve Color objects; environment strengths compose', () =>
{
    const material = new MeshPhysicalNodeMaterial(), environment = new Texture()
    const tint = material.color
    applyMaterialSettings(material, { color: '#abcdef', roughness: 0.4 })
    assert.equal(material.color, tint)
    assert.equal(material.color.getHexString(), 'abcdef')
    assert.equal(material.roughness, 0.4)
    applyMaterialEnvironment(material, environment, 0.5, 3)
    assert.equal(material.envMap, environment)
    assert.equal(material.envMapIntensity, 1.5)
    applyMaterialEnvironment(material, environment, 0.5, 0)
    assert.equal(material.envMapIntensity, 0)
})

test('calm particles retain color even when a nearby current changes direction', () =>
{
    const history = new Float32Array([0.4, -0.2, 0.1]), before = history.slice()
    for(let i = 0; i < 300; i++) rememberVector(history, 0, Math.sin(i), Math.cos(i), 0.3, 0.04, 0.1)
    assert.deepEqual(history, before)
    rememberVector(history, 0, -0.4, 0.3, 0.1, 0.5, 0.1)
    assert.notDeepEqual(history, before)
    assert.ok(history[0] > 0, 'waking blends instead of snapping to the opposite direction')
})

test('current strength and turbulence control the motor-driven water as well as shaking', () =>
{
    const config = createSettings().simulation, motion = { energy: 0, current: { x: 0, y: 0 } }
    try
    {
        setKnotPose(identity, 1, { x: 0, y: 1, z: 1 })
        const flow = strength => sampleFlow(0.5, 0.3, 0.2, motion, 1, { ...config, currentStrength: strength })
        const zero = flow(0), one = flow(1), two = flow(2)
        assert.equal(Math.hypot(zero.x, zero.y, zero.z), 0)
        assert.ok(Math.hypot(one.x, one.y, one.z) > 0.01)
        for(const key of ['x', 'y', 'z']) assert.ok(Math.abs(two[key] - one[key] * 2) < 1e-8)
        const still = sampleFlow(0.5, 0.3, 0.2, motion, 1, { ...config, knotStirring: 0 })
        assert.equal(Math.hypot(still.x, still.y, still.z), 0)
        const smooth = sampleFlow(0.5, 0.3, 0.2, motion, 1, { ...config, turbulence: 0 })
        assert.ok(Math.hypot(one.x - smooth.x, one.y - smooth.y, one.z - smooth.z) > 0.01)
    }
    finally { setKnotPose(identity, 1, { x: 0, y: 0, z: 0 }) }
})

test('fall, drag, inertia, and speed limit change particle motion measurably', () =>
{
    const motion = { energy: 0, current: { x: 0, y: 0 } }
    const run = values =>
    {
        const p = new Float32Array([0, 1.2, 0]), v = new Float32Array(3)
        for(let i = 0; i < 30; i++) integrateSnow(p, v, motion, i / 60, 1 / 60, { ...createSettings().simulation, fallSpeed: 0.24, drag: 3.4, inertia: 1.35, ...values })
        return Math.abs(v[1])
    }
    assert.ok(run({fallSpeed: 0.8}) > run({fallSpeed: 0.1}) * 4)
    assert.ok(run({drag: 8}) > run({drag: 0.5}) * 3)
    assert.ok(run({inertia: 0.5}) > run({inertia: 3}) * 2)
    assert.ok(run({fallSpeed: 0.8, maxSpeed: 0.05}) <= 0.050001)
})
