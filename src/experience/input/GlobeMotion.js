import { STARTUP_FLOW } from '../simulation/StartupFlow.js'

const clamp = (x, limit) => Math.max(-limit, Math.min(limit, x))

/** Pointer velocity drives a damped spring and a slower-decaying water current. */
export class GlobeMotion
{
    constructor(settings = { sensitivity: 1, shake: 1, decay: 0.45, elasticity: 55, damping: 8.5 })
    {
        this.settings = settings
        this.last = null
        this.input = { x: 0, y: 0 }
        this.position = { x: 0, y: 0 }
        this.velocity = { x: 0, y: 0 }
        this.current = { x: 0, y: 0, z: 0 }
        this.pointer = { x: 0, y: 0 }
        this.energy = 0
        this.startupSwirl = 0
        this.speed = 0
        this.turnHeld = false
        this.roll = 0
        this.rollTarget = 0
        this.rollVelocity = 0
        this.gravity = { x: 0, y: -1, z: 0 }
        this.angularVelocity = { x: 0, y: 0, z: 0 }
    }

    setTurning(held)
    {
        if(held && !this.turnHeld) this.rollTarget = Math.max(0, this.roll)
        this.turnHeld = held && this.settings.holdRotation !== false
    }

    get rotating() { return Math.abs(this.rollVelocity) > 0.002 || Math.abs(this.rollTarget - this.roll) > 0.002 }

    sample(x, y, seconds)
    {
        if(!this.last || seconds - this.last.time > 0.18)
        {
            this.last = { x, y, time: seconds }
            return
        }
        const dt = seconds - this.last.time
        if(dt < 0.001) return
        const vx = clamp((x - this.last.x) / dt, 12)
        const vy = clamp((y - this.last.y) / dt, 12)
        const weight = 1 - Math.exp(-dt * 45)
        this.input.x += (vx - this.input.x) * weight
        this.input.y += (vy - this.input.y) * weight
        this.speed = Math.hypot(this.input.x, this.input.y)
        this.pointer.x = clamp(x, 1); this.pointer.y = clamp(y, 1)
        this.inject(vx, vy, dt)
        this.last = { x, y, time: seconds }
    }

    release()
    {
        this.last = null
        this.input.x = this.input.y = 0
        this.pointer.x = this.pointer.y = 0
    }

    inject(vx, vy, dt)
    {
        this.inject3D(vx, vy, 0, dt)
    }

    inject3D(vx, vy, vz, dt)
    {
        const work = (vx * vx + vy * vy + vz * vz) * Math.min(dt, 1 / 30) * 0.14 * this.settings.sensitivity
        this.energy = Math.min(1, this.energy + work)
        const blend = 1 - Math.exp(-dt * 5)
        this.current.x += (clamp(vx * 0.22, 1.5) - this.current.x) * blend
        this.current.y += (clamp(vy * 0.22, 1.5) - this.current.y) * blend
        this.current.z += (clamp(vz * 0.22, 1.5) - this.current.z) * blend
    }

    startFlow()
    {
        // Initial water momentum, not a force that is injected every frame.
        this.energy = STARTUP_FLOW.energy
        this.startupSwirl = 1
    }

    step(dt)
    {
        dt = Math.max(0, Math.min(1 / 30, dt))
        // Initial/interaction energy only: viscous loss always removes energy.
        this.energy *= Math.exp(-dt * this.settings.decay * (1 + this.energy * 0.6))
        if(this.energy < 0.0001) this.energy = 0
        this.startupSwirl *= Math.exp(-dt * 0.65)
        if(this.startupSwirl < 0.0001 || this.energy === 0) this.startupSwirl = 0
        this.input.x *= Math.exp(-dt * 7)
        this.input.y *= Math.exp(-dt * 7)
        for(const axis of ['x', 'y'])
        {
            const target = clamp((this.pointer[axis] * 0.38 + this.input[axis] * 0.055) * this.settings.shake, 0.65)
            this.velocity[axis] += ((target - this.position[axis]) * (this.settings.elasticity ?? 55) - this.velocity[axis] * (this.settings.damping ?? 8.5)) * dt
            this.position[axis] = clamp(this.position[axis] + this.velocity[axis] * dt, 0.85)
            this.current[axis] *= Math.exp(-dt * 0.4)
        }
        this.current.z *= Math.exp(-dt * 0.4)
        this.speed = Math.hypot(this.input.x, this.input.y)
        const count = Math.max(1, Math.ceil(dt * 120)), step = dt / count
        for(let i = 0; i < count; i++)
        {
            if(this.turnHeld && this.settings.holdRotation !== false)
                this.rollTarget = Math.min((this.settings.turnAngle ?? 180) * Math.PI / 180, this.rollTarget + (this.settings.turnSpeed ?? 120) * Math.PI / 180 * step)
            else this.rollTarget = 0
            this.rollVelocity += ((this.rollTarget - this.roll) * (this.settings.turnSpring ?? 28) - this.rollVelocity * (this.settings.turnDamping ?? 6)) * step
            this.roll += this.rollVelocity * step
        }
        this.energy = Math.min(1, this.energy + Math.abs(this.rollVelocity) * dt * 0.12)
        if(Math.abs(this.rollVelocity) < 0.0001 && Math.abs(this.roll - this.rollTarget) < 0.0001)
        {
            this.roll = this.rollTarget
            this.rollVelocity = 0
        }
    }
}
