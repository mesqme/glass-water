let loader = document.querySelector('.loader')

export function finishLoading()
{
    loader?.remove()
    loader = null
}

export function failLoading()
{
    if(!loader) return
    loader.classList.add('failed')
    loader.textContent = 'Unable to load the globe. Please reload.'
    loader.setAttribute('role', 'alert')
    loader.removeAttribute('aria-label')
}
