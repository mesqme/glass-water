import * as THREE from 'three/webgpu'
import { Fn, If, attribute, instanceIndex, instancedArray, mix, uniform } from 'three/tsl'
import { MIN_FLOW_SPEED, updateFlowHistory } from './FlowHistoryMath.js'

/** Remember water direction while particles move; retain it during rest. */
export class FlowHistory
{
    constructor(solver, gpu, geometry, flow, count, initialHistory, activity)
    {
        this.solver = solver
        this.gpu = gpu
        this.count = count
        this.minSpeed = uniform(MIN_FLOW_SPEED)
        this.dt = uniform(1 / 60)
        if(gpu)
        {
            this.buffer = instancedArray(initialHistory ?? count, 'vec3')
            this.water = this.buffer.element(instanceIndex)
            this.capture = Fn(() =>
            {
                activity?.capture()
                const p = solver.positions.element(instanceIndex)
                const velocity = solver.velocities.element(instanceIndex), particleSpeed = velocity.length().toVar()
                If(particleSpeed.greaterThan(this.minSpeed), () =>
                {
                    const water = flow.sample(p).toVar()
                    const speed = water.length().min(particleSpeed).toVar()
                    If(speed.greaterThan(this.minSpeed), () =>
                    {
                        const response = speed.smoothstep(this.minSpeed, this.minSpeed.mul(3))
                        const blend = this.water.length().greaterThan(0.000001).select(this.dt.mul(-12).mul(response).exp().oneMinus(), 1)
                        this.water.assign(mix(this.water, water, blend))
                    })
                })
            })().compute(count)
        }
        else
        {
            this.values = initialHistory ?? new Float32Array(count * 3)
            this.buffer = new THREE.InstancedInterleavedBuffer(this.values, 3).setUsage(THREE.DynamicDrawUsage)
            geometry.setAttribute('lastWaterFlow', new THREE.InterleavedBufferAttribute(this.buffer, 3, 0))
            this.water = attribute('lastWaterFlow', 'vec3')
        }
    }
    update(renderer, motion, time, config, dt)
    {
        if(this.solver.sleeping) return
        if(this.gpu)
        {
            this.dt.value = Math.min(dt, 1 / 30)
            renderer.compute(this.capture)
        }
        else
        {
            updateFlowHistory(this.values, this.solver, motion, time, config, MIN_FLOW_SPEED, dt)
            this.buffer.needsUpdate = true
        }
    }
    dispose()
    {
        if(this.gpu) { this.capture.dispose(); this.buffer.dispose() }
    }
}
