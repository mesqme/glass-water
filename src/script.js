import * as THREE from 'three/webgpu'
import { screenUV, texture, uniform, vec3, vec4 } from 'three/tsl'
import { createEnvironment } from './experience/scene/Environment.js'
import { Globe } from './experience/scene/Globe.js'
import { GlobeMotion } from './experience/input/GlobeMotion.js'
import { Snow } from './experience/rendering/Snow.js'
import { createSettings, mergeSettings, upgradeSavedView, upgradeSavedSettings } from './experience/config/Settings.js'
import { FlowField } from './experience/simulation/FlowField.js'
import { applyMaterialSettings, applyMaterialEnvironment } from './experience/rendering/MaterialSettings.js'
import { WaterOptics } from './experience/rendering/WaterOptics.js'
import { downloadSettings } from './experience/config/SettingsExport.js'
import { KnotRefraction } from './experience/rendering/KnotRefraction.js'
import { FlowDebug } from './experience/rendering/FlowDebug.js'
import { frameCamera } from './experience/scene/CameraFraming.js'
import { PhoneMotion } from './experience/input/PhoneMotion.js'
import { finishLoading, failLoading } from './experience/ui/Loading.js'

/**
 * Base
 */
const canvas = document.querySelector('canvas.threejs')
const scene = new THREE.Scene(), glassScene = new THREE.Scene(), waterScene = new THREE.Scene()
const query = new URLSearchParams(location.search)
const settings = createSettings()
const mobileLayout = matchMedia('(pointer: coarse)').matches || innerWidth < 600
const storageKey = 'snow-globe-settings-v7-minimal'
try
{
    if(!query.has('defaults'))
    {
        const saved = JSON.parse(localStorage.getItem(storageKey))
        mergeSettings(settings, saved)
        upgradeSavedSettings(settings, saved)
        upgradeSavedView(settings)
    }
}
catch { /* Keep defaults if storage is unavailable. */ }
// Fixed resolution makes Inspector captures comparable.
if(query.has('inspect')) settings.scene.autoQuality = false
const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(settings)) } catch { /* Private browsing may block storage. */ } }
const sizes = { width: innerWidth, height: innerHeight }
const motion = new GlobeMotion(settings.motion)
const flow = new FlowField(settings)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
let interacted = false
const stats = { motion: 'Off', fps: 60, renderer: '', solver: '', state: 'Starting', awake: 0, particles: 0, energy: 0 }
let disposed = false, busy = false, rebuild = false, physicsDirty = false, visualDirty = false, renderingDirty = false
let environment, globe, snow, pane, knotRefraction, waterOptics, blocksDepthMaterial, performanceInspector, nameComputePasses
let flowDebug
let particleMaterialDirty = false, layeredGlass = false
let panelRevision = 0
const motionStatus = document.querySelector('.motion-status')
const phone = new PhoneMotion(settings.mobile, status =>
{
    stats.motion = status
    motionStatus.textContent = status
    motionStatus.hidden = status === 'Motion on' || status === 'Motion off'
}, () => { snow?.wake(); interacted = true })
if(mobileLayout || navigator.maxTouchPoints > 0) phone.start()

/**
 * Camera and renderer
 */
