import { Fn, float, vec2, vec3 } from 'three/tsl'

// A normalized 5×5 Gaussian (sigma 1), paired into three linear-filtered
// samples per axis. The Cartesian product needs nine texture reads.
const axis = [
    { offset: -1.1824255238, weight: 0.2986900266 },
    { offset: 0, weight: 0.4026199468 },
    { offset: 1.1824255238, weight: 0.2986900266 }
]

/** Mip-assisted Gaussian keeps broad radii at nine color reads. */
export function createGaussianWaterBlur(buffer)
{
    // Keep this graph inline: a named Fn layout capturing a texture can retain
    // another material's binding names when shared across optical pipelines.
    return Fn(([uv, radius, baseLevel]) =>
    {
        const footprint = radius.max(0)
        const level = baseLevel.max(footprint.max(1).log2())
        const stride = float(2).pow(level).mul(footprint.min(1))
        const texel = vec2(1).div(vec2(buffer.size(0)))
        const sum = vec3(0).toVar()
        for(const x of axis) for(const y of axis)
        {
            const sampleUV = uv.add(vec2(x.offset, y.offset).mul(texel).mul(stride))
                .clamp(texel.mul(0.5), texel.mul(0.5).oneMinus())
            sum.addAssign(buffer.sample(sampleUV).level(level).rgb.mul(x.weight * y.weight))
        }
        return sum
    })
}
