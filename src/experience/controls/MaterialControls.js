const materialTips = {
    envMapIntensity: 'Reflection cards, multiplied by Scene → Environment strength. Ambient light is restricted to the ground.',
    specularIntensity: 'Main dielectric reflection layer. Clearcoat remains an independent layer.',
    thickness: 'Optical travel used for refraction and glass absorption; does not resize the geometry.',
    dispersion: 'Wavelength-dependent refraction. 0–1 is subtle; larger values exaggerate color separation. Needs transmission and some optical travel.',
    chromaticAberration: 'Artistic RGB separation over the full Blocks range. Try 0 versus 1. Needs transmission and optical travel; does not color reflected highlights.',
    roughness: 'Softens surface reflections and refraction. Transmission blur grows with optical travel and samples.'
}


export function materialControls(folder, config, { bind, actions, pane, refreshMaterialUI })
{
    bind(folder, config, 'color', { label: 'Color' })
    const bindings = {}
    for(const [key, label, min, max, step] of [
        ['roughness', 'Roughness', 0, 1, 0.001], ['metalness', 'Metalness', 0, 1, 0.01],
        ['envMapIntensity', 'Env reflections', 0, 5, 0.01], ['specularIntensity', 'Surface reflections', 0, 1, 0.01], ['transmission', 'Transmission', 0, 1, 0.01],
        ['ior', 'IOR', 1, 2.5, 0.01], ['thickness', 'Thickness', 0.001, 1, 0.005],
        ['dispersion', 'Dispersion', 0, 20, 0.01],
        ['chromaticAberration', 'Chromatic shift', 0, 2, 0.001], ['clearcoat', 'Clearcoat', 0, 1, 0.01],
        ['clearcoatRoughness', 'Coat roughness', 0, 1, 0.01]
    ]) if(key in config) bindings[key] = bind(folder, config, key, { label, min, max, step, tip: materialTips[key] })
    if(bindings.chromaticAberration)
    {
        const inactiveReason = () => config.transmission <= 0 ? 'Off · transmission is zero' : config.ior <= 1.001 ? 'Off · IOR is one' : config.thickness < 0.01 ? 'Off · optical travel too small' : ''
        const status = { get reason() { return inactiveReason() } }
        const note = folder.addBinding(status, 'reason', { label: 'Color refraction', readonly: true, interval: 250 })
        const enable = folder.addButton({ title: 'Enable color refraction' }).on('click', () =>
        {
            if(config.transmission <= 0) config.transmission = 1
            if(config.ior <= 1.001) config.ior = 1.5
            if(config.thickness < 0.01) config.thickness = 0.2
            if(config.chromaticAberration === 0 && config.dispersion === 0) config.chromaticAberration = 0.25
            actions.visual(); pane.refreshValues()
        })
        const sync = () =>
        {
            const inactive = Boolean(inactiveReason())
            bindings.chromaticAberration.disabled = bindings.dispersion.disabled = inactive
            note.hidden = !inactive
            enable.hidden = !inactive
        }
        for(const key of ['transmission', 'thickness', 'ior']) bindings[key].on('change', sync)
        refreshMaterialUI.push(sync); sync()
    }
    if(bindings.clearcoatRoughness) refreshMaterialUI.push(() => { bindings.clearcoatRoughness.disabled = config.clearcoat <= 0 })
    if(config.attenuationColor) bind(folder, config, 'attenuationColor', { label: 'Volume tint' })
    if('samples' in config)
    {
        bind(folder, config, 'samples', { label: 'Refraction samples', options: { '1 · fast': 1, '2': 2, '4': 4 } })
    }
}
