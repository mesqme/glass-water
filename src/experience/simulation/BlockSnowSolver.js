import * as THREE from 'three/webgpu'
import { PBF } from 'three-blocks/pbf'
import { Fn, If, atomicAdd, atomicStore, exp, float, hash, instanceIndex, instancedArray, sin, uniform, vec3 } from 'three/tsl'
import { GLOBE } from './SnowPhysics.js'
import { knotSurfaceNode, knotVelocityNode } from './FlowField.js'
import { knotPose } from './KnotShape.js'
import { createContactPass } from './BlockContacts.js'

/**
 * Blocks 0.12.0 advanced PBF adapter. The shipped PBF class documents buffers,
 * ubos and addBoundary; the narrow facade's TypeScript declarations omit them.
 * Keep this dependency pinned and all advanced integration in this file.
 */
export class BlockSnowSolver
{
    constructor(renderer, seeds, settings, flow)
    {
        this.renderer = renderer
        this.flow = flow
        this.settings = settings
        this.count = seeds.length / 3
        this.disposed = false
        this.sleeping = false
        this.sleepingCount = 0
        this.generation = 0
        this.pending = false
        this.readbackTime = 0
        this.steps = 0
        this.initial = new THREE.StorageBufferAttribute(seeds, 3)
        this.baseSpacing = Math.max(settings.simulation.restSpacing, settings.snow.radius * 2)
        this.fluid = new PBF({
            particles: { count: this.count, spacing: this.baseSpacing, smoothingRadius: settings.simulation.kernelRadius, particleRadius: settings.snow.radius, calibrationMode: 'discrete-lattice' },
            material: { restDensity: 1000 },
            domain: { dimensions: [3.4, 3.4, 3.4], restitution: 0, friction: 0.2 },
            initialPositions: this.initial, scatterZeroInitialPositions: false,
            solverOptions: { solverIterations: settings.simulation.iterations, xsphViscosity: 0 },
            constraintMode: 'compression-only', corrK: 0, lambdaRelaxation: 0.000001,
            gravity: new THREE.Vector3(), maxSpeed: settings.simulation.maxSpeed,
            useMatrices: false, useDirection: false, boundaryDensitySupport: false,
            timeStep: { fixedDelta: 1 / (60 * settings.simulation.substeps), maxSubsteps: settings.simulation.substeps * 2, maxFrameDelta: 1 / 30 }
        })
        if(!this.fluid.buffers?.positions || !this.fluid.ubos || !this.fluid.addBoundary)
            throw new Error('The pinned Blocks PBF integration API is unavailable.')
        this.baseMass = this.fluid.ubos.mass.value
        const { positions, velocities, prevPositions, densities } = this.fluid.buffers
        this.positions = positions
        this.velocities = velocities
        this.ages = instancedArray(this.count, 'float')
        this.incoming = instancedArray(this.count, 'vec3')
        this.predicted = instancedArray(this.count, 'vec3')
        // Interleave the two contact outputs to stay within WebGPU's portable
        // limit of eight storage buffers per compute stage.
        this.contactCorrections = instancedArray(this.count * 2, 'vec3')
        this.contactVelocity = { element: id => this.contactCorrections.element(id.mul(2)) }
        this.contactPosition = { element: id => this.contactCorrections.element(id.mul(2).add(1)) }
        this.snapshot = Fn(() =>
        {
            this.incoming.element(instanceIndex).assign(velocities.element(instanceIndex))
            this.predicted.element(instanceIndex).assign(prevPositions.element(instanceIndex).add(velocities.element(instanceIndex).mul(this.fluid.ubos.deltaTime)))
        })().compute(this.count)
        this.counter = instancedArray(2, 'uint').toAtomic()
        this.quietTime = 0
        this.energy = uniform(0)
        this.dt = uniform(1 / 120)
        this.u = Object.fromEntries(['fallSpeed', 'drag', 'inertia', 'maxSpeed', 'viscosity', 'restitution', 'impactThreshold', 'sleepSpeed', 'sleepDelay'].map(key => [key, uniform(settings.simulation[key])]))
        this.sleepEnabled = uniform(settings.simulation.sleep ? 1 : 0)
        this.radius = uniform(settings.snow.radius)
        this.supportHeight = uniform(Math.max(this.radius.value * 10, this.count * this.baseSpacing ** 3 / 0.9))
        this.clearCounter = Fn(() => { atomicStore(this.counter.element(0), 0); atomicStore(this.counter.element(1), 0) })().compute(1)
        this.wakePass = Fn(() =>
        {
            If(this.ages.element(instanceIndex).greaterThanEqual(this.u.sleepDelay), () =>
            {
                velocities.element(instanceIndex).assign(vec3(0))
                prevPositions.element(instanceIndex).assign(positions.element(instanceIndex))
            })
            this.ages.element(instanceIndex).assign(0)
        })().compute(this.count)
        this.project = Fn(() =>
        {
            const id = instanceIndex
            const p = positions.element(id).add(this.contactPosition.element(id)).toVar()
            // PBF solves volume; its positional corrections are not kinetic energy.
            const v = this.incoming.element(id).add(this.contactVelocity.element(id)).toVar()
            const age = this.ages.element(id)
            const fall = hash(id.add(41)).mul(0.3).add(0.85).mul(this.u.fallSpeed)
            const target = this.flow.sample(p).add(this.flow.gravity.mul(fall))
            const relative = target.sub(v)
            const resistance = relative.length().mul(0.45).add(0.6).mul(this.u.drag)
                .div(this.u.inertia.mul(hash(id.add(83)).mul(0.7).add(0.65)))
            v.addAssign(relative.mul(exp(this.dt.mul(resistance).negate()).oneMinus()))
            // Constraint impulses remove inward velocity without turning the
            // positional correction into a pressure-driven launch.
            const correction = positions.element(id).sub(this.predicted.element(id))
            If(correction.length().greaterThan(0.00005), () =>
            {
                const n = correction.div(correction.length())
                v.subAssign(n.mul(v.dot(n).min(0)))
            })
            for(let pass = 0; pass < 3; pass++)
            {
                const knot = knotSurfaceNode(p)
                If(knot.w.lessThan(this.radius), () =>
                {
                    p.addAssign(knot.xyz.mul(this.radius.sub(knot.w)))
                    const closing = v.sub(knotVelocityNode(p)).dot(knot.xyz).min(0)
                    const bounce = closing.negate().sub(this.u.impactThreshold).div(0.5).clamp(0, 1).mul(this.u.restitution)
                    v.subAssign(knot.xyz.mul(closing).mul(bounce.add(1)))
                })
            }
            const limit = float(GLOBE.innerRadius).sub(this.radius)
            const distance = p.length()
            If(distance.greaterThan(limit), () =>
            {
                const n = p.div(distance.max(0.00001))
                p.assign(n.mul(limit))
                v.subAssign(n.mul(v.dot(n).max(0)))
            })
            const ground = exp(p.x.mul(p.x).add(p.z.mul(p.z)).mul(-2.5)).mul(0.085)
                .add(sin(p.x.mul(5.2).add(p.z.mul(3.1))).mul(sin(p.z.mul(4.8).sub(p.x.mul(2.7)))).mul(0.012)).add(GLOBE.floor)
            const floor = ground.add(this.radius)
            If(p.y.lessThanEqual(floor.add(0.0005)), () =>
            {
                p.y.assign(floor)
                v.y.assign(v.y.max(0))
                v.x.mulAssign(0.8); v.z.mulAssign(0.8)
            })
            // Track stable contacts, but keep the complete bed dynamic until
            // every flake is quiet. Partial locks can hold neighbors in arches.
            const touching = p.y.lessThan(floor.add(this.radius.mul(0.5)))
                .or(densities.element(id).greaterThan(this.fluid.ubos.restDensity.mul(0.7)))
            const knotContact = knotSurfaceNode(p).w.lessThan(this.radius.mul(2))
            const lowerWall = p.dot(this.flow.gravity).greaterThan(limit.sub(this.supportHeight))
            const inBed = this.flow.gravity.y.lessThan(-0.25).and(p.y.lessThan(ground.add(this.supportHeight))).or(lowerWall)
            const supported = touching.and(inBed).or(knotContact)
            // Floor friction damps contacts without slowing dense airborne snow.
            If(this.energy.lessThan(0.0001).and(this.flow.gravity.y.lessThan(-0.25)).and(p.y.lessThan(floor.add(this.radius.mul(2)))), () =>
            {
                v.mulAssign(exp(this.dt.mul(-45)))
            })
            const quiet = this.energy.lessThan(0.0001).and(v.length().lessThan(this.u.sleepSpeed)).and(supported).and(this.sleepEnabled.greaterThan(0))
            If(quiet, () => { age.addAssign(this.dt) }).Else(() => { age.assign(0) })
            If(age.greaterThanEqual(this.u.sleepDelay), () =>
            {
                atomicAdd(this.counter.element(0), 1)
            })
            v.mulAssign(this.u.maxSpeed.div(v.length().max(0.00001)).min(1))
            positions.element(id).assign(p)
            velocities.element(id).assign(v)
            // The island threshold tolerates small contact corrections but
            // stays below free-fall speed; require it for multiple readbacks.
            If(inBed.or(knotContact).and(v.length().lessThan(this.u.sleepSpeed.mul(2).min(this.u.fallSpeed.mul(0.5)))), () =>
            {
                atomicAdd(this.counter.element(1), 1)
            })
        })().compute(this.count)
        this.sleepAllPass = Fn(() =>
        {
            this.ages.element(instanceIndex).assign(this.u.sleepDelay)
            velocities.element(instanceIndex).assign(vec3(0))
            prevPositions.element(instanceIndex).assign(positions.element(instanceIndex))
        })().compute(this.count)
        // PBF projects overlaps several times per step. Constrain the globe
        // during each iteration; apply water drag and sleep once, after solving.
        this.constrain = Fn(() =>
        {
            const id = instanceIndex, p = positions.element(id).toVar()
            const distance = p.length(), limit = float(GLOBE.innerRadius).sub(this.radius)
            If(distance.greaterThan(limit), () => { p.mulAssign(limit.div(distance.max(0.00001))) })
            const ground = exp(p.x.mul(p.x).add(p.z.mul(p.z)).mul(-2.5)).mul(0.085)
                .add(sin(p.x.mul(5.2).add(p.z.mul(3.1))).mul(sin(p.z.mul(4.8).sub(p.x.mul(2.7)))).mul(0.012)).add(GLOBE.floor)
            p.y.assign(p.y.max(ground.add(this.radius)))
            for(let pass = 0; pass < 3; pass++)
            {
                const knot = knotSurfaceNode(p)
                If(knot.w.lessThan(this.radius), () => { p.addAssign(knot.xyz.mul(this.radius.sub(knot.w))) })
            }
            positions.element(id).assign(p)
        })().compute(this.count)
        this.boundary = {
            projectPositions: (activeRenderer, fluid, context) =>
            {
                if(this.disposed) return
                if(context.iteration === 0) activeRenderer.compute(this.snapshot)
                activeRenderer.compute(this.constrain)
            },
            applyVelocityResponse: (activeRenderer, fluid, context) =>
            {
                if(this.disposed) return
                this.dt.value = context.deltaTime
                this.fluid.grid.computeGrid(activeRenderer)
                if(!this.contacts)
                {
                    this.contacts = createContactPass(this)
                    this.contactPasses = [this.contacts, this.clearCounter, this.project]
                    this.contactPasses.name = 'Snow contacts + currents + sleep'
                }
                activeRenderer.compute(this.contactPasses)
            }
        }
        this.fluid.addBoundary(this.boundary)
    }

