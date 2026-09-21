import { sampleFlow } from '../simulation/FlowMath.js'

export const MIN_FLOW_SPEED = 0.1

export function rememberVector(history, offset, x, y, z, particleSpeed = Infinity, minSpeed = MIN_FLOW_SPEED, dt = 1 / 60)
{
    // A zero vector has no direction. Do not replace the last visible color
    // when the solver clears velocity or the water's energy reaches zero.
    const speed = Math.min(Math.hypot(x, y, z), particleSpeed)
    if(speed <= minSpeed) return
    const t = Math.min(1, (speed - minSpeed) / Math.max(minSpeed * 2, 0.0001))
    const response = t * t * (3 - 2 * t)
    const initialized = Math.hypot(history[offset], history[offset + 1], history[offset + 2]) > 0.000001
    const blend = initialized ? -Math.expm1(-Math.min(dt, 1 / 30) * 12 * response) : 1
    history[offset] += (x - history[offset]) * blend
    history[offset + 1] += (y - history[offset + 1]) * blend
    history[offset + 2] += (z - history[offset + 2]) * blend
}

export function updateFlowHistory(history, solver, motion, time, config, minSpeed = MIN_FLOW_SPEED, dt = 1 / 60)
{
    if(solver.sleeping) return
    const { positions: p, velocities: v, ages } = solver
    const sample = {}, water = { ...motion, energy: motion.energy < 0.0001 ? 0 : motion.energy }
    for(let i = 0; i < ages.length; i++)
    {
        if(config.sleep && ages[i] >= config.sleepDelay) continue
        const a = i * 3
        const particleSpeed = Math.hypot(v[a], v[a + 1], v[a + 2])
        if(particleSpeed <= minSpeed) continue
        sampleFlow(p[a], p[a + 1], p[a + 2], water, time, config, sample)
        rememberVector(history, a, sample.x, sample.y, sample.z, particleSpeed, minSpeed, dt)
    }
}
