import { Fn, If, Loop, float, instanceIndex, int, ivec3, uint, vec3 } from 'three/tsl'

/** Borrow Blocks' current neighbor grid; all contact results use separate buffers.
 * Position correction removes overlap only. Velocity changes require an impact.
 */
export function createContactPass(solver)
{
    const grid = solver.fluid.grid, g = grid.ubos, buffers = grid.buffers
    return Fn(() =>
    {
        const id = instanceIndex, p = solver.positions.element(id), v = solver.incoming.element(id)
        const cell = grid.positionToCellCoords(p, g.grid_cell_size, g.grid_resolution, g.domainDimensions)
        const diameter = solver.radius.mul(2), range = diameter.div(g.grid_cell_size.x).ceil().toInt().clamp(1, 3)
        const push = vec3(0).toVar(), impulse = vec3(0).toVar(), contacts = float(0).toVar()
        Loop({ start: range.negate(), end: range.add(1), type: 'int', name: 'z' }, ({ z }) =>
        {
            Loop({ start: range.negate(), end: range.add(1), type: 'int', name: 'y' }, ({ y }) =>
            {
                Loop({ start: range.negate(), end: range.add(1), type: 'int', name: 'x' }, ({ x }) =>
                {
                    const c = cell.add(ivec3(x, y, z))
                    const valid = c.x.greaterThanEqual(0).and(c.y.greaterThanEqual(0)).and(c.z.greaterThanEqual(0))
                        .and(c.x.lessThan(int(g.grid_resolution.x))).and(c.y.lessThan(int(g.grid_resolution.y))).and(c.z.lessThan(int(g.grid_resolution.z)))
                    If(valid, () =>
                    {
                        const key = grid.cellKeyToHash(c, g.grid_resolution), start = buffers.cell_offsets.element(key)
                        const end = start.add(buffers.cellCursors.element(key)).min(uint(solver.count))
                        Loop({ start, end, type: 'uint', name: 'neighbor' }, ({ neighbor }) =>
                        {
                            const other = buffers.particleIds.element(neighbor)
                            If(other.notEqual(id).and(other.lessThan(uint(solver.count))), () =>
                            {
                                const d = p.sub(solver.positions.element(other)), distance = d.length()
                                If(distance.lessThan(diameter.mul(1.04)).and(distance.greaterThan(0.00001)), () =>
                                {
                                    const n = d.div(distance), relative = v.sub(solver.incoming.element(other))
                                    const closing = relative.dot(n).min(0)
                                    const bounce = closing.negate().sub(solver.u.impactThreshold).div(0.5).clamp(0, 1).mul(solver.u.restitution)
                                    impulse.subAssign(n.mul(closing).mul(bounce.add(1)).mul(0.5))
                                    impulse.subAssign(relative.mul(solver.u.viscosity).mul(solver.dt).mul(5))
                                    push.addAssign(n.mul(diameter.sub(distance).max(0)).mul(0.45))
                                    contacts.addAssign(1)
                                })
                            })
                        })
                    })
                })
            })
        })
        solver.contactVelocity.element(id).assign(impulse.div(contacts.max(1)))
        solver.contactPosition.element(id).assign(push.div(contacts.max(1)))
    })().compute(solver.count)
}
