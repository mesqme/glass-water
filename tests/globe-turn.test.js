import test from 'node:test'
import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three/webgpu'
import { GlobeMotion } from '../src/experience/input/GlobeMotion.js'
import { updateGlobeOrientation } from '../src/experience/input/GlobeOrientation.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { CPUSnowSolver } from '../src/experience/simulation/CPUSnowSolver.js'
import { integrateSnow, GLOBE } from '../src/experience/simulation/SnowPhysics.js'

test('left-button hold reaches upside down; release overshoots elastically and settles', () =>
{
    const motion = new GlobeMotion(createSettings().motion)
    motion.setTurning(true)
    for(let i = 0; i < 720; i++) motion.step(1 / 120)
    assert.ok(Math.abs(motion.roll - Math.PI) < 0.001)
    assert.ok(motion.energy > 0)
    motion.setTurning(false)
    let minimum = 0
    for(let i = 0; i < 1200; i++) { motion.step(1 / 120); minimum = Math.min(minimum, motion.roll) }
    assert.ok(minimum < -0.05, 'spring visibly overshoots upright')
    assert.equal(motion.roll, 0)
    assert.equal(motion.rollVelocity, 0)
    assert.equal(motion.rotating, false)
    motion.settings.holdRotation = false
    motion.setTurning(true)
    motion.step(1 / 30)
    assert.equal(motion.roll, 0)
})

test('clockwise camera rotation keeps gravity pointing down in the world', () =>
{
    const motion = new GlobeMotion(), rotation = new Quaternion(), axis = new Vector3(0, 0, -1)
    motion.roll = Math.PI / 2
    updateGlobeOrientation(motion, axis, rotation)
    assert.ok(new Vector3(0, 1, 0).applyQuaternion(rotation).distanceTo(new Vector3(1, 0, 0)) < 1e-9)
    for(const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.2])
    {
        motion.roll = angle
        updateGlobeOrientation(motion, axis, rotation)
        assert.ok(new Vector3().copy(motion.gravity).applyQuaternion(rotation).distanceTo(new Vector3(0, -1, 0)) < 1e-9)
    }
    motion.roll = Math.PI
    updateGlobeOrientation(motion, axis, rotation)
    assert.ok(motion.gravity.y > 0.999)
})

test('inverted snow rises in local coordinates and can sleep against the opposite wall', () =>
{
    const config = createSettings(), motion = { energy: 0, current: { x: 0, y: 0 }, gravity: { x: 0, y: 1, z: 0 } }
    const p = new Float32Array([0, 0.9, 0]), v = new Float32Array(3)
    integrateSnow(p, v, motion, 0, 1 / 30, config.simulation)
    assert.ok(v[1] > 0)
    assert.ok(p[1] > 0.9)
    const solver = new CPUSnowSolver(new Float32Array([0, GLOBE.innerRadius - config.snow.radius, 0]), config)
    for(let i = 0; i < 600; i++) solver.update(motion, i / 60, 1 / 60)
    assert.equal(solver.sleeping, true)
    assert.ok(solver.positions[1] > 1.4, 'snow rests on the inverted sphere, not its original floor')
    const snapshot = solver.positions.slice()
    for(let i = 0; i < 120; i++) solver.update(motion, 10 + i / 60, 1 / 60)
    assert.deepEqual(solver.positions, snapshot)
})
