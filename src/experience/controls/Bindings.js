import { numberBindingOptions, roundControlValue } from './ControlNumbers.js'

export function createBindings(pane, actions)
{
    let refreshing = false
    const refreshMaterialUI = []
    // Tweakpane emits changes on refresh too; keep programmatic updates read-only.
    pane.refreshValues = () =>
    {
        refreshing = true
        try { pane.refresh(); for(const refresh of refreshMaterialUI) refresh() } finally { refreshing = false }
    }
    pane.element.parentElement.classList.add('globe-controls')
    const bind = (folder, object, key, options, action = actions.visual) =>
    {
        const { tip, ...preferred } = options
        const target = { get [key]() { return object[key] }, set [key](value) { if(!refreshing) object[key] = value } }
        const display = { ...preferred }
        if(typeof object[key] === 'number')
        {
            if(Number.isFinite(display.min)) display.min = Math.min(display.min, object[key])
            if(Number.isFinite(display.max)) display.max = Math.max(display.max, object[key])
        }
        refreshing = true
        const binding = folder.addBinding(target, key, numberBindingOptions(display)).on('change', event =>
        {
            if(refreshing) return
            if(preferred.step != null && typeof object[key] === 'number')
            {
                object[key] = roundControlValue(object[key], preferred)
                refreshing = true
                try { binding.refresh() } finally { refreshing = false }
            }
            action(event)
            for(const refresh of refreshMaterialUI) refresh()
        })
        refreshing = false
        if(tip) binding.element.title = tip
        const inputs = binding.element.querySelectorAll('input, select')
        inputs.forEach((input, index) => input.setAttribute('aria-label', `${options.label}${inputs.length > 1 ? ` ${index + 1}` : ''}`))
        return binding
    }
    return { bind, actions, pane, refreshMaterialUI }
}
