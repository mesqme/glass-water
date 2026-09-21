import { Fn, float, mix, saturation, uniform, varying, vec3 } from 'three/tsl'

/** Fixed six-direction palette shared by particles and flow traces. */
export class FlowColors
{
    constructor(velocity, settings)
    {
        this.settings = settings
        this.saturation = uniform(settings.saturation)
        this.node = varying(Fn(() =>
        {
            const speed = velocity.length(), direction = velocity.div(speed.max(0.00001))
            const weight = direction.abs(), total = weight.x.add(weight.y).add(weight.z)
            const x = direction.x.greaterThanEqual(0).select(vec3(1, 0, 0), vec3(0, 1, 1))
            const y = direction.y.greaterThanEqual(0).select(vec3(0, 1, 0), vec3(1, 0, 1))
            const z = direction.z.greaterThanEqual(0).select(vec3(0, 0, 1), vec3(1, 1, 0))
            const rgb = total.greaterThan(0.00001).select(x.mul(weight.x).add(y.mul(weight.y)).add(z.mul(weight.z)).div(total.max(0.00001)), vec3(0.5))
            const intensity = speed.mul(2.2).clamp(0, 1)
            // Keep the established palette exposure; Brightness is the sole
            // user-facing multiplier. This does not illuminate other objects.
            return saturation(rgb, this.saturation).max(vec3(0)).mul(mix(float(0.2), float(1), intensity)).mul(2)
        })())
    }
    update() { this.saturation.value = this.settings.saturation }
}
