import * as THREE from 'three/webgpu'
import { color, lights, positionLocal, sin } from 'three/tsl'
import { MeshTransmissionNodeMaterial } from 'three-blocks/transmission'
import { GLOBE } from '../simulation/SnowPhysics.js'
import { TorusKnot } from './TorusKnot.js'
import { createGroundGeometry } from './GroundGeometry.js'
import { Pedestal } from './Pedestal.js'
import { updateGlobeOrientation } from '../input/GlobeOrientation.js'

export class Globe
{
    constructor(interior, exterior, backgroundNode, settings, waterScene, groundLight)
    {
        this.inside = new THREE.Group()
        this.outside = new THREE.Group()
        this.waterLayer = new THREE.Group()
        this.rotation = new THREE.Quaternion()
        this.cameraForward = new THREE.Vector3(0, 0, -1)
        waterScene.add(this.waterLayer)
        interior.add(this.inside)
        exterior.add(this.outside)

        this.glassMaterial = new MeshTransmissionNodeMaterial({
            ...settings.glass, ditherStrength: 0, transparent: true, depthWrite: false,
            viewportBuffer: backgroundNode
        })
        this.shell = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.radius, 112, 80), this.glassMaterial)
        this.shell.name = 'Glass shell'
        this.outside.add(this.shell)

        // A second, closed interface gives the filled globe its water refraction.
        this.waterMaterial = new MeshTransmissionNodeMaterial({
            transmission: 1, color: '#faffff', ior: 1.333, thickness: 0.26,
            roughness: 0.012, chromaticAberration: 0, dispersion: 0,
            // White attenuation is lossless at any finite distance. Keep
            // Infinity out of the transmission arithmetic on mobile GPUs.
            attenuationColor: '#ffffff', attenuationDistance: 1,
            samples: 1, envMapIntensity: 0.28, ditherStrength: 0,
            transparent: true, depthWrite: false
        })
        this.water = new THREE.Mesh(new THREE.SphereGeometry(GLOBE.innerRadius, 96, 64), this.waterMaterial)
        this.waterLayer.add(this.water)

        // A gently uneven snow floor with the same height function as collisions.
        const ground = createGroundGeometry()
        const snow = new THREE.MeshStandardNodeMaterial({ color: '#e9f0f4', roughness: 0.86, metalness: 0 })
        snow.lightsNode = lights([groundLight])
        const grain = sin(positionLocal.x.mul(217)).mul(sin(positionLocal.z.mul(193))).mul(0.03).add(0.97)
        snow.colorNode = color('#e9eff3').mul(grain)
        const floor = new THREE.Mesh(ground.surface, snow)
        floor.name = 'Snow-covered ground'
        this.inside.add(floor)
        const soil = new THREE.Mesh(ground.substrate, new THREE.MeshStandardNodeMaterial({ color: '#dce7ed', roughness: 0.8 }))
        soil.material.lightsNode = lights([groundLight])
        this.inside.add(soil)
        this.knot = new TorusKnot(settings.knot)
        this.inside.add(this.knot)

        // The opaque pedestal shares the outer glass depth buffer.
        this.pedestal = new Pedestal(settings.base)
        this.outside.add(this.pedestal)
    }

    update(motion, camera)
    {
        camera?.getWorldDirection(this.cameraForward)
        updateGlobeOrientation(motion, this.cameraForward, this.rotation)
        // Keep phone shake translation within the larger framing's margins.
        const limits = camera?.userData.motionLimits
        const x = limits ? limits.x * Math.tanh(motion.position.x / limits.x) : motion.position.x
        const y = limits ? limits.y * Math.tanh(motion.position.y / limits.y) : motion.position.y
        for(const group of [this.inside, this.outside, this.waterLayer])
        {
            group.position.set(x, GLOBE.centerY + y, 0)
            group.quaternion.copy(this.rotation)
        }
    }

}
