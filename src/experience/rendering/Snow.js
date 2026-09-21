import * as THREE from 'three/webgpu'
import { Fn, attribute, hash, instanceIndex, uniform, vec3, varying } from 'three/tsl'
import { sphereImpostorPosition, sphereImpostorAlpha, sphereImpostorDepth } from 'three-blocks/sphere-impostors'
import { BlockSnowSolver } from '../simulation/BlockSnowSolver.js'
import { CPUSnowSolver } from '../simulation/CPUSnowSolver.js'
import { makeSnowSeeds } from '../simulation/SnowPhysics.js'
import { FlowColors } from './FlowColors.js'
import { FlowHistory } from './FlowHistory.js'
import { seedStartupFlow } from '../simulation/StartupFlow.js'
import { ParticleActivity } from './ParticleActivity.js'
import { particleUsesFlow } from '../config/Settings.js'

export class Snow
{
    constructor(group, renderer, settings, flow)
    {
        this.renderer = renderer
        this.settings = settings
        this.gpu = renderer.backend.isWebGPUBackend
        this.count = settings.snow.count
        this.disposed = false
        const seeds = makeSnowSeeds(this.count)
        const startup = seedStartupFlow(seeds, settings.simulation)
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3))
        let positionNode
        if(this.gpu)
        {
            this.solver = new BlockSnowSolver(renderer, seeds, settings, flow)
            // Seed before Three uploads/pads vec3 storage for WebGPU.
            this.solver.positions.value.array.set(seeds)
            this.solver.fluid.buffers.prevPositions.value.array.set(seeds)
            this.solver.velocities.value.array.set(startup.velocities)
            positionNode = this.solver.positions.element(instanceIndex)
        }
        else
        {
            this.solver = new CPUSnowSolver(seeds, settings)
            this.solver.velocities.set(startup.velocities)
            this.positionAttribute = new THREE.InstancedBufferAttribute(this.solver.positions, 3).setUsage(THREE.DynamicDrawUsage)
            geometry.setAttribute('snowPosition', this.positionAttribute)
            positionNode = attribute('snowPosition', 'vec3')
        }
        this.radius = uniform(settings.snow.radius)
        this.variation = uniform(settings.snow.variation)
        const size = hash(instanceIndex.add(73)).mul(2).sub(1).mul(this.variation).add(1).mul(this.radius)
        this.baseColor = uniform(new THREE.Color(settings.snow.color))
        this.brightness = uniform(settings.snow.brightness)
        this.activityTracker = new ParticleActivity(this.solver, this.gpu, geometry, seeds, settings.activity)
        this.history = new FlowHistory(this.solver, this.gpu, geometry, flow, this.count, startup.history, this.activityTracker)
        this.flowColors = new FlowColors(this.history.water, settings.debug)
        this.basicMaterial = new THREE.MeshBasicNodeMaterial({
            positionNode: Fn(() => sphereImpostorPosition({ position: positionNode, radius: size }))(),
            opacityNode: sphereImpostorAlpha(), depthNode: sphereImpostorDepth(), alphaTest: 0.5
        })
        this.activity = { gain: uniform(1.5), curve: uniform(0.7), minimum: uniform(0.015) }
        const activity = this.activityTracker.speed.mul(this.activity.gain).clamp(0, 1).pow(this.activity.curve).max(this.activity.minimum)
        this.activityMaterial = new THREE.MeshBasicNodeMaterial({
            positionNode: this.basicMaterial.positionNode, opacityNode: this.basicMaterial.opacityNode,
            depthNode: this.basicMaterial.depthNode, alphaTest: 0.5, colorNode: varying(vec3(activity)).mul(this.brightness)
        })
        this.mesh = new THREE.InstancedMesh(geometry, this.basicMaterial, this.count)
        this.mesh.frustumCulled = false
        this.mesh.name = 'Suspended snow particles'
        group.add(this.mesh)
        this.configureMaterial()
    }

    get sleeping() { return this.solver.sleeping }
    get sleepingCount() { return this.solver.sleepingCount }
    wake() { this.solver.wake() }
    configureDebug()
    {
        this.flowColors.update()
        const enabled = particleUsesFlow(this.settings)
        if(enabled !== this.debugEnabled)
        {
            this.debugEnabled = enabled
            this.basicMaterial.colorNode = enabled ? this.flowColors.node.mul(this.brightness) : this.baseColor.mul(this.brightness)
            this.basicMaterial.needsUpdate = true
        }
    }
    configureMaterial()
    {
        const config = this.settings.snow
        this.baseColor.value.set(config.color)
        this.brightness.value = config.brightness
        for(const key of ['gain', 'curve', 'minimum']) this.activity[key].value = this.settings.activity[key]
        const view = this.settings.scene.view
        this.mesh.material = view === 'activity' ? this.activityMaterial : this.basicMaterial
        this.configureDebug()
    }
    configure()
    {
        this.radius.value = this.settings.snow.radius
        this.variation.value = this.settings.snow.variation
        this.configureMaterial()
        this.solver.configure()
    }
    async update(motion, time, dt)
    {
        const wasSleeping = this.sleeping
        await this.solver.update(motion, time, dt)
        if(!this.disposed)
        {
            this.activityTracker.update(dt)
            this.history.update(this.renderer, motion, time, this.settings.simulation, dt)
        }
        if(!this.gpu && !this.disposed && !wasSleeping)
        {
            this.positionAttribute.needsUpdate = true
        }
    }
    dispose()
    {
        this.disposed = true
        this.mesh.removeFromParent()
        this.mesh.geometry.dispose()
        this.basicMaterial.dispose()
        this.activityMaterial.dispose()
        this.activityTracker.dispose()
        this.history.dispose()
        this.mesh.dispose()
        this.solver.dispose()
    }
}
