import * as THREE from 'three/webgpu'

const profile = [[0, -1.72], [1.04, -1.72], [1.11, -1.71], [1.14, -1.68], [1.15, -1.64], [1.15, -1.29], [1.14, -1.24], [1.12, -1.20], [1.09, -1.18], [0, -1.18]]

export class Pedestal extends THREE.Mesh
{
    constructor(settings)
    {
        super(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 112), new THREE.MeshStandardNodeMaterial())
        this.settings = settings
        this.name = 'Pedestal'
        this.configure()
    }
    configure()
    {
        this.material.color.set(this.settings.color)
        this.material.roughness = this.settings.roughness
        this.material.metalness = this.settings.metalness
    }
}
