import * as THREE from 'three/webgpu'
import { Fn, If, attribute, instanceIndex, instancedArray, mix, uniform } from 'three/tsl'

export function createActivityState(positions)
{
    const state = new Float32Array(positions.length / 3 * 4)
    for(let i = 0; i < positions.length / 3; i++) state.set(positions.subarray(i * 3, i * 3 + 3), i * 4)
    return state
}

/** Measure net travel, not impulses that contact projection may cancel. */
export function updateActivityState(state, positions, dt, config, resumeScale = null)
{
    dt = Math.max(0.0001, Math.min(dt, 1 / 30))
    const blend = -Math.expm1(-dt / Math.max(0.04, config.smoothing))
    for(let i = 0; i < positions.length / 3; i++)
    {
        const p = i * 3, s = i * 4
        if(resumeScale !== null)
        {
            state.set(positions.subarray(p, p + 3), s)
            state[s + 3] *= resumeScale
        }
        const dx = positions[p] - state[s], dy = positions[p + 1] - state[s + 1], dz = positions[p + 2] - state[s + 2]
        const speed = Math.hypot(dx, dy, dz) * blend / dt
        const t = Math.max(0, Math.min(1, (speed - config.speedFloor) / Math.max(config.speedFloor, 0.0001)))
        const target = speed * t * t * (3 - 2 * t)
        state[s] += dx * blend; state[s + 1] += dy * blend; state[s + 2] += dz * blend
        state[s + 3] += (target - state[s + 3]) * blend
    }
}

export class ParticleActivity
{
    constructor(solver, gpu, geometry, positions, config)
    {
        this.solver = solver; this.gpu = gpu; this.config = config
        this.dt = uniform(1 / 60)
        this.smoothing = uniform(config.smoothing)
        this.speedFloor = uniform(config.speedFloor)
        this.fade = uniform(1)
        this.resume = uniform(-1)
        this.wasSleeping = false
        const initial = createActivityState(positions)
        if(gpu)
        {
            this.buffer = instancedArray(initial, 'vec4')
            const state = this.buffer.element(instanceIndex)
            this.speed = state.w.mul(this.fade)
            // Included in the existing history pass; no additional dispatch.
            this.capture = Fn(() =>
            {
                const p = solver.positions.element(instanceIndex)
                If(this.resume.greaterThanEqual(0), () => { state.xyz.assign(p); state.w.mulAssign(this.resume) })
                const blend = this.dt.div(this.smoothing.max(0.04)).negate().exp().oneMinus()
                const delta = p.sub(state.xyz).toVar()
                const speed = delta.length().mul(blend).div(this.dt)
                const target = speed.mul(speed.smoothstep(this.speedFloor, this.speedFloor.add(this.speedFloor.max(0.0001))))
                state.xyz.addAssign(delta.mul(blend))
                state.w.assign(mix(state.w, target, blend))
            }, 'void')
        }
        else
        {
            this.values = initial
            this.buffer = new THREE.InstancedInterleavedBuffer(initial, 4).setUsage(THREE.DynamicDrawUsage)
            geometry.setAttribute('measuredActivity', new THREE.InterleavedBufferAttribute(this.buffer, 1, 3))
            this.speed = attribute('measuredActivity', 'float').mul(this.fade)
        }
    }
    update(dt)
    {
        if(this.solver.sleeping)
        {
            // A uniform fade lets sleeping particles go dark without compute.
            this.fade.value *= Math.exp(-dt / Math.max(0.04, this.config.smoothing))
            if(this.fade.value < 0.0001) this.fade.value = 0
            this.wasSleeping = true
            return
        }
        const resumeScale = this.wasSleeping ? this.fade.value : null
        this.resume.value = resumeScale ?? -1
        this.fade.value = 1
        this.wasSleeping = false
        this.dt.value = Math.max(0.0001, Math.min(dt, 1 / 30))
        this.smoothing.value = this.config.smoothing
        this.speedFloor.value = this.config.speedFloor
        if(!this.gpu)
        {
            updateActivityState(this.values, this.solver.positions, dt, this.config, resumeScale)
            this.buffer.needsUpdate = true
        }
    }
    dispose() { if(this.gpu) this.buffer.dispose() }
}
