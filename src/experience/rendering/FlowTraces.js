import { GLOBE, groundHeight } from '../simulation/SnowPhysics.js'
import { knotSurface } from '../simulation/KnotShape.js'
import { sampleFlow } from '../simulation/FlowMath.js'

export const TRACE_SEGMENTS = 16
const sliceAxis = { yz: 0, xz: 1, xy: 2 }

export function insideFlowVolume(x, y, z)
{
    return x * x + y * y + z * z < GLOBE.snowRadius ** 2
        && y > groundHeight(x, z) + 0.025 && knotSurface(x, y, z).distance > 0.018
}

export function makeFlowSeeds(count, config)
{
    const seeds = new Float32Array(count * 3)
    let seed = 17341
    const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646 }
    const axis = sliceAxis[config.slice]
    for(let i = 0; i < count; i++)
    {
        let point
        for(let attempt = 0; attempt < 2000; attempt++)
        {
            point = [0, 1, 2].map(() => (random() * 2 - 1) * GLOBE.snowRadius)
            if(axis !== undefined) point[axis] = config.offset + (random() - 0.5) * config.width
            // Seeds remain fixed as the knot rotates. Occluded traces disappear.
            if(point[0] ** 2 + point[1] ** 2 + point[2] ** 2 < GLOBE.snowRadius ** 2
                && point[1] > groundHeight(point[0], point[2]) + 0.025) break
        }
        seeds.set(point, i * 3)
    }
    return seeds
}

/** Integrate instantaneous streamlines with midpoint steps, in globe space. */
export function traceFlow(seeds, motion, time, simulation, config, positions, velocities, sample = sampleFlow, inside = insideFlowVolume)
{
    const dt = config.duration / TRACE_SEGMENTS, axis = sliceAxis[config.slice]
    const a = {}, b = {}
    const valid = (x, y, z) => inside(x, y, z)
        && (axis === undefined || Math.abs((axis === 0 ? x : axis === 1 ? y : z) - config.offset) <= config.width / 2)
    for(let i = 0; i < seeds.length / 3; i++)
    {
        let x = seeds[i * 3], y = seeds[i * 3 + 1], z = seeds[i * 3 + 2]
        let active = valid(x, y, z)
        for(let segment = 0; segment < TRACE_SEGMENTS; segment++)
        {
            const offset = (i * TRACE_SEGMENTS + segment) * 6
            let nx = x, ny = y, nz = z
            a.x = a.y = a.z = b.x = b.y = b.z = 0
            if(active)
            {
                sample(x, y, z, motion, time, simulation, a)
                const mx = x + a.x * dt / 2, my = y + a.y * dt / 2, mz = z + a.z * dt / 2
                if(valid(mx, my, mz))
                {
                    sample(mx, my, mz, motion, time, simulation, b)
                    nx += b.x * dt; ny += b.y * dt; nz += b.z * dt
                    active = valid(nx, ny, nz)
                }
                else active = false
            }
            if(!active) { nx = x; ny = y; nz = z; a.x = a.y = a.z = b.x = b.y = b.z = 0 }
            positions[offset] = x; positions[offset + 1] = y; positions[offset + 2] = z
            positions[offset + 3] = nx; positions[offset + 4] = ny; positions[offset + 5] = nz
            velocities[offset] = a.x; velocities[offset + 1] = a.y; velocities[offset + 2] = a.z
            velocities[offset + 3] = b.x; velocities[offset + 4] = b.y; velocities[offset + 5] = b.z
            x = nx; y = ny; z = nz
        }
    }
}
