import { opticsControls } from './OpticsControls.js'
import { materialControls } from './MaterialControls.js'
import { simulationControls } from './SimulationControls.js'
import { Pane } from 'tweakpane'
import { createBindings } from './Bindings.js'
import { VIEW_OPTIONS, particleUsesFlow } from '../config/Settings.js'

export function createControls(settings, stats, actions)
{
    const pane = new Pane({ title: 'Snow globe' })
    const context = createBindings(pane, actions)
    const { bind, refreshMaterialUI } = context
    pane.addButton({ title: 'Reset snow' }).on('click', actions.resetSnow)
    bind(pane, settings.scene, 'view', { label: 'View', options: VIEW_OPTIONS }, actions.view)
    const activity = pane.addFolder({ title: 'Activity view', expanded: false })
    bind(activity, settings.activity, 'gain', { label: 'Activity brightness', min: 0.1, max: 5, step: 0.05 }, actions.particleMaterial)
    bind(activity, settings.activity, 'curve', { label: 'Activity curve', min: 0.2, max: 3, step: 0.05 }, actions.particleMaterial)
    bind(activity, settings.activity, 'minimum', { label: 'Resting brightness', min: 0, max: 0.2, step: 0.005 }, actions.particleMaterial)
    bind(activity, settings.activity, 'speedFloor', { label: 'Ignore jitter below', min: 0.005, max: 0.15, step: 0.005, tip: 'Actual travel speed below this threshold stays dark. Contact impulses alone do not brighten particles.' }, actions.particleMaterial)
    bind(activity, settings.activity, 'smoothing', { label: 'Speed smoothing (s)', min: 0.04, max: 0.5, step: 0.01 }, actions.particleMaterial)
    refreshMaterialUI.push(() => { activity.hidden = settings.scene.view !== 'activity' })
    const flow = pane.addFolder({ title: 'Flow trace', expanded: true })
    bind(flow, settings.flow, 'count', { label: 'Traces', options: { Sparse: 96, Normal: 192, Dense: 320 } }, actions.flow)
    bind(flow, settings.flow, 'duration', { label: 'Trace time (s)', min: 0.15, max: 1.5, step: 0.05, tip: 'Length in travel time, so faster currents produce longer traces. Moving highlights show direction.' }, actions.flow)
    bind(flow, settings.flow, 'brightness', { label: 'Trace brightness', min: 0.1, max: 4, step: 0.05 }, actions.flow)
    bind(flow, settings.flow, 'saturation', { label: 'Trace saturation', min: 0, max: 2, step: 0.05 }, actions.flow)
    bind(flow, settings.flow, 'slice', { label: 'Slice', options: { 'Full volume': 'all', 'Front · XY': 'xy', 'Top · XZ': 'xz', 'Side · YZ': 'yz' } }, actions.flow)
    const offset = bind(flow, settings.flow, 'offset', { label: 'Slice offset', min: -1.3, max: 1.3, step: 0.05 }, actions.flow)
    const width = bind(flow, settings.flow, 'width', { label: 'Slice thickness', min: 0.15, max: 1.5, step: 0.05 }, actions.flow)
    bind(flow, settings.flow, 'particles', { label: 'Show particles', tip: 'Compare the water target velocity with particle motion, which also has inertia, gravity, contact, and sleep.' }, actions.flow)
    refreshMaterialUI.push(() => { flow.hidden = settings.scene.view !== 'flow'; offset.hidden = width.hidden = settings.flow.slice === 'all' })
    const scene = pane.addFolder({ title: 'Scene & rendering', expanded: false })
    bind(scene, settings.scene, 'background', { label: 'Background' })
    bind(scene, settings.scene, 'exposure', { label: 'Exposure', min: 0.1, max: 2.5, step: 0.01 })
    bind(scene, settings.scene, 'environment', { label: 'Environment strength', min: 0, max: 3, step: 0.01 })
    bind(scene, settings.scene, 'antialias', { label: 'Antialias · 4× MSAA' }, actions.rendering)
    bind(scene, settings.scene, 'pixelRatio', { label: 'Pixel ratio', min: 1, max: 2, step: 0.05 }, actions.rendering)
    bind(scene, settings.scene, 'autoQuality', { label: 'Adaptive quality' })

    simulationControls(pane, settings, context)
    const particles = pane.addFolder({ title: 'Snow particles', expanded: false })
    bind(particles, settings.snow, 'count', { label: 'Count', min: 1024, max: 32768, step: 1024 }, actions.rebuild)
    bind(particles, settings.snow, 'radius', { label: 'Radius', min: 0.002, max: 0.075, step: 0.001 }, actions.simulation)
    bind(particles, settings.snow, 'variation', { label: 'Size variation', min: 0, max: 0.6, step: 0.01 }, actions.simulation)
    const brightness = bind(particles, settings.snow, 'brightness', { label: 'Brightness', min: 0, max: 3, step: 0.05 }, actions.particleMaterial)
    const source = bind(particles, settings.debug, 'mode', { label: 'Colors', options: { 'Water flow': 1, White: 0 } }, actions.debug)
    const saturation = bind(particles, settings.debug, 'saturation', { label: 'Saturation', min: 0, max: 2, step: 0.05 }, actions.debug)
    refreshMaterialUI.push(() =>
    {
        const view = settings.scene.view
        brightness.hidden = view === 'depth' || (view === 'flow' && !settings.flow.particles)
        source.hidden = view !== 'snow' && !(view === 'flow' && settings.flow.particles)
        saturation.hidden = view === 'depth' || view === 'activity' || !particleUsesFlow(settings) || (view === 'flow' && !settings.flow.particles)
    })

    const knot = pane.addFolder({ title: 'Torus knot', expanded: false })
    const knotMode = bind(knot, settings.knot, 'material', { label: 'Material', options: { 'Physical · solid': 'physical', 'Glass · Blocks': 'glass' } })
    const solid = knot.addFolder({ title: 'Solid material', expanded: true })
    const crystal = knot.addFolder({ title: 'Glass material', expanded: true })
    materialControls(solid, settings.knot, context)
    materialControls(crystal, settings.knot.glass, context)
    const showKnotMaterial = () =>
    {
        solid.hidden = settings.scene.view === 'depth' || settings.knot.material === 'glass'
        crystal.hidden = settings.scene.view === 'depth' || settings.knot.material !== 'glass'
        knotMode.hidden = settings.scene.view === 'depth'
    }
    refreshMaterialUI.push(showKnotMaterial)
    knotMode.on('change', showKnotMaterial); showKnotMaterial()
    const rotation = knot.addFolder({ title: 'Size & rotation', expanded: true })
    bind(rotation, settings.knot, 'scale', { label: 'Scale', min: 0.5, max: 1.05, step: 0.01 }, actions.knotMotion)
    bind(rotation, settings.knot, 'autoRotate', { label: 'Auto rotation' }, actions.knotMotion)
    for(const axis of ['X', 'Y', 'Z']) bind(rotation, settings.knot, `axis${axis}`, { label: `${axis} axis` }, actions.knotMotion)
    bind(rotation, settings.knot, 'speed', { label: 'Speed (°/s)', min: -240, max: 240, step: 1 }, actions.knotMotion)


    opticsControls(pane, settings, context)
    const base = pane.addFolder({ title: 'Base', expanded: false })
    bind(base, settings.base, 'color', { label: 'Color' })
    bind(base, settings.base, 'roughness', { label: 'Roughness', min: 0, max: 1, step: 0.01 })
    bind(base, settings.base, 'metalness', { label: 'Metalness', min: 0, max: 1, step: 0.01 })
    const ground = pane.addFolder({ title: 'Ground', expanded: false })
    bind(ground, settings.ground, 'color', { label: 'Color' })
    bind(ground, settings.ground, 'intensity', { label: 'Intensity', min: 0, max: 3, step: 0.01 })
    refreshMaterialUI.push(() => { ground.hidden = settings.scene.view === 'depth' })
    const interaction = pane.addFolder({ title: 'Cursor response', expanded: false })
    bind(interaction, settings.motion, 'sensitivity', { label: 'Sensitivity', min: 0.1, max: 3, step: 0.05 })
    bind(interaction, settings.motion, 'shake', { label: 'Globe movement', min: 0, max: 2, step: 0.05 })
    bind(interaction, settings.motion, 'decay', { label: 'Shake energy decay', tip: 'Drains stored shake energy (per second). Higher values make shake currents fade faster. The rotating knot has its own motor and continues stirring; particle drag is separate.', min: 0.2, max: 2, step: 0.05 })
    bind(interaction, settings.motion, 'elasticity', { label: 'Spring stiffness', min: 20, max: 100, step: 1 })
    bind(interaction, settings.motion, 'damping', { label: 'Spring damping', min: 5, max: 18, step: 0.5 })
    const turn = interaction.addFolder({ title: 'Hold left mouse to turn', expanded: true })
    bind(turn, settings.motion, 'holdRotation', { label: 'Hold rotation' })
    bind(turn, settings.motion, 'turnAngle', { label: 'Turn angle (°)', min: 45, max: 360, step: 5 })
    bind(turn, settings.motion, 'turnSpeed', { label: 'Turn speed (°/s)', min: 30, max: 240, step: 5 })
    bind(turn, settings.motion, 'turnSpring', { label: 'Return spring', min: 8, max: 60, step: 1 })
    bind(turn, settings.motion, 'turnDamping', { label: 'Return damping', min: 2, max: 16, step: 0.5 })
    const phone = pane.addFolder({ title: 'Phone motion', expanded: false })
    bind(phone, settings.mobile, 'tilt', { label: 'Rotation strength', min: 0, max: 3, step: 0.05 })
    bind(phone, settings.mobile, 'shake', { label: 'Shake strength', min: 0, max: 3, step: 0.05 })
    phone.addBinding(stats, 'motion', { label: 'Sensors', readonly: true, interval: 500 })
    const monitor = pane.addFolder({ title: 'Performance', expanded: false })
    monitor.addButton({ title: 'Open TSL inspector' }).on('click', actions.inspector)
    if(actions.hasInspector) monitor.addButton({ title: 'Capture 180 frames' }).on('click', actions.capturePerformance)
    for(const key of ['fps', 'renderer', 'solver', 'state', 'awake', 'particles', 'energy']) monitor.addBinding(stats, key, { readonly: true, interval: 500 })
    pane.addButton({ title: 'Download controls' }).on('click', actions.download)
    pane.addButton({ title: 'Restore all defaults' }).on('click', actions.defaults)
    pane.refreshValues()
    return pane
}
