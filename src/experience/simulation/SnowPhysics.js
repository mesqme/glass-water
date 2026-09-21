import { knotSurface } from './KnotShape.js'
import { sampleFlow } from './FlowMath.js'

export const GLOBE = Object.freeze({ radius: 1.6, innerRadius: 1.515, snowRadius: 1.485, floor: -1.055, centerY: 1.76 })

export function groundHeight(x, z)
{
    return GLOBE.floor + 0.085 * Math.exp(-(x * x + z * z) * 2.5)
        + Math.sin(x * 5.2 + z * 3.1) * Math.sin(z * 4.8 - x * 2.7) * 0.012
}

export function supportedSnow(x, y, z, radius, bedHeight, gravity = { x: 0, y: -1, z: 0 })
{
    const onFloor = gravity.y < -0.25 && y < groundHeight(x, z) + bedHeight
    const onLowerWall = x * gravity.x + y * gravity.y + z * gravity.z > GLOBE.innerRadius - radius - bedHeight
    return onFloor || onLowerWall || knotSurface(x, y, z).distance < radius * 2
}

export function makeSnowSeeds(count)
{
    const result = new Float32Array(count * 3)
    let seed = 12931
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    for(let i = 0; i < count; i++)
    {
        let x, y, z
        do
        {
            x = (random() * 2 - 1) * GLOBE.snowRadius
            y = (random() * 2 - 1) * GLOBE.snowRadius
            z = (random() * 2 - 1) * GLOBE.snowRadius
        }
        while(x * x + y * y + z * z > GLOBE.snowRadius ** 2 || y < groundHeight(x, z) + 0.02 || knotSurface(x, y, z).distance < 0.025)
        result[i * 3] = x
        result[i * 3 + 1] = y
        result[i * 3 + 2] = z
    }
    return result
}

/** CPU integration; the WebGPU path uses the Blocks solver instead. */
export function integrateSnow(positions, velocities, motion, time, dt, config = {}, radius = 0.009, ages = null)
{
    dt = Math.max(0, Math.min(dt, 1 / 30))
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const step = dt / steps
    const flow = {}
    const gravity = motion.gravity ?? { x: 0, y: -1, z: 0 }
    for(let k = 0; k < steps; k++)
    {
        for(let i = 0; i < positions.length; i += 3)
        {
            if(ages && config.sleep && ages[i / 3] >= config.sleepDelay) continue
            const x = positions[i], y = positions[i + 1], z = positions[i + 2]
            sampleFlow(x, y, z, motion, time, config, flow)
            const fall = (config.fallSpeed ?? 0.24) * (0.85 + (i % 17) / 16 * 0.3)
            const tx = flow.x + gravity.x * fall, ty = flow.y + gravity.y * fall, tz = flow.z + gravity.z * fall
            const relative = Math.hypot(tx - velocities[i], ty - velocities[i + 1], tz - velocities[i + 2])
            const resistance = (0.6 + relative * 0.45) * (config.drag ?? 3.4) / ((config.inertia ?? 1.35) * (0.65 + (i % 19) / 18 * 0.7))
            const drag = 1 - Math.exp(-step * resistance)
            velocities[i] += (tx - velocities[i]) * drag
            velocities[i + 1] += (ty - velocities[i + 1]) * drag
            velocities[i + 2] += (tz - velocities[i + 2]) * drag
            const speed = Math.hypot(velocities[i], velocities[i + 1], velocities[i + 2])
            if(speed > (config.maxSpeed ?? 2))
            {
                const scale = (config.maxSpeed ?? 2) / speed
                velocities[i] *= scale; velocities[i + 1] *= scale; velocities[i + 2] *= scale
            }
            let nx = x + velocities[i] * step, ny = y + velocities[i + 1] * step, nz = z + velocities[i + 2] * step
            const length = Math.hypot(nx, ny, nz)
            const limit = GLOBE.innerRadius - radius
            if(length > limit)
            {
                const scale = limit / length
                nx *= scale; ny *= scale; nz *= scale
                const dot = (velocities[i] * nx + velocities[i + 1] * ny + velocities[i + 2] * nz) / limit ** 2
                if(dot > 0)
                {
                    velocities[i] -= nx * dot * 1.15
                    velocities[i + 1] -= ny * dot * 1.15
                    velocities[i + 2] -= nz * dot * 1.15
                }
            }
            const floor = groundHeight(nx, nz) + radius
            if(ny < floor)
            {
                ny = floor
                velocities[i + 1] = Math.max(0, velocities[i + 1])
                velocities[i] *= 0.9; velocities[i + 2] *= 0.9
            }
            positions[i] = nx; positions[i + 1] = ny; positions[i + 2] = nz
        }
    }
}
