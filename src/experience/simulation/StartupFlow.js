// A tilted circulation with a return through its core, tangent to the sphere.
// Shared constants keep initial CPU data and the evolving TSL flow identical.
export const STARTUP_FLOW = Object.freeze({
    axis: Object.freeze([0.25, 0.5, Math.sqrt(0.6875)]),
    radiusSquared: 1.515 ** 2, spin: 1.3, returnFlow: 0.35, energy: 0.65
})

export function sampleStartupFlow(x, y, z, out = {})
{
    const { axis: [ax, ay, az], radiusSquared, spin, returnFlow } = STARTUP_FLOW
    const radial = 1 - 2 * (x * x + y * y + z * z) / radiusSquared
    const along = (ax * x + ay * y + az * z) / radiusSquared
    out.x = (ay * z - az * y) * spin + (ax * radial + x * along) * returnFlow
    out.y = (az * x - ax * z) * spin + (ay * radial + y * along) * returnFlow
    out.z = (ax * y - ay * x) * spin + (az * radial + z * along) * returnFlow
    return out
}

/** Seed movement and water colors before the first visible frame. */
export function seedStartupFlow(positions, simulation)
{
    const velocities = new Float32Array(positions.length), history = new Float32Array(positions.length)
    const flow = {}, strength = Math.sqrt(STARTUP_FLOW.energy) * simulation.currentStrength
    for(let i = 0; i < positions.length / 3; i++)
    {
        const p = i * 3
        sampleStartupFlow(positions[p], positions[p + 1], positions[p + 2], flow)
        const speed = Math.hypot(flow.x, flow.y, flow.z) * strength
        const limit = Math.min(1, simulation.maxSpeed / Math.max(0.000001, speed))
        for(const [j, axis] of ['x', 'y', 'z'].entries())
        {
            history[p + j] = flow[axis] * strength
            velocities[p + j] = history[p + j] * limit
        }
    }
    return { velocities, history }
}
