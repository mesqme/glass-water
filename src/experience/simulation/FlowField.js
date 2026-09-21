import * as THREE from 'three/webgpu'
import { Fn, cos, exp, float, mix, sin, texture3D, uniform, vec3, vec4 } from 'three/tsl'
import { getKnotField, KNOT_FIELD, KNOT, knotPose } from './KnotShape.js'
import { EDDIES } from './FlowMath.js'
import { STARTUP_FLOW } from './StartupFlow.js'

// A cached normal/distance volume keeps the complex knot to one GPU lookup.
const size = KNOT_FIELD.size
const knotTexture = new THREE.Data3DTexture(Uint16Array.from(getKnotField(), value => THREE.DataUtils.toHalfFloat(value)), size, size, size)
knotTexture.type = THREE.HalfFloatType
knotTexture.format = THREE.RGBAFormat
knotTexture.minFilter = knotTexture.magFilter = THREE.LinearFilter
knotTexture.unpackAlignment = 1
knotTexture.needsUpdate = true
const knotRotation = uniform(new THREE.Matrix3()), knotInverse = uniform(new THREE.Matrix3()), knotScale = uniform(1)
const knotAngularVelocity = uniform(new THREE.Vector3())
export const knotVelocityNode = Fn(([p]) => knotAngularVelocity.cross(p.sub(vec3(0, KNOT.offsetY, 0))))
export const knotSurfaceNode = Fn(([p]) =>
{
    const local = knotInverse.mul(p.sub(vec3(0, KNOT.offsetY, 0))).div(knotScale).add(vec3(0, KNOT.offsetY, 0))
    const field = texture3D(knotTexture, local.div(KNOT_FIELD.extent * 2).add(0.5)).level(0)
    return vec4(knotRotation.mul(field.xyz.div(field.xyz.length().max(0.00001))), field.w.sub(KNOT_FIELD.margin).mul(knotScale))
})

export class FlowField
{
    constructor(settings)
    {
        this.settings = settings
        this.time = uniform(0); this.energy = uniform(0); this.current = uniform(new THREE.Vector3())
        this.startupSwirl = uniform(0)
        this.strength = uniform(settings.simulation.currentStrength); this.turbulence = uniform(settings.simulation.turbulence)
        this.knotStirring = uniform(settings.simulation.knotStirring)
        this.gravity = uniform(new THREE.Vector3(0, -1, 0))
        this.globeAngularVelocity = uniform(new THREE.Vector3())
        this.sample = Fn(([p]) =>
        {
            const r2 = p.dot(p).div(2.205225), t = this.time
            const drive = vec3(this.current.x.mul(-0.48), this.current.y.mul(-0.48), this.current.x.mul(0.21).sub(this.current.z.mul(0.48)))
            const flow = drive.mul(r2.mul(-2).add(1)).add(p.mul(drive.dot(p).div(2.205225))).toVar()
            for(const [x, y, z, ox, oy, oz, phase] of EDDIES)
            {
                const d = p.sub(vec3(x, y, z))
                const weight = exp(d.dot(d).mul(-1.7)).mul(sin(t.mul(0.83).add(phase)).mul(0.6).add(0.65)).mul(2.3)
                flow.addAssign(vec3(ox, oy, oz).cross(d).mul(weight))
            }
            const a = cos(p.y.mul(4.1).add(p.z.mul(2.3)).add(t.mul(1.17)))
            const b = cos(p.z.mul(3.7).add(p.x.mul(2.9)).sub(t.mul(0.93)))
            const c = cos(p.x.mul(4.3).add(p.y.mul(2.7)).add(t.mul(0.71)))
            const curl = vec3(c.mul(2.7).sub(b.mul(3.7)), a.mul(2.3).sub(c.mul(4.3)), b.mul(2.9).sub(a.mul(4.1)))
            flow.addAssign(curl.mul(this.turbulence).mul(0.32))
            const axis = vec3(...STARTUP_FLOW.axis), radiusSquared = STARTUP_FLOW.radiusSquared
            const spiral = axis.cross(p).mul(STARTUP_FLOW.spin).add(
                axis.mul(float(1).sub(p.dot(p).mul(2).div(radiusSquared)))
                    .add(p.mul(axis.dot(p).div(radiusSquared))).mul(STARTUP_FLOW.returnFlow))
            flow.assign(mix(flow, spiral, this.startupSwirl))
            flow.mulAssign(float(2.2).div(flow.length().max(0.001)).min(1).mul(this.energy.max(0).sqrt()))
            const knot = knotSurfaceNode(p)
            const stirred = knotVelocityNode(p).mul(exp(knot.w.max(0).mul(-7))).mul(0.65)
            const wake = curl.mul(knotAngularVelocity.length()).mul(exp(knot.w.max(0).mul(-4))).mul(this.turbulence).mul(0.08)
            flow.addAssign(stirred.add(wake).mul(this.knotStirring))
            // Water lags behind the turning container in its local frame.
            flow.subAssign(this.globeAngularVelocity.cross(p).mul(0.45))
            flow.mulAssign(this.strength)
            const intoKnot = flow.dot(knot.xyz).min(0).mul(float(1).sub(knot.w.max(0).div(0.28)).max(0))
            flow.subAssign(knot.xyz.mul(intoKnot))
            const outward = flow.dot(p).div(p.dot(p).max(0.01)).max(0).mul(r2.sub(0.72).div(0.28).max(0))
            flow.subAssign(p.mul(outward))
            return flow
        })
    }
    dispose() { knotTexture.dispose() }

    update(motion, time)
    {
        knotRotation.value.fromArray(knotPose.rotation)
        knotInverse.value.copy(knotRotation.value).transpose()
        knotScale.value = knotPose.scale
        knotAngularVelocity.value.copy(knotPose.angularVelocity)
        this.time.value = time
        this.energy.value = motion.energy < 0.0001 ? 0 : motion.energy
        this.startupSwirl.value = motion.startupSwirl ?? 0
        this.current.value.set(motion.current.x, motion.current.y, motion.current.z ?? 0)
        this.gravity.value.copy(motion.gravity ?? { x: 0, y: -1, z: 0 })
        this.globeAngularVelocity.value.copy(motion.angularVelocity ?? { x: 0, y: 0, z: 0 })
        this.strength.value = this.settings.simulation.currentStrength
        this.turbulence.value = this.settings.simulation.turbulence
        this.knotStirring.value = this.settings.simulation.knotStirring
    }
}