    configure()
    {
        const config = this.settings.simulation
        for(const key in this.u) this.u[key].value = config[key]
        this.sleepEnabled.value = config.sleep ? 1 : 0
        this.radius.value = this.settings.snow.radius
        this.fluid.solverIterations = config.iterations
        this.fluid.ubos.maxSpeed.value = config.maxSpeed
        this.fluid.ubos.particleRadius.value = this.radius.value
        const spacing = Math.max(config.restSpacing, this.radius.value * 2)
        this.supportHeight.value = Math.max(this.radius.value * 10, this.count * spacing ** 3 / 0.9)
        this.fluid.setMass(this.baseMass * (spacing / this.baseSpacing) ** 3)
        this.fluid.setTimeStepOptions({ fixedDelta: 1 / (60 * config.substeps), maxSubsteps: config.substeps * 2 })
        this.wake()
    }

    wake()
    {
        this.generation++
        this.sleeping = false
        this.sleepingCount = 0
        this.needsWake = true
        this.needsSleepAll = false
        this.quietTime = 0
    }

    async update(motion, time, dt)
    {
        if(this.disposed) return
        if((knotPose.moving || motion.rotating) && (this.sleeping || this.needsSleepAll)) this.wake()
        if(motion.energy > 0.02 && this.sleeping) this.wake()
        if(this.sleeping) return
        if(this.needsSleepAll)
        {
            this.renderer.compute(this.sleepAllPass)
            this.sleeping = true
            this.sleepingCount = this.count
            this.needsSleepAll = false
            return
        }
        this.energy.value = Math.max(motion.energy, knotPose.moving ? 0.001 : 0)
        if(this.needsWake)
        {
            this.renderer.compute(this.wakePass)
            this.needsWake = false
        }
        await this.fluid.step(this.renderer, dt)
        if(this.disposed) return
        this.steps++
        this.readbackTime += dt
        if(this.settings.simulation.sleep && !knotPose.moving && motion.energy < 0.0001 && this.readbackTime > 0.75 && !this.pending)
        {
            this.readbackTime = 0
            this.pending = true
            const generation = this.generation
            this.renderer.getArrayBufferAsync(this.counter.value).then(buffer =>
            {
                if(this.disposed || generation !== this.generation) return
                const counts = new Uint32Array(buffer)
                // Let every particle finish resolving its neighbors before
                // freezing the connected bed; partial locks can support arches.
                if(counts[0] === this.count) this.needsSleepAll = true
                this.quietTime = counts[1] === this.count ? this.quietTime + 0.75 : 0
                if(this.quietTime >= Math.max(1.5, this.settings.simulation.sleepDelay)) this.needsSleepAll = true
            }).catch(error => { if(!this.disposed) console.warn('Sleep counter readback failed.', error) })
                .finally(() => { this.pending = false })
        }
    }

    dispose()
    {
        this.disposed = true
        this.generation++
        this.fluid.removeBoundary(this.boundary)
        this.fluid.dispose()
        for(const node of [this.ages, this.counter, this.clearCounter, this.project, this.wakePass, this.sleepAllPass, this.constrain, this.incoming, this.predicted, this.contactCorrections, this.snapshot, this.contacts]) node?.dispose()
    }
}
