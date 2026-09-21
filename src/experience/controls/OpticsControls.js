import { materialControls } from './MaterialControls.js'

export function opticsControls(pane, settings, context)
{
    const { bind, actions, refreshMaterialUI } = context
    const glass = pane.addFolder({ title: 'Glass material', expanded: false })
    materialControls(glass, settings.glass, context)
    const water = pane.addFolder({ title: 'Water', expanded: false })
    const enabled = bind(water, settings.water, 'enabled', { label: 'Water optics', tip: 'Enable water refraction, fading and blur. Turning this off skips the water passes.' })
    const surface = water.addFolder({ title: 'Surface', expanded: false })
    bind(surface, settings.water, 'roughness', { label: 'Roughness', min: 0, max: 1, step: 0.001 })
    bind(surface, settings.water, 'envMapIntensity', { label: 'Env reflections', min: 0, max: 5, step: 0.01 })
    bind(surface, settings.water, 'specularIntensity', { label: 'Surface reflections', min: 0, max: 1, step: 0.01 })
    const depth = water.addFolder({ title: 'Depth clarity', expanded: true })
    const clarity = bind(depth, settings.water, 'depthClarity', { label: 'Depth effect' })
    const fading = depth.addFolder({ title: 'Fade', expanded: true })
    bind(fading, settings.water, 'fadeColor', { label: 'Fade color' })
    bind(fading, settings.water, 'fadeStrength', { label: 'Fade strength', min: 0, max: 10, step: 0.05, tip: 'How strongly distant objects fade toward Fade color. Zero disables fading.' })
    const range = depth.addFolder({ title: 'Depth range', expanded: true })
    const syncRange = changed =>
    {
        if(changed === 'start') settings.water.depthEnd = Math.max(settings.water.depthEnd, settings.water.clearDepth + 0.01)
        else settings.water.clearDepth = Math.min(settings.water.clearDepth, settings.water.depthEnd - 0.01)
        actions.visual(); pane.refreshValues()
    }
    bind(range, settings.water, 'clearDepth', { label: 'Depth start', min: -3.03, max: 1, step: 0.005, tip: 'Distance from the water surface where the depth effect begins. Negative values start it before the surface, so even the front is affected.' }, () => syncRange('start'))
    bind(range, settings.water, 'depthEnd', { label: 'Depth end', min: 0.01, max: 3.03, step: 0.01, tip: 'Distance through the water where the full depth effect is reached. The globe is 3.03 units across.' }, () => syncRange('end'))
    bind(range, settings.water, 'depthCurve', { label: 'Depth curve', options: { Linear: 'linear', Smoothstep: 'smoothstep' } })
    bind(range, settings.water, 'depthFalloff', { label: 'Depth falloff', min: 0.3, max: 3, step: 0.05, tip: 'Higher values delay the effect toward the back of the globe.' })
    const blur = depth.addFolder({ title: 'Blur', expanded: true })
    bind(blur, settings.water, 'depthSoftness', { label: 'Depth softness', min: 0, max: 3, step: 0.01, tip: 'Gaussian blur increasing with water depth. Zero keeps the particles sharp.' })
    bind(blur, settings.water, 'blurDepthFalloff', { label: 'Blur falloff', min: 0.3, max: 3, step: 0.05 })
    const preview = bind(depth, settings.water, 'depthPreview', { label: 'Depth view', options: { 'Actual distance': 'distance', 'After range & curve': 'mapped' } })
    refreshMaterialUI.push(() =>
    {
        const isDepth = settings.scene.view === 'depth'
        glass.hidden = enabled.hidden = isDepth
        surface.hidden = !settings.water.enabled || isDepth
        depth.hidden = !settings.water.enabled && !isDepth
        clarity.hidden = !settings.water.enabled || isDepth
        fading.hidden = blur.hidden = isDepth || !settings.water.depthClarity
        range.hidden = isDepth ? settings.water.depthPreview !== 'mapped' : !settings.water.depthClarity
        preview.hidden = !isDepth
    })
}