const camera = new THREE.PerspectiveCamera(33, sizes.width / sizes.height, 0.1, 40)
function updateCamera()
{
    const compact = mobileLayout || sizes.width < 600
    const footer = document.querySelector('.view-controls').getBoundingClientRect().height + 32
    frameCamera(camera, sizes.width, sizes.height, compact, footer)
}
updateCamera()
// MSAA belongs to our color render targets, allowing a live toggle without
// destroying the renderer or resetting the simulation.
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL: query.get('renderer') === 'webgl' })
if(query.has('inspect'))
{
    const inspectorModule = await import('./experience/rendering/PerformanceInspector.js')
    nameComputePasses = inspectorModule.nameComputePasses
    performanceInspector = new inspectorModule.PerformanceInspector()
    renderer.inspector = performanceInspector
}
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = settings.scene.exposure
renderer.setPixelRatio(settings.scene.pixelRatio)
renderer.setSize(sizes.width, sizes.height)
const sceneTarget = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
sceneTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType)
const waterTarget = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
const interiorBuffer = texture(sceneTarget.texture), waterBuffer = texture(waterTarget.texture)
const finalTarget = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType })
sceneTarget.texture.name = 'Opaque interior + snow'
waterTarget.texture.name = 'Water: refraction + depth + blur'
finalTarget.texture.name = 'Outer glass + pedestal'
const output = new THREE.RenderPipeline(renderer)
const activityView = uniform(0), finalColor = texture(finalTarget.texture, screenUV)
output.outputNode = vec4(activityView.greaterThan(0).select(vec3(finalColor.rgb.dot(vec3(0.2126, 0.7152, 0.0722))), finalColor.rgb), finalColor.a)
function resize()
{
    sizes.width = innerWidth; sizes.height = innerHeight
    updateCamera()
    renderer.setSize(sizes.width, sizes.height)
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    sceneTarget.setSize(size.x, size.y)
    finalTarget.setSize(size.x, size.y)
    waterTarget.setSize(size.x, size.y)
    knotRefraction?.resize(size.x, size.y)
}
function applyRendering()
{
    const samples = settings.scene.antialias ? 4 : 0
    for(const target of [sceneTarget, waterTarget, finalTarget]) if(target.samples !== samples)
    {
        target.samples = samples
        target.dispose()
    }
    renderer.setPixelRatio(settings.scene.pixelRatio)
    resize()
}

/**
 * Pointer velocity; editing the pane does not shake the globe.
 */
function onPointerMove(event)
{
    if(event.target.closest?.('.globe-controls, .view-controls, .three-inspector, #inspector-capture')) { motion.release(); return }
    motion.sample(event.clientX / sizes.width * 2 - 1, 1 - event.clientY / sizes.height * 2, event.timeStamp / 1000)
    if(motion.speed > 0.12) snow?.wake()
    interacted = true
}
function onPointerLeave() { motion.release(); motion.setTurning(false) }
function onPointerOut(event) { if(!event.relatedTarget) onPointerLeave() }
function onPointerDown(event)
{
    canvas.setPointerCapture(event.pointerId)
    if(event.button === 0 && event.pointerType !== 'touch') { motion.setTurning(true); snow?.wake() }
    onPointerMove(event)
}
function onPointerUp() { motion.setTurning(false) }
window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerout', onPointerOut)
window.addEventListener('blur', onPointerLeave)
canvas.addEventListener('pointerdown', onPointerDown)
window.addEventListener('pointerup', onPointerUp)
window.addEventListener('pointercancel', onPointerUp)
canvas.addEventListener('lostpointercapture', onPointerUp)
window.addEventListener('resize', resize)

/**
 * Initialize
 */
