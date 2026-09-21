import * as THREE from 'three/webgpu'

// Cool reflection rig. These cards are baked, not drawn per frame.
const CARDS = [['#e7f3ff', 3, [-4, 5, 3], [.6, 5]], ['#74c9ff', 8, [3, 2, -4], [.65, 5]], ['#b4e5ff', 7, [-4, 2, -2], [.5, 5]], ['#eaf4ff', 3, [0, 6, 0], [3, 1]]]

export function createEnvironment(scene, renderer, settings)
{
    scene.background = new THREE.Color(0x000000)
    const studio = new THREE.Scene()
    studio.background = new THREE.Color('#090c12')
    for(const [color, strength, position, size] of CARDS)
    {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicNodeMaterial({
            color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide
        }))
        mesh.position.set(...position)
        mesh.lookAt(0, 1.6, 0)
        studio.add(mesh)
    }
    const generator = new THREE.PMREMGenerator(renderer)
    const environment = generator.fromScene(studio, 0.025, 0.1, 30)
    generator.dispose()
    studio.traverse(object => { object.geometry?.dispose(); object.material?.dispose() })
    scene.environment = environment.texture
    const hemi = new THREE.HemisphereLight(settings.ground.color, '#ffffff', settings.ground.intensity)
    hemi.updateMatrixWorld()
    return {
        groundLight: hemi,
        update: () =>
        {
            scene.background.set(settings.scene.background)
            scene.environmentIntensity = settings.scene.environment
            hemi.color.set(settings.ground.color)
            hemi.intensity = settings.ground.intensity
        },
        dispose: () => environment.dispose()
    }
}
