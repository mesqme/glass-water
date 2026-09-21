import { BufferGeometry, Float32BufferAttribute } from 'three'
import { GLOBE, groundHeight } from '../simulation/SnowPhysics.js'

export function createGroundGeometry(rings = 36, segments = 112)
{
    const limit = GLOBE.innerRadius - 0.012
    const rim = []
    for(let i = 0; i <= segments; i++)
    {
        const angle = i / segments * Math.PI * 2, cx = Math.cos(angle), cz = Math.sin(angle)
        let low = 0, high = limit
        for(let step = 0; step < 28; step++)
        {
            const r = (low + high) * 0.5, y = groundHeight(cx * r, cz * r)
            if(r * r + y * y < limit * limit) low = r
            else high = r
        }
        rim.push({ r: low, y: groundHeight(cx * low, cz * low), cx, cz })
    }
    const build = (rows, point, reverse = false) =>
    {
        const vertices = [], indices = []
        for(let j = 0; j <= rows; j++) for(let i = 0; i <= segments; i++)
        {
            vertices.push(...point(j / rows, rim[i]))
            if(j < rows && i < segments)
            {
                const a = j * (segments + 1) + i, b = a + segments + 1
                if(reverse) indices.push(a, b, a + 1, a + 1, b, b + 1)
                else indices.push(a, a + 1, b, a + 1, b + 1, b)
            }
        }
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
        geometry.setIndex(indices)
        geometry.computeVertexNormals()
        return geometry
    }
    const surface = build(rings, (t, edge) =>
    {
        const x = edge.cx * edge.r * t, z = edge.cz * edge.r * t
        return [x, groundHeight(x, z), z]
    })
    const substrate = build(24, (t, edge) =>
    {
        const start = Math.acos(edge.y / limit), angle = start + (Math.PI - start) * t
        const r = Math.sin(angle) * limit
        return [edge.cx * r, Math.cos(angle) * limit, edge.cz * r]
    })
    return { surface, substrate }
}
