// Physical feature flags need a recompile only when crossing zero.
export function applyMaterialSettings(material, values)
{
    for(const [key, value] of Object.entries(values))
    {
        if(material[key]?.isColor) material[key].set(value)
        else if(key in material)
        {
            if(['transmission', 'dispersion', 'clearcoat', 'toneMapped'].includes(key) && Boolean(material[key]) !== Boolean(value)) material.needsUpdate = true
            material[key] = value
        }
    }
}

export function applyMaterialEnvironment(material, environment, globalStrength, localStrength)
{
    if(material.envMap !== environment)
    {
        material.envMap = environment
        material.needsUpdate = true
    }
    // Without an explicit envMap, Three ignores material.envMapIntensity.
    material.envMapIntensity = globalStrength * localStrength
}
