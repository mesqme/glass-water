import './style.css'
import { failLoading } from './experience/ui/Loading.js'

import('./script.js').catch(error =>
{
    console.error('Snow globe could not start.', error)
    failLoading()
})
