export function serializeSettings(settings, date = new Date())
{
    return JSON.stringify({ format: 'snow-globe-controls', version: 1, exportedAt: date.toISOString(), settings }, null, 4)
}

export function downloadSettings(settings)
{
    const url = URL.createObjectURL(new Blob([serializeSettings(settings)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'snow-globe-controls.json'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
