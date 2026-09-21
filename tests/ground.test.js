import test from 'node:test'
import assert from 'node:assert/strict'
import { createGroundGeometry } from '../src/experience/scene/GroundGeometry.js'
import { GLOBE, groundHeight } from '../src/experience/simulation/SnowPhysics.js'

test('terrain and its substrate fit entirely inside the water volume', () =>
{
    const { surface, substrate } = createGroundGeometry()
    try
    {
        for(const geometry of [surface, substrate])
        {
            const points = geometry.getAttribute('position')
            for(let i = 0; i < points.count; i++)
            {
                const radius = Math.hypot(points.getX(i), points.getY(i), points.getZ(i))
                assert.ok(radius <= GLOBE.innerRadius - 0.0119, 'ground cannot protrude through the spherical boundary')
            }
        }
        const points = surface.getAttribute('position')
        for(let i = 0; i < points.count; i++)
            assert.ok(Math.abs(points.getY(i) - groundHeight(points.getX(i), points.getZ(i))) < 0.000001, 'visible ground matches particle collision height')
    }
    finally { surface.dispose(); substrate.dispose() }
})

test('the snow surface and spherical substrate meet at a continuous rim', () =>
{
    const rings = 36, segments = 112, { surface, substrate } = createGroundGeometry(rings, segments)
    try
    {
        const top = surface.getAttribute('position'), bottom = substrate.getAttribute('position')
        for(let i = 0; i <= segments; i++) for(let axis = 0; axis < 3; axis++)
            assert.ok(Math.abs(top.array[(rings * (segments + 1) + i) * 3 + axis] - bottom.array[i * 3 + axis]) < 0.000001)
    }
    finally { surface.dispose(); substrate.dispose() }
})