await renderer.init()
stats.renderer = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL'
performanceInspector?.prepareBackend(renderer)
environment = createEnvironment(scene, renderer, settings)
globe = new Globe(scene, glassScene, interiorBuffer, settings, waterScene, environment.groundLight)
glassScene.environment = waterScene.environment = scene.environment
waterScene.background = glassScene.background = scene.background
knotRefraction = new KnotRefraction(globe.knot, scene)
globe.glassMaterial.viewportBuffer = waterBuffer
waterOptics = new WaterOptics(interiorBuffer, sceneTarget.depthTexture, knotRefraction.depth.texture, settings, knotRefraction.backdrop)
blocksDepthMaterial = new THREE.MeshBasicNodeMaterial({ colorNode: waterOptics.depthPreview(screenUV), toneMapped: false })
function applyVisual()
{
    environment.update()
    glassScene.environment = waterScene.environment = scene.environment
    globe.pedestal.configure()
    glassScene.environmentIntensity = waterScene.environmentIntensity = scene.environmentIntensity
    renderer.toneMappingExposure = settings.scene.exposure
    applyMaterialSettings(globe.glassMaterial, settings.glass)
    applyMaterialSettings(globe.waterMaterial, settings.water)
    globe.knot.configure()
    for(const [material, config] of [[globe.glassMaterial, settings.glass], [globe.waterMaterial, settings.water], [globe.knot.physical, settings.knot], [globe.knot.glass, settings.knot.glass]])
        applyMaterialEnvironment(material, scene.environment, settings.scene.environment, config.envMapIntensity)
    layeredGlass = settings.knot.material === 'glass'
    activityView.value = settings.scene.view === 'activity' ? 1 : 0
    waterOptics.configure(layeredGlass)
    globe.waterMaterial.viewportBuffer = settings.water.depthClarity ? waterOptics.buffer : interiorBuffer
    globe.shell.material = settings.scene.view === 'depth' ? blocksDepthMaterial : globe.glassMaterial
    const buffer = settings.water.enabled ? waterBuffer : interiorBuffer
    if(globe.glassMaterial.viewportBuffer !== buffer)
    {
        globe.glassMaterial.viewportBuffer = buffer
        globe.glassMaterial.needsUpdate = true
    }
    if(settings.scene.view === 'flow')
    {
        flowDebug ??= new FlowDebug(settings, globe, sceneTarget.depthTexture)
        flowDebug.configure()
    }
}
function createSnow()
{
    snow?.dispose()
    motion.startFlow()
    flow.update(motion, 0)
    snow = new Snow(globe.inside, renderer, settings, flow)
    stats.solver = snow.gpu ? 'Blocks PBF' : 'CPU contacts'
    stats.particles = snow.count
    nameComputePasses?.(snow)
}
createSnow()
applyVisual(); applyRendering(); globe.update(motion, camera); flow.update(motion, 0)
const viewControls = document.querySelector('.view-controls')
function changeView()
{
    particleMaterialDirty = visualDirty = true
    if(flowDebug) flowDebug.dirty = true
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === settings.scene.view)))
    pane?.refreshValues()
    save()
}
function onViewClick(event)
{
    const button = event.target.closest('[data-view]')
    if(button) { settings.scene.view = button.dataset.view; changeView() }
}
viewControls.addEventListener('click', onViewClick)
const controlActions = {
    view: changeView,
    inspector: () =>
    {
        if(performanceInspector) performanceInspector.show()
        else { const url = new URL(location.href); url.searchParams.set('inspect', '1'); location.href = url.href }
    },
    capturePerformance: () => performanceInspector?.startCapture({
        view: settings.scene.view,
        backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl',
        viewport: `${sizes.width}×${sizes.height}`, pixelRatio: settings.scene.pixelRatio,
        antialias: settings.scene.antialias, particles: snow.count, paused: settings.simulation.paused,
        water: structuredClone(settings.water), glass: structuredClone(settings.glass),
        knot: structuredClone(settings.knot), simulation: structuredClone(settings.simulation)
    }),
    hasInspector: Boolean(performanceInspector),
    debug: () => { snow.configureDebug(); save() },
    flow: () => { flowDebug?.configure(); save() },
    particleMaterial: () => { particleMaterialDirty = true; save() },
    knotMotion: () => { if(flowDebug) flowDebug.dirty = true; snow.wake(); save() },
    download: () => downloadSettings(settings),
    visual: () => { visualDirty = true; save() },
    rendering: () => { renderingDirty = true; save() },
    simulation: () => { physicsDirty = true; if(flowDebug) flowDebug.dirty = true; save() },
    rebuild: event => { if(event.last && settings.snow.count !== snow.count) { rebuild = true; save() } },
    resetSnow: () => { rebuild = true },
    defaults: () => { mergeSettings(settings, createSettings()); rebuild = physicsDirty = particleMaterialDirty = visualDirty = renderingDirty = true; changeView() }
}
async function syncDebugPanel()
{
    const revision = ++panelRevision
    if(location.hash !== '#debug') { pane?.dispose(); pane = null; return }
    const { createControls } = await import('./experience/controls/Controls.js')
    if(disposed || revision !== panelRevision) return
    pane ??= createControls(settings, stats, controlActions)
}
window.addEventListener('hashchange', syncDebugPanel)
await syncDebugPanel()
changeView()

/**
 * Animation — only one async solver step may be in flight.
 */
