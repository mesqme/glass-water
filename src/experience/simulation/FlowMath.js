import { knotSurface, knotVelocity, knotPose } from './KnotShape.js'
import { sampleStartupFlow } from './StartupFlow.js'

// Non-coplanar vortices prevent the whole suspension becoming one rotating sheet.
export const EDDIES = [
    [-0.65, -0.25, 0.25, 0.2, 0.8, 0.6, 1.8],
    [0.55, 0.25, -0.4, 0.8, -0.3, 0.4, 2.8],
    [-0.15, 0.85, 0.25, -0.5, 0.2, 0.9, 3.8],
    [0.35, -0.55, 0.6, 0.7, 0.6, -0.3, 4.8]
]
const surface = {}, startup = {}
export function sampleFlow(x, y, z, motion, time, config, out = {})
{
    const amplitude = Math.sqrt(Math.max(0, motion.energy))
    const omega = motion.angularVelocity
    if(amplitude < 0.00001 && !knotPose.moving && (!omega || Math.hypot(omega.x, omega.y, omega.z) < 0.00001)) { out.x = out.y = out.z = 0; return out }
    const r2 = (x * x + y * y + z * z) / 2.205225
    const ax = -motion.current.x * 0.48, ay = -motion.current.y * 0.48, az = motion.current.x * 0.21 - (motion.current.z ?? 0) * 0.48
    const dot = (ax * x + ay * y + az * z) / 2.205225
    let fx = ax * (1 - 2 * r2) + x * dot, fy = ay * (1 - 2 * r2) + y * dot, fz = az * (1 - 2 * r2) + z * dot
    for(const [cx, cy, cz, ox, oy, oz, phase] of EDDIES)
    {
        const dx = x - cx, dy = y - cy, dz = z - cz
        const weight = Math.exp(-(dx * dx + dy * dy + dz * dz) * 1.7) * (0.65 + Math.sin(time * 0.83 + phase) * 0.6)
        fx += (oy * dz - oz * dy) * weight * 2.3
        fy += (oz * dx - ox * dz) * weight * 2.3
        fz += (ox * dy - oy * dx) * weight * 2.3
    }
    const a = Math.cos(y * 4.1 + z * 2.3 + time * 1.17), b = Math.cos(z * 3.7 + x * 2.9 - time * 0.93), c = Math.cos(x * 4.3 + y * 2.7 + time * 0.71)
    const turbulence = (config.turbulence ?? 0.65) * 0.32
    fx += (2.7 * c - 3.7 * b) * turbulence
    fy += (2.3 * a - 4.3 * c) * turbulence
    fz += (2.9 * b - 4.1 * a) * turbulence
    const intro = motion.startupSwirl ?? 0
    if(intro > 0)
    {
        sampleStartupFlow(x, y, z, startup)
        fx = fx * (1 - intro) + startup.x * intro
        fy = fy * (1 - intro) + startup.y * intro
        fz = fz * (1 - intro) + startup.z * intro
    }
    const speed = Math.hypot(fx, fy, fz), scale = amplitude * Math.min(1, 2.2 / Math.max(speed, 0.001))
    fx *= scale; fy *= scale; fz *= scale
    const s = knotSurface(x, y, z, surface)
    const motor = config.knotStirring ?? 1
    const stirred = Math.exp(-Math.max(0, s.distance) * 7) * 0.65 * motor
    const angularSpeed = Math.hypot(knotPose.angularVelocity.x, knotPose.angularVelocity.y, knotPose.angularVelocity.z)
    const wake = angularSpeed * Math.exp(-Math.max(0, s.distance) * 4) * (config.turbulence ?? 0.65) * 0.08 * motor
    knotVelocity(x, y, z, out)
    fx += out.x * stirred + (2.7 * c - 3.7 * b) * wake
    fy += out.y * stirred + (2.3 * a - 4.3 * c) * wake
    fz += out.z * stirred + (2.9 * b - 4.1 * a) * wake
    if(omega)
    {
        fx -= (omega.y * z - omega.z * y) * 0.45
        fy -= (omega.z * x - omega.x * z) * 0.45
        fz -= (omega.x * y - omega.y * x) * 0.45
    }
    const strength = config.currentStrength ?? 1
    fx *= strength; fy *= strength; fz *= strength
    const intoKnot = Math.min(0, fx * s.x + fy * s.y + fz * s.z) * Math.max(0, 1 - Math.max(0, s.distance) / 0.28)
    fx -= s.x * intoKnot; fy -= s.y * intoKnot; fz -= s.z * intoKnot
    const outward = Math.max(0, (fx * x + fy * y + fz * z) / Math.max(0.01, x * x + y * y + z * z)) * Math.max(0, (r2 - 0.72) / 0.28)
    fx -= x * outward; fy -= y * outward; fz -= z * outward
    out.x = fx; out.y = fy; out.z = fz
    return out
}
