import * as THREE from 'three/webgpu'
import { positionView, screenUV, texture, vec3 } from 'three/tsl'

/** Capture the front knot surface, then refract the completed opaque interior. */
export class KnotRefraction
{
    constructor(knot, interior)
    {
        this.knot = knot
        this.interior = interior
        this.scene = new THREE.Scene()
        this.scene.name = 'Knot refraction'
        this.black = new THREE.Color(0)
        this.mesh = new THREE.Mesh(knot.geometry, knot.glass)
        this.mesh.matrixAutoUpdate = false
        this.mesh.frustumCulled = false
        this.scene.add(this.mesh)
        this.depth = new THREE.RenderTarget(1, 1, {
            type: THREE.FloatType, format: THREE.RedFormat,
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            generateMipmaps: false, samples: 0
        })
        this.depth.texture.name = 'Knot front surface depth'
        const distance = positionView.z.negate()
        this.depthMaterial = new THREE.MeshBasicNodeMaterial({
            colorNode: vec3(distance), toneMapped: false, blending: THREE.NoBlending
        })
        const selectedDepth = texture(this.depth.texture, screenUV)
        // Derivative tolerance retains MSAA edge samples without selecting a
        // different tube. Surface depths use full float precision.
        knot.glass.maskNode = selectedDepth.r.greaterThan(0).and(distance.sub(selectedDepth.r).abs().lessThan(distance.fwidth().mul(1.25).add(0.0005)))
        this.backdrop = new THREE.RenderTarget(1, 1, {
            type: THREE.HalfFloatType, generateMipmaps: true, depthBuffer: false,
            minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter
        })
        this.needsInit = true
        knot.glass.viewportBuffer = texture(this.backdrop.texture)
    }

    resize(width, height)
    {
        this.depth.setSize(width, height)
        this.backdrop.setSize(width, height)
        this.needsInit = true
    }

    render(renderer, camera, target)
    {
        const autoClear = renderer.autoClear
        if(this.needsInit) { renderer.initRenderTarget(this.backdrop); this.needsInit = false }
        this.mesh.matrix.copy(this.knot.matrixWorld)
        this.scene.environment = this.interior.environment
        this.scene.environmentIntensity = this.interior.environmentIntensity
        try
        {
            this.mesh.material = this.depthMaterial
            this.scene.background = this.black
            renderer.autoClear = true
            renderer.setRenderTarget(this.depth)
            renderer.render(this.scene, camera)
            this.mesh.material = this.knot.glass
            this.scene.background = null
            renderer.autoClear = false
            renderer.setRenderTarget(target)
            // Read only the completed interior, never the current attachment.
            renderer.copyTextureToTexture(target.texture, this.backdrop.texture)
            renderer.render(this.scene, camera)
        }
        finally
        {
            renderer.autoClear = autoClear
            renderer.setRenderTarget(target)
        }
    }

    dispose()
    {
        this.depthMaterial.dispose()
        this.backdrop.dispose()
        this.depth.dispose()
    }
}
