import { collideKnot, knotPose, knotSurface } from './KnotShape.js'
import { GLOBE, groundHeight, integrateSnow, supportedSnow } from './SnowPhysics.js'

/** Spatial-hash sphere contacts and per-particle sleep for the WebGL fallback. */
export class CPUSnowSolver
{
    constructor(positions, settings)
    {
        this.positions = positions
        this.velocities = new Float32Array(positions.length)
        this.ages = new Float32Array(positions.length / 3)
        this.settings = settings
        this.sleeping = false
        this.sleepingCount = 0
        this.steps = 0
        this.quietTime = 0
        this.configure()
    }
    configure() { this.radius = this.settings.snow.radius; this.wake() }
    wake()
    {
        this.sleeping = false; this.sleepingCount = 0
        this.quietTime = 0
        for(let i = 0; i < this.ages.length; i++) if(this.ages[i] >= this.settings.simulation.sleepDelay)
            this.velocities.fill(0, i * 3, i * 3 + 3)
        this.ages.fill(0)
    }
    constrain(i)
    {
        const p = this.positions, v = this.velocities, radius = this.radius
        const length = Math.hypot(p[i], p[i + 1], p[i + 2]), limit = GLOBE.innerRadius - radius
        if(length > limit)
        {
            const scale = limit / length
            p[i] *= scale; p[i + 1] *= scale; p[i + 2] *= scale
        }
        // Release particles sideways when a tube presses them into the floor.
        for(let pass = 0; pass < 6; pass++)
        {
            collideKnot(p, v, i, radius, this.settings.simulation.restitution)
            const floor = groundHeight(p[i], p[i + 2]) + radius
            if(p[i + 1] >= floor - 0.000001) break
            p[i + 1] = floor; v[i + 1] = Math.max(0, v[i + 1])
            const contact = knotSurface(p[i], p[i + 1], p[i + 2])
            if(contact.distance >= radius) break
            const length = Math.hypot(contact.x, contact.z)
            const step = Math.min(radius, (radius - contact.distance + 0.00001) / Math.max(length, 0.001))
            p[i] += (length > 0.001 ? contact.x / length : 1) * step
            p[i + 2] += (length > 0.001 ? contact.z / length : 0) * step
            p[i + 1] = groundHeight(p[i], p[i + 2]) + radius
        }
    }
    update(motion, time, dt)
    {
        if((knotPose.moving || motion.rotating) && this.sleepingCount > 0) this.wake()
        if(this.sleeping) return
        const { simulation: config } = this.settings
        const p = this.positions, v = this.velocities, age = this.ages
        const diameter = this.radius * 2, size = diameter * 1.05
        const cells = Math.ceil(GLOBE.innerRadius * 2 / size) + 3
        const origin = Math.ceil(GLOBE.innerRadius / size) + 1
        const cellKey = (x, y, z) => x + origin + cells * (y + origin + cells * (z + origin))
        const steps = config.substeps, step = Math.min(dt, 1 / 30) / steps
        for(let substep = 0; substep < steps; substep++)
        {
            integrateSnow(p, v, motion, time, step, config, this.radius, age)
            const grid = new Map()
            for(let i = 0; i < age.length; i++)
            {
                const key = cellKey(Math.floor(p[i * 3] / size), Math.floor(p[i * 3 + 1] / size), Math.floor(p[i * 3 + 2] / size))
                if(!grid.has(key)) grid.set(key, [])
                grid.get(key).push(i)
            }
            for(let i = 0; i < age.length; i++)
            {
                const a = i * 3, cx = Math.floor(p[a] / size), cy = Math.floor(p[a + 1] / size), cz = Math.floor(p[a + 2] / size)
                for(let x = -1; x <= 1; x++) for(let y = -1; y <= 1; y++) for(let z = -1; z <= 1; z++)
                {
                    const cell = grid.get(cellKey(cx + x, cy + y, cz + z))
                    if(!cell) continue
                    for(const j of cell)
                    {
                        if(j <= i) continue
                        const b = j * 3
                        let dx = p[a] - p[b], dy = p[a + 1] - p[b + 1], dz = p[a + 2] - p[b + 2]
                        let length = Math.hypot(dx, dy, dz)
                        if(length >= diameter) continue
                        if(length < 0.000001) { dx = i % 2 ? 1 : -1; dy = 0.2; dz = 0.3; length = Math.hypot(dx, dy, dz) }
                        const wa = config.sleep && age[i] >= config.sleepDelay ? 0 : 1
                        const wb = config.sleep && age[j] >= config.sleepDelay ? 0 : 1
                        if(wa + wb === 0) continue
                        const correction = Math.max(0, diameter - Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2])) * 0.8 / (wa + wb)
                        const nx = dx / length, ny = dy / length, nz = dz / length
                        p[a] += nx * correction * wa; p[a + 1] += ny * correction * wa; p[a + 2] += nz * correction * wa
                        p[b] -= nx * correction * wb; p[b + 1] -= ny * correction * wb; p[b + 2] -= nz * correction * wb
                        const speed = Math.min(0, (v[a] - v[b]) * nx + (v[a + 1] - v[b + 1]) * ny + (v[a + 2] - v[b + 2]) * nz)
                        const bounce = config.restitution * Math.max(0, Math.min(1, (-speed - config.impactThreshold) / 0.5))
                        const closing = speed * (1 + bounce) / (wa + wb)
                        v[a] -= nx * closing * wa; v[a + 1] -= ny * closing * wa; v[a + 2] -= nz * closing * wa
                        v[b] += nx * closing * wb; v[b + 1] += ny * closing * wb; v[b + 2] += nz * closing * wb
                        for(let axis = 0; axis < 3; axis++)
                        {
                            const exchange = (v[b + axis] - v[a + axis]) * config.viscosity * step * 5 / (wa + wb)
                            v[a + axis] += exchange * wa; v[b + axis] -= exchange * wb
                        }
                    }
                }
            }
            this.sleepingCount = 0
            for(let i = 0; i < age.length; i++)
            {
                const a = i * 3
                if(config.sleep && age[i] >= config.sleepDelay) { this.sleepingCount++; continue }
                this.constrain(a)
                const speed = Math.hypot(v[a], v[a + 1], v[a + 2])
                if(speed > config.maxSpeed)
                {
                    const limit = config.maxSpeed / speed
                    v[a] *= limit; v[a + 1] *= limit; v[a + 2] *= limit
                }
                const bedHeight = Math.max(this.radius * 10, age.length * (this.radius * 2) ** 3 / 1.5)
                const supported = supportedSnow(p[a], p[a + 1], p[a + 2], this.radius, bedHeight, motion.gravity)
                if(config.sleep && !knotPose.moving && motion.energy < 0.0001 && supported && Math.hypot(v[a], v[a + 1], v[a + 2]) < config.sleepSpeed) age[i] += step
                else age[i] = 0
                if(age[i] >= config.sleepDelay) { v[a] = v[a + 1] = v[a + 2] = 0; this.sleepingCount++ }
            }
        }
        this.steps++
        let quiet = !knotPose.moving && motion.energy < 0.0001
        const threshold = Math.min(config.sleepSpeed * 2, config.fallSpeed * 0.5)
        const bedHeight = Math.max(this.radius * 20, age.length * (this.radius * 2) ** 3 / 0.9)
        for(let i = 0; quiet && i < v.length; i += 3)
            quiet = Math.hypot(v[i], v[i + 1], v[i + 2]) < threshold && supportedSnow(p[i], p[i + 1], p[i + 2], this.radius, bedHeight, motion.gravity)
        this.quietTime = quiet ? this.quietTime + Math.min(dt, 1 / 30) : 0
        if(config.sleep && this.quietTime >= Math.max(1.5, config.sleepDelay))
        {
            age.fill(config.sleepDelay)
            v.fill(0)
            this.sleepingCount = age.length
        }
        this.sleeping = config.sleep && this.sleepingCount === age.length
    }
    dispose() {}
}