let previous = performance.now(), time = 0, frames = 0, sampleTime = 0, slowSamples = 0
renderer.setAnimationLoop(async () =>
{
    if(disposed || busy) return
    const now = performance.now(), rawDt = (now - previous) / 1000
    previous = now
    if(document.hidden) return
    busy = true
    performanceInspector?.beginFrame()
    try
    {
        const dt = Math.min(rawDt, 1 / 30)
        if(rebuild) { createSnow(); rebuild = false }
        if(particleMaterialDirty) { snow.configureMaterial(); particleMaterialDirty = false }
        if(physicsDirty) { snow.configure(); physicsDirty = false }
        if(visualDirty) { applyVisual(); visualDirty = false }
        if(renderingDirty) { applyRendering(); renderingDirty = false }
        phone.step(motion, camera, dt)
        motion.step(dt)
        stats.energy = Number(motion.energy.toFixed(3))
        globe.update(motion, camera)
        globe.knot.update(settings.simulation.paused ? 0 : dt)
        flow.update(motion, time)
        if(!settings.simulation.paused && (!reducedMotion || interacted))
        {
            time += dt
            await snow.update(motion, time, dt)
        }
        if(disposed) return
        if(flowDebug) flowDebug.root.visible = settings.scene.view === 'flow'
        snow.mesh.visible = settings.scene.view !== 'flow' || settings.flow.particles
        if(flowDebug?.root.visible) flowDebug.update(motion, snow.gpu ? flow.time.value : time, dt)
        renderer.setRenderTarget(sceneTarget)
        globe.knot.visible = !layeredGlass
        renderer.render(scene, camera)
        globe.knot.visible = true
        if(layeredGlass) knotRefraction.render(renderer, camera, sceneTarget)
        if(settings.water.enabled && settings.scene.view !== 'depth')
        {
            if(settings.water.depthClarity) waterOptics.render(renderer, camera, globe.water)
            renderer.setRenderTarget(waterTarget)
            renderer.render(waterScene, camera)
        }
        renderer.setRenderTarget(finalTarget)
        renderer.render(glassScene, camera)
        if(flowDebug?.root.visible) flowDebug.render(renderer, camera)
        renderer.setRenderTarget(null)
        output.render()
        finishLoading()
        frames++; sampleTime += rawDt
        if(sampleTime >= 1)
        {
            stats.fps = Math.round(frames / sampleTime)
            frames = 0; sampleTime = 0
            stats.state = settings.simulation.paused ? 'Paused' : snow.sleeping ? 'Sleeping' : 'Active'
            stats.awake = snow.count - snow.sleepingCount
            slowSamples = stats.fps < 42 ? slowSamples + 1 : 0
            if(settings.scene.autoQuality && slowSamples >= 4 && settings.scene.pixelRatio > 1)
            {
                settings.scene.pixelRatio = Math.max(1, settings.scene.pixelRatio - 0.25)
                renderingDirty = true
                pane?.refreshValues()
                slowSamples = 0
            }
        }
    }
    catch(error)
    {
        console.error('Snow globe frame failed.', error)
        renderer.setAnimationLoop(null)
        stats.state = 'Stopped: rendering error'
        failLoading()
    }
    finally { performanceInspector?.endFrame(); busy = false; if(disposed) releaseResources() }
})

/**
 * Teardown waits for the current solver submission before releasing buffers.
 */
let resourcesReleased = false
function releaseResources()
{
    if(resourcesReleased) return
    resourcesReleased = true
    flowDebug?.dispose(); snow?.dispose(); waterOptics?.dispose(); knotRefraction?.dispose(); flow.dispose(); pane?.dispose(); environment?.dispose()
    phone.dispose()
    output.dispose(); sceneTarget.dispose(); waterTarget.dispose(); finalTarget.dispose()
    const geometries = new Set(), materials = new Set([blocksDepthMaterial, globe.glassMaterial, globe.knot.physical, globe.knot.glass])
    for(const world of [scene, glassScene, waterScene]) world.traverse(object =>
    {
        if(object.geometry) geometries.add(object.geometry)
        if(object.material) for(const material of [].concat(object.material)) materials.add(material)
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    performanceInspector?.removeCapture()
    performanceInspector?.domElement.remove()
    renderer.dispose()
}
function dispose()
{
    if(disposed) return
    disposed = true
    renderer.setAnimationLoop(null)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerout', onPointerOut)
    window.removeEventListener('blur', onPointerLeave)
    window.removeEventListener('pagehide', dispose)
    canvas.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('lostpointercapture', onPointerUp)
    window.removeEventListener('resize', resize)
    window.removeEventListener('hashchange', syncDebugPanel)
    viewControls.removeEventListener('click', onViewClick)
    if(!busy) releaseResources()
}
window.addEventListener('pagehide', dispose, { once: true })
if(import.meta.hot) import.meta.hot.dispose(dispose)
