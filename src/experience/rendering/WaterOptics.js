import * as THREE from 'three/webgpu'
import { Fn, If, cameraFar, cameraNear, cameraProjectionMatrixInverse, exp, float, ivec2, mix, modelViewMatrix, perspectiveDepthToViewZ, positionGeometry, screenSize, screenUV, texture, uniform, vec2, vec3, vec4 } from 'three/tsl'
import { GLOBE } from '../simulation/SnowPhysics.js'
import { createGaussianWaterBlur } from './WaterBlur.js'

/** Process depth once per pixel before Blocks samples the refracted image. */
export class WaterOptics
{
    constructor(colorBuffer, sceneDepth, knotDepth, settings, target)
    {
        this.settings = settings
        this.color = colorBuffer
        // Borrow the knot backdrop after its last read this frame.
        this.target = target
        this.buffer = texture(target.texture)
        const gaussianBlur = createGaussianWaterBlur(colorBuffer)
        this.depth = texture(sceneDepth)
        this.knotDepth = texture(knotDepth)
        this.u = {
            layered: uniform(1), preview: uniform(0),
            clearDepth: uniform(0.08),
            depthEnd: uniform(GLOBE.innerRadius * 2), curve: uniform(1), strength: uniform(1),
            falloff: uniform(1), softness: uniform(0.6), blurFalloff: uniform(1),
            fade: uniform(new THREE.Color())
        }
        this.objectDepth = Fn(([uv]) =>
        {
            // Explicit texel loads preserve depth without a filtering sampler.
            // r185's GLSL depth textureLod path omits its scalar swizzle.
            // Color shares its dimensions with depth and has a mip level even
            // when the depth attachment is multisampled on WebGPU.
            const size = vec2(this.color.size(0))
            const pixel = ivec2(uv.mul(size).clamp(vec2(0), size.sub(1))).toVar()
            const opaqueZ = perspectiveDepthToViewZ(this.depth.load(pixel), cameraNear, cameraFar).negate().toVar()
            // R32F depth needs no filtering sampler; use the same texel as the
            // opaque depth on devices without float32 texture filtering.
            const knotZ = this.knotDepth.load(pixel).r.toVar()
            return this.u.layered.greaterThan(0).and(knotZ.greaterThan(0)).select(opaqueZ.min(knotZ), opaqueZ)
        })
        this.mapDepth = Fn(([path]) =>
        {
            const u = this.u
            const mapped = path.sub(u.clearDepth).div(u.depthEnd.sub(u.clearDepth).max(0.001)).clamp(0, 1).toVar()
            If(u.curve.greaterThan(0.5), () =>
            {
                mapped.assign(mapped.mul(mapped).mul(float(3).sub(mapped.mul(2))))
            })
            return mapped.pow(u.falloff)
        })
        this.depthValue = Fn(([path]) => this.u.preview.greaterThan(1.5)
            .select(this.mapDepth(path), path.div(GLOBE.innerRadius * 2).clamp(0, 1)))
        this.pathLength = Fn(([uv]) =>
        {
            const projected = cameraProjectionMatrixInverse.mul(vec4(uv.x.mul(2).sub(1), uv.y.mul(-2).add(1), 0.5, 1))
            const ray = projected.xyz.div(projected.w).normalize().toVar()
            const center = modelViewMatrix.mul(vec4(0, 0, 0, 1)).xyz
            const along = center.dot(ray)
            const discriminant = float(GLOBE.innerRadius ** 2).sub(center.dot(center).sub(along.mul(along)))
            const halfChord = discriminant.max(0).sqrt()
            const entry = along.sub(halfChord)
            const objectDistance = this.objectDepth(uv).div(ray.z.negate().max(0.0001))
            return objectDistance.sub(entry).clamp(0, halfChord.mul(2))
        })
        this.depthPreview = Fn(([uv]) => vec3(this.depthValue(this.pathLength(uv))))
        this.filter = Fn(([uv, mapped]) =>
        {
            const u = this.u
            const radiance = this.color.sample(uv).level(0).rgb.toVar()
            const blurPixels = mapped.pow(u.blurFalloff).mul(u.softness).mul(12).mul(screenSize.y.div(720))
            If(blurPixels.greaterThan(0.05), () =>
            {
                radiance.assign(gaussianBlur(uv, blurPixels, float(0)))
            })
            return radiance
        })
        this.sample = Fn(([uv]) =>
        {
            const u = this.u
            const mapped = this.mapDepth(this.pathLength(uv)).toVar()
            const fade = exp(mapped.mul(u.strength).negate()).oneMinus()
            return mix(this.filter(uv, mapped), u.fade, fade)
        })
        this.material = new THREE.MeshBasicNodeMaterial({
            vertexNode: vec4(positionGeometry.xy, 0, 1), colorNode: this.sample(screenUV),
            toneMapped: false, depthTest: false, depthWrite: false, blending: THREE.NoBlending
        })
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
        this.mesh.matrixAutoUpdate = false
        this.mesh.frustumCulled = false
        this.scene = new THREE.Scene()
        this.scene.name = 'Water image: depth + Gaussian'
        this.scene.add(this.mesh)
    }

    render(renderer, camera, water)
    {
        const target = renderer.getRenderTarget(), autoClear = renderer.autoClear
        // Use the scene camera and globe transform even though the quad fills
        // clip space. This keeps the depth reconstruction identical to Depth.
        water.updateWorldMatrix(true, false)
        this.mesh.matrix.copy(water.matrixWorld)
        try
        {
            renderer.autoClear = true
            renderer.setRenderTarget(this.target)
            renderer.render(this.scene, camera)
        }
        finally
        {
            renderer.autoClear = autoClear
            renderer.setRenderTarget(target)
        }
    }

    configure(layered)
    {
        const config = this.settings.water, u = this.u
        u.layered.value = layered ? 1 : 0
        u.preview.value = this.settings.scene.view === 'depth' ? (config.depthPreview === 'mapped' ? 2 : 1) : 0
        u.clearDepth.value = config.clearDepth
        // Crossing the sliders is well-defined and never divides by zero.
        u.depthEnd.value = Math.max(config.clearDepth + 0.001, config.depthEnd)
        u.curve.value = config.depthCurve === 'linear' ? 0 : 1
        u.strength.value = config.fadeStrength
        u.falloff.value = config.depthFalloff
        u.softness.value = config.depthSoftness
        u.blurFalloff.value = config.blurDepthFalloff
        u.fade.value.set(config.fadeColor)
    }

    dispose()
    {
        this.mesh.geometry.dispose()
        this.material.dispose()
    }
}
