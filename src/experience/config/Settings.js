import defaults from './defaults.json' with { type: 'json' }

export const VIEW_OPTIONS = { Snow: 'snow', 'Flow particles': 'flowParticles', 'Flow trace': 'flow', Depth: 'depth', Activity: 'activity' }

export function mergeSettings(target, source)
{
    for(const key of Object.keys(target))
    {
        if(source?.[key] == null) continue
        if(typeof target[key] === 'object') mergeSettings(target[key], source[key])
        else if(typeof target[key] === typeof source[key]) target[key] = source[key]
    }
    return target
}

export function createSettings()
{
    return structuredClone(defaults)
}

export function upgradeSavedView(settings)
{
    if(settings.scene.view === 'color') settings.scene.view = 'flowParticles'
    if(!Object.values(VIEW_OPTIONS).includes(settings.scene.view)) settings.scene.view = 'snow'
}

export function upgradeSavedSettings(settings, saved)
{
    if(!saved || saved.revision === defaults.revision) return
    // Retire old presets once; later revisions only update requested defaults.
    if(!(saved.revision >= 3)) mergeSettings(settings, createSettings())
    if(saved.revision < 4) settings.water.clearDepth = defaults.water.clearDepth
    if(saved.revision < 5)
    {
        settings.flow.brightness = defaults.flow.brightness
        settings.flow.saturation = defaults.flow.saturation
    }
    settings.revision = defaults.revision
}

export function particleUsesFlow(settings)
{
    return settings.scene.view === 'flowParticles' || settings.debug.mode > 0
}
