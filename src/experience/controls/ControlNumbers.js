export function roundControlValue(value, options)
{
    const digits = Math.max(0, Math.ceil(-Math.log10(options.step))) + 2
    const rounded = Number((Math.round(value / options.step) * options.step).toFixed(digits))
    return Math.max(options.min ?? -Infinity, Math.min(options.max ?? Infinity, rounded))
}

export function numberBindingOptions(options)
{
    const { step, ...result } = options
    if(step == null) return result
    // Tweakpane anchors step constraints to the initial value. That silently
    // shifts imported settings and can make zero unreachable.
    // Round user edits ourselves; leave programmatic refreshes exact.
    const digits = Math.max(0, Math.ceil(-Math.log10(step)))
    return { ...result, keyScale: step, pointerScale: step, format: value => value.toFixed(digits) }
}
