import test from 'node:test'
import assert from 'node:assert/strict'
import { GlobeMotion } from '../src/experience/input/GlobeMotion.js'
import { CPUSnowSolver } from '../src/experience/simulation/CPUSnowSolver.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { GLOBE, groundHeight, makeSnowSeeds, integrateSnow } from '../src/experience/simulation/SnowPhysics.js'
import { sampleFlow } from '../src/experience/simulation/FlowMath.js'
import { knotSurface } from '../src/experience/simulation/KnotShape.js'

const still = { energy: 0, current: { x: 0, y: 0 } }

function assertContained(positions)
{
    for(let i = 0; i < positions.length; i += 3)
    {
        const [x, y, z] = positions.slice(i, i + 3)
        assert.ok(Number.isFinite(x + y + z), 'finite position')
        assert.ok(Math.hypot(x, y, z) <= GLOBE.snowRadius + 0.0001, 'inside spherical boundary')
        assert.ok(y >= groundHeight(x, z) + 0.0089, 'above terrain')
    }
}

test('pointer entry and re-entry do not create artificial shakes', () =>
{
    const motion = new GlobeMotion()
    motion.sample(-1, 1, 1)
    motion.sample(1, -1, 2)
    motion.step(1 / 60)
    assert.equal(motion.energy, 0)
    assert.equal(motion.position.x, 0)
    motion.release()
    motion.sample(0, 0, 2.1)
    assert.equal(motion.energy, 0)
})

test('faster sweeps produce stronger movement in the cursor direction', () =>
{
    function sweep(speed)
    {
        const motion = new GlobeMotion()
        for(let frame = 0; frame < 15; frame++)
        {
            motion.sample(speed * frame / 60, 0, frame / 60)
            motion.step(1 / 60)
        }
        return motion
    }
    const slow = sweep(0.4), fast = sweep(6)
    assert.ok(fast.energy > slow.energy * 5)
    assert.ok(fast.position.x > slow.position.x * 5)
    assert.ok(fast.current.x > 0)
    assert.equal(fast.position.y, 0)
})

test('shake is bounded and water momentum decays after movement stops', () =>
{
    const motion = new GlobeMotion()
    for(let frame = 0; frame < 600; frame++)
    {
        motion.sample(Math.sin(frame) * 100, Math.cos(frame) * 100, frame / 60)
        motion.step(frame % 90 === 0 ? 3 : 1 / 60)
        assert.ok(Math.abs(motion.position.x) <= 0.3)
        assert.ok(Math.abs(motion.position.y) <= 0.3)
        assert.ok(motion.energy <= 1)
    }
    motion.release()
    for(let frame = 0; frame < 1500; frame++) motion.step(1 / 60)
    assert.ok(motion.energy < 0.001)
    assert.ok(Math.hypot(motion.position.x, motion.position.y) < 0.0001)
    assert.ok(Math.hypot(motion.current.x, motion.current.y) < 0.0001)
})

test('snow seeds are reproducible and fit the globe above its terrain', () =>
{
    const positions = makeSnowSeeds(12000)
    assert.deepEqual(positions, makeSnowSeeds(12000))
    assertContained(positions)
})

test('fall speed control produces faster settling', () =>
{
    const slow = new Float32Array([0.8, 1, 0]), fast = slow.slice()
    const a = new Float32Array(3), b = new Float32Array(3)
    for(let i = 0; i < 60; i++)
    {
        integrateSnow(slow, a, still, i / 60, 1 / 60, { fallSpeed: 0.06 })
        integrateSnow(fast, b, still, i / 60, 1 / 60, { fallSpeed: 0.24 })
    }
    assert.ok(1 - fast[1] > (1 - slow[1]) * 3.5)
})

test('collision volumes separate overlapping particle centers', () =>
{
    const config = createSettings()
    config.simulation.sleep = false
    config.simulation.fallSpeed = 0
    const solver = new CPUSnowSolver(new Float32Array([0.7, 0.3, 0, 0.701, 0.3, 0]), config)
    for(let frame = 0; frame < 30; frame++) solver.update(still, frame / 60, 1 / 60)
    assert.ok(Math.abs(solver.positions[3] - solver.positions[0]) > solver.radius * 1.95)
})

