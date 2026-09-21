// The same (2, 3) centerline used by Three.js TorusKnotGeometry.
export const KNOT = { radius: 0.56, tube: 0.14, p: 2, q: 3, rotateZ: 0.22, rotateY: 0.42, offsetY: 0 }
export const KNOT_FIELD = { size: 64, extent: 1.7, margin: 0.007 }
export const knotPose = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], scale: 1, angularVelocity: { x: 0, y: 0, z: 0 }, moving: false }
export function setKnotPose(rotation, scale, angularVelocity)
{
    knotPose.rotation = Array.from(rotation)
    knotPose.scale = scale
    Object.assign(knotPose.angularVelocity, angularVelocity)
    knotPose.moving = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z) > 0.00001
}
export function knotVelocity(x, y, z, out = {})
{
    const w = knotPose.angularVelocity
    out.x = w.y * z - w.z * (y - KNOT.offsetY)
    out.y = w.z * x - w.x * z
    out.z = w.x * (y - KNOT.offsetY) - w.y * x
    return out
}

const points = []
for(let i = 0; i <= 128; i++)
{
    const u = i / 128 * KNOT.p * Math.PI * 2
    const r = KNOT.radius * (2 + Math.cos(KNOT.q / KNOT.p * u)) * 0.5
    const x = r * Math.cos(u), y = r * Math.sin(u), z = KNOT.radius * Math.sin(KNOT.q / KNOT.p * u) * 0.5
    const rx = x * Math.cos(KNOT.rotateZ) - y * Math.sin(KNOT.rotateZ)
    const ry = x * Math.sin(KNOT.rotateZ) + y * Math.cos(KNOT.rotateZ)
    points.push([rx * Math.cos(KNOT.rotateY) + z * Math.sin(KNOT.rotateY), ry, -rx * Math.sin(KNOT.rotateY) + z * Math.cos(KNOT.rotateY)])
}
KNOT.offsetY = -0.86 - (Math.min(...points.map(point => point[1])) - KNOT.tube)
for(const point of points) point[1] += KNOT.offsetY
const segments = new Float64Array(128 * 7)
for(let i = 0; i < 128; i++)
{
    const a = points[i], b = points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
    segments.set([...a, dx, dy, dz, 1 / (dx * dx + dy * dy + dz * dz)], i * 7)
}

export function exactKnotSurface(x, y, z, out = {})
{
    let best = Infinity, nx = 1, ny = 0, nz = 0
    for(let i = 0; i < segments.length; i += 7)
    {
        const px = x - segments[i], py = y - segments[i + 1], pz = z - segments[i + 2]
        const t = Math.max(0, Math.min(1, (px * segments[i + 3] + py * segments[i + 4] + pz * segments[i + 5]) * segments[i + 6]))
        const dx = px - segments[i + 3] * t, dy = py - segments[i + 4] * t, dz = pz - segments[i + 5] * t
        const d = dx * dx + dy * dy + dz * dz
        if(d < best) { best = d; nx = dx; ny = dy; nz = dz }
    }
    const length = Math.sqrt(best), scale = 1 / Math.max(length, 0.000001)
    out.x = nx * scale; out.y = ny * scale; out.z = nz * scale
    out.distance = length - KNOT.tube
    return out
}

let field
export function getKnotField()
{
    if(field) return field
    const { size, extent } = KNOT_FIELD
    field = new Float32Array(size ** 3 * 4)
    const sample = {}
    for(let z = 0; z < size; z++) for(let y = 0; y < size; y++) for(let x = 0; x < size; x++)
    {
        exactKnotSurface((x + 0.5) / size * extent * 2 - extent, (y + 0.5) / size * extent * 2 - extent, (z + 0.5) / size * extent * 2 - extent, sample)
        const i = ((z * size + y) * size + x) * 4
        field[i] = sample.x; field[i + 1] = sample.y; field[i + 2] = sample.z; field[i + 3] = sample.distance
    }
    return field
}

// Trilinear lookup matches the GPU texture, avoiding curve searches per flake.
export function knotSurface(x, y, z, out = {}, pose = knotPose)
{
    const m = pose.rotation, scale = pose.scale, py = y - KNOT.offsetY
    const lx = (m[0] * x + m[1] * py + m[2] * z) / scale
    const ly = (m[3] * x + m[4] * py + m[5] * z) / scale + KNOT.offsetY
    const lz = (m[6] * x + m[7] * py + m[8] * z) / scale
    localKnotSurface(lx, ly, lz, out)
    const nx = out.x, ny = out.y, nz = out.z
    out.x = m[0] * nx + m[3] * ny + m[6] * nz
    out.y = m[1] * nx + m[4] * ny + m[7] * nz
    out.z = m[2] * nx + m[5] * ny + m[8] * nz
    out.distance *= scale
    return out
}

function localKnotSurface(x, y, z, out)
{
    const data = getKnotField(), { size, extent, margin } = KNOT_FIELD
    const gx = Math.max(0, Math.min(size - 1.000001, (x / (extent * 2) + 0.5) * size - 0.5))
    const gy = Math.max(0, Math.min(size - 1.000001, (y / (extent * 2) + 0.5) * size - 0.5))
    const gz = Math.max(0, Math.min(size - 1.000001, (z / (extent * 2) + 0.5) * size - 0.5))
    const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz), fx = gx - ix, fy = gy - iy, fz = gz - iz
    out.x = out.y = out.z = out.distance = 0
    for(let dz = 0; dz <= 1; dz++) for(let dy = 0; dy <= 1; dy++) for(let dx = 0; dx <= 1; dx++)
    {
        const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz)
        const i = (((iz + dz) * size + iy + dy) * size + ix + dx) * 4
        out.x += data[i] * weight; out.y += data[i + 1] * weight; out.z += data[i + 2] * weight; out.distance += data[i + 3] * weight
    }
    const scale = 1 / Math.max(0.00001, Math.hypot(out.x, out.y, out.z))
    out.x *= scale; out.y *= scale; out.z *= scale; out.distance -= margin
    return out
}

const surface = {}, wallVelocity = {}
export function collideKnot(positions, velocities, offset, radius, bounce = 0)
{
    for(let pass = 0; pass < 3; pass++)
    {
        const s = knotSurface(positions[offset], positions[offset + 1], positions[offset + 2], surface)
        if(s.distance >= radius) break
        const penetration = radius - s.distance + 0.00001
        positions[offset] += s.x * penetration; positions[offset + 1] += s.y * penetration; positions[offset + 2] += s.z * penetration
        const wall = knotVelocity(positions[offset], positions[offset + 1], positions[offset + 2], wallVelocity)
        const approach = Math.min(0, (velocities[offset] - wall.x) * s.x + (velocities[offset + 1] - wall.y) * s.y + (velocities[offset + 2] - wall.z) * s.z)
        const impulse = -approach * (1 + bounce * Math.min(1, -approach / 0.5))
        velocities[offset] += s.x * impulse; velocities[offset + 1] += s.y * impulse; velocities[offset + 2] += s.z * impulse
    }
}
