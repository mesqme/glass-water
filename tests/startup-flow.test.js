import test from 'node:test'
import assert from 'node:assert/strict'
import { GlobeMotion } from '../src/experience/input/GlobeMotion.js'
import { createSettings } from '../src/experience/config/Settings.js'
import { makeSnowSeeds } from '../src/experience/simulation/SnowPhysics.js'
import { sampleStartupFlow, seedStartupFlow, STARTUP_FLOW } from '../src/experience/simulation/StartupFlow.js'
import { sampleFlow } from '../src/experience/simulation/FlowMath.js'
import { updateFlowHistory } from '../src/experience/rendering/FlowHistoryMath.js'
import { CPUSnowSolver } from '../src/experience/simulation/CPUSnowSolver.js'

test('startup circulation is tangent to the shell and initializes every particle color', () =>
{
    const settings = createSettings(), positions = makeSnowSeeds(settings.snow.count)
    const { velocities, history } = seedStartupFlow(positions, settings.simulation)
    for(let i = 0; i < settings.snow.count; i++)
    {
        const speed = Math.hypot(...velocities.subarray(i * 3, i * 3 + 3))
        assert.ok(speed > 0.000001 && speed <= settings.simulation.maxSpeed + 0.000001)
        assert.ok(Math.hypot(...history.subarray(i * 3, i * 3 + 3)) > 0.000001, 'water history already has a direction')
        const p = i * 3, scale = Math.sqrt(STARTUP_FLOW.radiusSquared) / Math.hypot(...positions.subarray(p, p + 3))
        const x = positions[p] * scale, y = positions[p + 1] * scale, z = positions[p + 2] * scale
        const flow = sampleStartupFlow(x, y, z)
        assert.ok(Math.abs(x * flow.x + y * flow.y + z * flow.z) < 1e-8, 'circulation cannot push through the shell')
    }
})

test('one startup impulse leaves residual currents, dissipates fully and allows stable colored sleep', () =>
{
    const settings = createSettings(), motion = new GlobeMotion(settings.motion)
    const positions = makeSnowSeeds(80), startup = seedStartupFlow(positions, settings.simulation)
    const solver = new CPUSnowSolver(positions, settings)
    solver.velocities.set(startup.velocities)
    motion.startFlow()
    let previous = motion.energy, residual = false
    for(let frame = 0; frame < 7200 && !solver.sleeping; frame++)
    {
        motion.step(1 / 60)
        assert.ok(motion.energy <= previous, 'no continuing energy injection')
        previous = motion.energy
        if(motion.startupSwirl === 0 && motion.energy > 0.0001) residual = true
        solver.update(motion, frame / 60, 1 / 60)
        updateFlowHistory(startup.history, solver, motion, frame / 60, settings.simulation)
    }
    assert.ok(residual, 'irregular residual flow outlasts the coherent spiral')
    assert.equal(motion.energy, 0)
    assert.equal(motion.startupSwirl, 0)
    assert.deepEqual(sampleFlow(0.7, 0.2, 0.3, motion, 120, settings.simulation), { x: 0, y: 0, z: 0 })
    assert.equal(solver.sleeping, true)
    const snapshot = startup.history.slice()
    updateFlowHistory(startup.history, solver, motion, 121, settings.simulation)
    assert.deepEqual(startup.history, snapshot)
    assert.ok(startup.history.some(value => value !== 0))
    assert.deepEqual(motion.position, { x: 0, y: 0 }, 'starting the water does not shake the whole globe')
})