test('settled snow sleeps with zero velocity and stays bitwise unchanged', () =>
{
    const solver = new CPUSnowSolver(makeSnowSeeds(100), createSettings())
    for(let frame = 0; frame < 1800 && !solver.sleeping; frame++) solver.update(still, frame / 60, 1 / 60)
    assert.equal(solver.sleeping, true)
    assert.equal(solver.sleepingCount, 100)
    assert.ok(solver.velocities.every(value => value === 0))
    const snapshot = solver.positions.slice(), steps = solver.steps
    for(let frame = 0; frame < 1800; frame++) solver.update(still, 30 + frame / 60, 1 / 60)
    assert.deepEqual(solver.positions, snapshot)
    assert.equal(solver.steps, steps, 'no simulation work while sleeping')
    solver.wake()
    for(let frame = 0; frame < 180; frame++) solver.update({ energy: 1, current: { x: 0.8, y: 0 } }, frame / 60, 1 / 60)
    assert.ok(solver.positions.filter((value, index) => index % 3 === 1 && value > -0.7).length > 20)
    for(let frame = 0; frame < 2400 && !solver.sleeping; frame++) solver.update(still, 3 + frame / 60, 1 / 60)
    assert.equal(solver.sleeping, true, 'the shaken pile returns to sleep')
    assert.ok(solver.velocities.every(value => value === 0))
})

test('violent currents and long frames remain finite and inside sphere/terrain', () =>
{
    const settings = createSettings(), solver = new CPUSnowSolver(makeSnowSeeds(120), settings)
    for(let frame = 0; frame < 240; frame++)
    {
        const time = frame / 60
        solver.update({ energy: 1, current: { x: Math.sin(time * 8) * 1.5, y: Math.cos(time * 6) * 1.5 } }, time, frame % 80 === 0 ? 30 : 1 / 60)
        for(let i = 0; i < solver.positions.length; i += 3)
        {
            const [x, y, z] = solver.positions.slice(i, i + 3)
            assert.ok(Number.isFinite(x + y + z))
            assert.ok(Math.hypot(x, y, z) <= GLOBE.innerRadius - solver.radius + 0.0001)
            assert.ok(y >= groundHeight(x, z) + solver.radius - 0.0001)
            assert.ok(knotSurface(x, y, z).distance >= solver.radius - 0.0001, 'outside the solid knot')
        }
    }
})

test('shake energy decays monotonically and cannot create perpetual currents', () =>
{
    const motion = new GlobeMotion(createSettings().motion)
    motion.sample(-0.5, -0.2, 0)
    motion.sample(0.5, 0.2, 1 / 60)
    let previous = motion.energy
    for(let i = 0; i < 2400; i++)
    {
        motion.step(1 / 60)
        assert.ok(motion.energy <= previous)
        previous = motion.energy
    }
    assert.equal(motion.energy, 0)
    assert.deepEqual(sampleFlow(0.7, 0.2, 0.3, motion, 40, createSettings().simulation), { x: 0, y: 0, z: 0 })
})

test('the complete globe translates elastically and returns to its center', () =>
{
    const motion = new GlobeMotion(createSettings().motion)
    motion.sample(-0.5, -0.2, 0)
    motion.sample(0.5, 0.2, 1 / 60)
    for(let i = 0; i < 6; i++) motion.step(1 / 60)
    assert.ok(motion.position.x > 0.1)
    motion.release()
    for(let i = 0; i < 600; i++) motion.step(1 / 60)
    assert.ok(Math.hypot(motion.position.x, motion.position.y) < 0.00001)
})

test('particle contacts have no attraction and only bounce on a fast impact', () =>
{
    function contact(speed)
    {
        const settings = createSettings()
        Object.assign(settings.simulation, { sleep: false, fallSpeed: 0, drag: 0, viscosity: 0, substeps: 1 })
        const solver = new CPUSnowSolver(new Float32Array([0.7, 0.3, 0, 0.733, 0.3, 0]), settings)
        solver.velocities[0] = speed; solver.velocities[3] = -speed
        solver.update(still, 0, 1 / 240)
        return solver
    }
    const resting = contact(0), gentle = contact(0.01), fast = contact(0.5)
    assert.ok(resting.velocities.every(value => value === 0), 'overlap correction adds no kinetic energy')
    assert.ok(Math.abs(gentle.velocities[0]) < 0.001, 'gentle impact has no rebound')
    assert.ok(fast.velocities[0] < -0.05, 'fast impact rebounds')
    assert.ok(fast.velocities.reduce((sum, value) => sum + value * value, 0) < 0.5, 'impact loses energy')
})

test('seeded flakes start outside the knot and local currents differ in direction', () =>
{
    const seeds = makeSnowSeeds(2048), config = createSettings().simulation
    for(let i = 0; i < seeds.length; i += 3) assert.ok(knotSurface(...seeds.slice(i, i + 3)).distance >= 0.0249)
    const motion = { energy: 1, current: { x: 1, y: 0.4 } }
    const a = sampleFlow(-0.8, 0.3, 0.3, motion, 1, config)
    const b = sampleFlow(0.7, 0.6, -0.2, motion, 1, config)
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.4)
})
