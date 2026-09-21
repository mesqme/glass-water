import * as THREE from 'three/webgpu'
import { attribute, cameraFar, cameraNear, mix, perspectiveDepthToViewZ, positionView, screenUV, texture, uniform } from 'three/tsl'
import { FlowColors } from './FlowColors.js'
import { makeFlowSeeds, traceFlow, TRACE_SEGMENTS } from './FlowTraces.js'

/** Undistorted current traces composited after the globe's optical passes. */
export class FlowDebug
{
    constructor(settings, globe, interiorDepth)
    {
        this.settings = settings
        this.globe = globe
        this.scene = new THREE.Scene()
        this.scene.name = 'Flow overlay'
        this.root = new THREE.Group()
        this.root.matrixAutoUpdate = false
        this.scene.add(this.root)
        this.root.visible = false
        this.phase = uniform(0)
        this.blend = uniform(1)
        this.duration = uniform(settings.flow.duration)
        this.brightness = uniform(settings.flow.brightness)
        this.palette = new FlowColors(attribute('flowVelocity', 'vec3'), settings.flow)
        const travel = attribute('travel', 'float')
        const pulse = travel.sub(this.phase).div(this.duration).mul(Math.PI * 6).cos().mul(0.5).add(0.5).pow(5)
        const fade = travel.div(this.duration).smoothstep(0, 0.12).mul(travel.div(this.duration).oneMinus().smoothstep(0, 0.2))
        // Reuse opaque depth at the unbent screen coordinate. The shell's depth
        // would hide interior traces; sampling its color would refract them.
        const opaqueZ = perspectiveDepthToViewZ(texture(interiorDepth, screenUV).r, cameraNear, cameraFar)
        this.material = new THREE.LineBasicNodeMaterial({
            positionNode: mix(attribute('previousPosition', 'vec3'), attribute('position', 'vec3'), this.blend),
            colorNode: this.palette.node.mul(this.brightness),
            opacityNode: pulse.mul(0.55).add(0.45).mul(fade).mul(attribute('flowVelocity', 'vec3').length().smoothstep(0, 0.04)),
            maskNode: positionView.z.greaterThanEqual(opaqueZ.sub(0.002)),
            transparent: true, depthTest: false, depthWrite: false, toneMapped: false
        })
        this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.material)
        this.lines.frustumCulled = false
        this.root.add(this.lines)
        this.elapsed = Infinity
        this.dirty = true
    }

    configure()
    {
        const config = this.settings.flow
        this.duration.value = config.duration
        this.brightness.value = config.brightness
        this.palette.update()
        const key = [config.count, config.slice, config.offset, config.width].join(':')
        if(key !== this.seedKey)
        {
            this.seedKey = key
            this.seeds = makeFlowSeeds(config.count, config)
            const geometry = new THREE.BufferGeometry(), vertices = config.count * TRACE_SEGMENTS * 2
            for(const name of ['position', 'previousPosition', 'flowVelocity'])
                geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage))
            const travel = new Float32Array(vertices)
            for(let i = 0; i < vertices; i++) travel[i] = (Math.floor(i / 2) % TRACE_SEGMENTS + i % 2) / TRACE_SEGMENTS
            geometry.setAttribute('travel', new THREE.BufferAttribute(travel, 1))
            this.lines.geometry.dispose()
            this.lines.geometry = geometry
            this.fresh = true
        }
        const travel = this.lines.geometry.getAttribute('travel')
        for(let i = 0; i < travel.count; i++) travel.array[i] = (Math.floor(i / 2) % TRACE_SEGMENTS + i % 2) / TRACE_SEGMENTS * config.duration
        travel.needsUpdate = true
        this.dirty = true
    }

    update(motion, time, dt)
    {
        if(!this.seeds) this.configure()
        const paused = this.settings.simulation.paused
        this.elapsed += dt
        if(!paused) this.phase.value += dt
        if(this.dirty || (!paused && this.elapsed >= 1 / 12))
        {
            const geometry = this.lines.geometry
            const previous = geometry.getAttribute('previousPosition'), position = geometry.getAttribute('position'), velocity = geometry.getAttribute('flowVelocity')
            // Preserve the displayed interpolation when controls change mid-step.
            for(let i = 0; i < previous.array.length; i++) previous.array[i] += (position.array[i] - previous.array[i]) * this.blend.value
            traceFlow(this.seeds, motion, time, this.settings.simulation, this.settings.flow, position.array, velocity.array)
            if(this.fresh) previous.array.set(position.array)
            previous.needsUpdate = position.needsUpdate = velocity.needsUpdate = true
            this.elapsed = 0
            this.dirty = this.fresh = false
        }
        this.blend.value = Math.min(1, this.elapsed * 12)
    }

    render(renderer, camera)
    {
        this.globe.inside.updateWorldMatrix(true, false)
        this.root.matrix.copy(this.globe.inside.matrixWorld)
        const autoClear = renderer.autoClear
        try
        {
            renderer.autoClear = false
            renderer.render(this.scene, camera)
        }
        finally { renderer.autoClear = autoClear }
    }

    dispose()
    {
        this.root.removeFromParent()
        this.lines.geometry.dispose()
        this.material.dispose()
    }
}
