import test from 'node:test'
import assert from 'node:assert/strict'
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three'
import { KnotMotion } from '../src/experience/input/KnotMotion.js'
import { knotPose, knotSurface, KNOT, setKnotPose } from '../src/experience/simulation/KnotShape.js'
import { CPUSnowSolver } from '../src/experience/simulation/CPUSnowSolver.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { makeSnowSeeds, GLOBE } from '../src/experience/simulation/SnowPhysics.js'
import { serializeSettings } from '../src/experience/config/SettingsExport.js'

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const restorePose = () => setKnotPose(identity, 1, { x: 0, y: 0, z: 0 })

test('rotation honors axis switches and speed, and can stop without resetting the pose', () =>
{
    try
    {
        const motion = new KnotMotion(), config = createSettings().knot
        Object.assign(config, { autoRotate: true, axisX: true, axisY: false, axisZ: false, speed: 30 })
        for(let frame = 0; frame < 60; frame++) motion.update(config, 1 / 60)
        assert.ok(motion.quaternion.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6)) < 0.000001)
        const snapshot = motion.quaternion.clone()
        config.axisX = false
        motion.update(config, 1)
        assert.deepEqual(motion.quaternion, snapshot)
        assert.equal(knotPose.moving, false)
        config.axisZ = true; config.speed = -20
        motion.update(config, 0.5)
        assert.ok(motion.quaternion.angleTo(snapshot) > 0.1)
        config.autoRotate = false
        const stopped = motion.quaternion.clone()
        motion.update(config, 1)
        assert.deepEqual(motion.quaternion, stopped)
    }
    finally { restorePose() }
})

test('rotated and scaled collisions follow the visible knot and preserve its openings', () =>
{
    try
    {
        const point = new Vector3(0.48, 0.42, 0.17)
        const original = knotSurface(point.x, point.y, point.z)
        assert.ok(knotSurface(0, KNOT.offsetY, 0).distance > 0.1, 'open central passage')
        const rotation = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.2)))
        const scale = 0.65
        setKnotPose(rotation.elements, scale, { x: 0, y: 0, z: 0 })
        point.y -= KNOT.offsetY
        point.multiplyScalar(scale).applyMatrix3(rotation)
        point.y += KNOT.offsetY
        const transformed = knotSurface(point.x, point.y, point.z)
        const normal = new Vector3(original.x, original.y, original.z).applyMatrix3(rotation)
        assert.ok(Math.abs(transformed.distance - original.distance * scale) < 0.000001)
        assert.ok(normal.distanceTo(new Vector3(transformed.x, transformed.y, transformed.z)) < 0.000001)
    }
    finally { restorePose() }
})

test('a rotating knot wakes resting flakes and keeps contacts finite and confined', () =>
{
    try
    {
        const config = createSettings(), motion = new KnotMotion()
        const solver = new CPUSnowSolver(makeSnowSeeds(120), config)
        const water = { energy: 0, current: { x: 0, y: 0 } }
        for(let frame = 0; frame < 2000 && !solver.sleeping; frame++) solver.update(water, frame / 60, 1 / 60)
        assert.equal(solver.sleeping, true)
        Object.assign(config.knot, { autoRotate: true, axisX: true, axisZ: true, speed: 90, scale: 1.05 })
        for(let frame = 0; frame < 360; frame++)
        {
            motion.update(config.knot, 1 / 60)
            solver.update(water, frame / 60, 1 / 60)
            assert.equal(solver.sleeping, false)
            for(let i = 0; i < solver.positions.length; i += 3)
            {
                const [x, y, z] = solver.positions.slice(i, i + 3)
                assert.ok(Number.isFinite(x + y + z))
                assert.ok(Math.hypot(x, y, z) < GLOBE.innerRadius)
                assert.ok(knotSurface(x, y, z).distance > solver.radius - 0.001)
            }
        }
        config.knot.autoRotate = false
        motion.update(config.knot, 1 / 60)
        for(let frame = 0; frame < 2400 && !solver.sleeping; frame++) solver.update(water, 6 + frame / 60, 1 / 60)
        assert.equal(solver.sleeping, true, 'stopping the motor allows sleep again')
    }
    finally { restorePose() }
})

test('controls export includes every setting, nested materials, saturation, and axis choices', () =>
{
    const settings = createSettings()
    settings.knot.material = 'glass'; settings.knot.axisZ = true
    settings.knot.glass.attenuationColor = '#123456'; settings.debug.saturation = 0.7
    const exported = JSON.parse(serializeSettings(settings, new Date('2026-09-16T00:00:00Z')))
    assert.equal(exported.format, 'snow-globe-controls')
    assert.equal(exported.version, 1)
    assert.deepEqual(exported.settings, settings)
    assert.equal(exported.exportedAt, '2026-09-16T00:00:00.000Z')
})
