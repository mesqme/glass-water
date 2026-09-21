import test from 'node:test'
import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three/webgpu'
import { PhoneMotionInput, orientationGravity, screenVector } from '../src/experience/input/PhoneMotion.js'
import { GlobeMotion } from '../src/experience/input/GlobeMotion.js'
import { updateGlobeOrientation } from '../src/experience/input/GlobeOrientation.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { sampleFlow } from '../src/experience/simulation/FlowMath.js'

const close = (actual, expected) => assert.ok(actual.distanceTo(new Vector3(...expected)) < 0.000001, `${actual.toArray()} != ${expected}`)
const camera = { quaternion: new Quaternion() }

test('phone gravity and gyro axes match portrait, landscape and inverted screens', () =>
{
    close(orientationGravity(90, 0), [0, -1, 0])
    close(orientationGravity(-90, 0), [0, 1, 0])
    close(orientationGravity(0, 0), [0, 0, -1])
    close(orientationGravity(90, 0, 90), [-1, 0, 0])
    close(screenVector(2, 0, 0, 90), [0, -2, 0])
})

test('full phone inversion converges and transforms gravity into the globe frame', () =>
{
    const settings = createSettings(), sensor = new PhoneMotionInput(settings.mobile), motion = new GlobeMotion(settings.motion)
    sensor.orientation({ beta: -90, gamma: 0 }, 0, 0)
    for(let i = 0; i < 240; i++) sensor.step(motion, camera, 1 / 60, i / 60)
    close(motion.deviceGravity, [0, 1, 0])
    const globe = new Quaternion()
    updateGlobeOrientation(motion, new Vector3(0, 0, -1), globe)
    close(new Vector3().copy(motion.gravity), [0, 1, 0])
})

test('stationary sensors and normal sensor noise inject no movement energy', () =>
{
    const settings = createSettings(), sensor = new PhoneMotionInput(settings.mobile), motion = new GlobeMotion(settings.motion)
    for(let i = 0; i < 120; i++)
    {
        sensor.orientation({ beta: 90, gamma: 0 }, 0, i / 60)
        sensor.motion({ acceleration: { x: 0.05, y: -0.03, z: 0.02 }, rotationRate: { alpha: 0.01, beta: 0.01, gamma: 0.01 } }, 0, i / 60)
        sensor.step(motion, camera, 1 / 60, i / 60); motion.step(1 / 60)
    }
    assert.equal(motion.energy, 0)
    assert.deepEqual(motion.current, { x: 0, y: 0, z: 0 })
})

test('shaking injects bounded three-axis currents; stronger shaking adds more energy', () =>
{
    const run = strength =>
    {
        const settings = createSettings(), sensor = new PhoneMotionInput(settings.mobile), motion = new GlobeMotion(settings.motion)
        for(let i = 0; i < 30; i++)
        {
            sensor.motion({ acceleration: { x: 0, y: 0, z: strength } }, 0, i / 60)
            sensor.step(motion, camera, 1 / 60, i / 60); motion.step(1 / 60)
        }
        return motion
    }
    const soft = run(2), strong = run(12), extreme = run(1e6)
    assert.ok(strong.energy > soft.energy * 4)
    assert.ok(strong.current.z > soft.current.z)
    assert.ok(extreme.energy <= 1 && Number.isFinite(extreme.energy))
    assert.ok(Math.abs(extreme.current.z) <= 1.5)
    const flow = sampleFlow(0.7, 0.6, 0.4, strong, 1, createSettings().simulation)
    assert.ok(Math.hypot(flow.x, flow.y, flow.z) > 0)
    for(let i = 0; i < 3600; i++) strong.step(1 / 60)
    assert.equal(strong.energy, 0)
})

test('gravity-only fallback has no startup shake and stale gyro readings decay to zero', () =>
{
    const settings = createSettings(), sensor = new PhoneMotionInput(settings.mobile), motion = new GlobeMotion(settings.motion)
    sensor.motion({ accelerationIncludingGravity: { x: 0, y: -9.81, z: 0 } }, 0, 0)
    sensor.step(motion, camera, 1 / 60, 0)
    assert.equal(motion.energy, 0)
    sensor.motion({ rotationRate: { alpha: 90, beta: 0, gamma: 0 } }, 0, 0.1)
    sensor.step(motion, camera, 1 / 60, 0.1)
    assert.ok(motion.deviceAngularVelocity.length() > 1)
    sensor.step(motion, camera, 1 / 60, 1)
    assert.equal(motion.deviceAngularVelocity.length(), 0)
    assert.equal(sensor.orientation({ beta: null, gamma: null }, 0, 2), false)
})

test('phone angular motion entrains water even without linear shaking', () =>
{
    const settings = createSettings(), sensor = new PhoneMotionInput(settings.mobile), motion = new GlobeMotion(settings.motion)
    sensor.motion({ rotationRate: { alpha: 120, beta: 0, gamma: 0 }, acceleration: { x: 0, y: 0, z: 0 } }, 0, 1)
    sensor.step(motion, camera, 1 / 60, 1)
    updateGlobeOrientation(motion, new Vector3(0, 0, -1), new Quaternion())
    assert.ok(motion.energy > 0)
    assert.ok(motion.angularVelocity.z > 2)
    const flowing = sampleFlow(.7, .1, .2, motion, 1, settings.simulation)
    motion.angularVelocity.z = 0
    const still = sampleFlow(.7, .1, .2, motion, 1, settings.simulation)
    assert.ok(Math.hypot(flowing.x - still.x, flowing.y - still.y, flowing.z - still.z) > .2)
})
