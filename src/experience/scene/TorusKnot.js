import * as THREE from 'three/webgpu'
import { MeshTransmissionNodeMaterial } from 'three-blocks/transmission'
import { KNOT } from '../simulation/KnotShape.js'
import { KnotMotion } from '../input/KnotMotion.js'
import { applyMaterialSettings } from '../rendering/MaterialSettings.js'

export class TorusKnot extends THREE.Mesh
{
    constructor(settings)
    {
        const geometry = new THREE.TorusKnotGeometry(KNOT.radius, KNOT.tube, 192, 24, KNOT.p, KNOT.q)
        geometry.rotateZ(KNOT.rotateZ)
        geometry.rotateY(KNOT.rotateY)
        const physical = new THREE.MeshPhysicalNodeMaterial()
        super(geometry, physical)
        this.settings = settings
        this.physical = physical
        this.glass = new MeshTransmissionNodeMaterial({ transmission: 1, metalness: 0, ditherStrength: 0,
            chromaticAberration: 0.005, samples: 1, transparent: true, depthWrite: false })
        this.motion = new KnotMotion()
        this.position.y = KNOT.offsetY
        this.name = 'Torus knot · solid flow obstacle'
        this.configure()
        this.update(0)
    }
    configure()
    {
        const { material, glass, scale, autoRotate, axisX, axisY, axisZ, speed, ...physical } = this.settings
        applyMaterialSettings(this.physical, physical)
        applyMaterialSettings(this.glass, glass)
        this.material = material === 'glass' ? this.glass : this.physical
        this.renderOrder = this.material === this.glass ? 2 : 0
    }
    update(dt)
    {
        this.motion.update(this.settings, dt)
        this.quaternion.copy(this.motion.quaternion)
        this.scale.setScalar(this.settings.scale)
    }
}
