export function simulationControls(pane, settings, { bind, actions })
{
    const simulation = pane.addFolder({ title: 'Simulation', expanded: true })
    bind(simulation, settings.simulation, 'paused', { label: 'Pause' }, actions.simulation)
    for(const [key, label, min, max, step, tip] of [
        ['fallSpeed', 'Fall speed', 0.05, 0.8, 0.01, 'How fast particles settle through still water.'],
        ['drag', 'Water drag', 0.5, 10, 0.1, 'How quickly particles follow the water and lose leftover motion.'],
        ['inertia', 'Particle inertia', 0.5, 3, 0.05, 'Higher values make particles resist changes in water direction.'],
        ['currentStrength', 'Current strength', 0, 3, 0.05, 'Strength of the water currents. Gravity and solid contacts still work at zero.'],
        ['knotStirring', 'Knot stirring', 0, 3, 0.05, 'How strongly the rotating knot drives the water. 1 is the normal strength.'],
        ['turbulence', 'Turbulence', 0, 1, 0.01, 'Irregular motion in the currents while the globe or knot moves.'],
        ['maxSpeed', 'Speed limit', 0.05, 4, 0.05, 'Maximum particle speed.']
    ]) bind(simulation, settings.simulation, key, { label, min, max, step, tip }, actions.simulation)
}
