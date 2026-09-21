import test from 'node:test'
import assert from 'node:assert/strict'
import { PhoneMotion } from '../src/experience/input/PhoneMotion.js'
import { createSettings } from '../src/experience/config/Settings.js'

function environment(t, requestPermission)
{
    const original = Object.fromEntries(['window', 'document', 'screen'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const window = Object.assign(new EventTarget(), { isSecureContext: true, DeviceMotionEvent: {}, DeviceOrientationEvent: {} })
    if(requestPermission) for(const api of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) api.requestPermission = requestPermission
    Object.assign(globalThis, { window, document: Object.assign(new EventTarget(), { hidden: false }), screen: { orientation: { angle: 0 } } })
    const statuses = [], phone = new PhoneMotion(createSettings().mobile, value => statuses.push(value), () => {})
    t.after(() =>
    {
        phone.dispose()
        for(const [key, descriptor] of Object.entries(original))
            if(descriptor) Object.defineProperty(globalThis, key, descriptor)
            else delete globalThis[key]
    })
    return { phone, statuses, window }
}

test('sensors start automatically when no gesture permission API is needed', async t =>
{
    const { phone } = environment(t)
    await phone.start()
    assert.equal(phone.enabled, true)
})

test('gesture-gated sensors wait for interaction, request both APIs once, and respect denial', async t =>
{
    let requests = 0
    const { phone, statuses } = environment(t, () => { requests++; return Promise.resolve('denied') })
    phone.start()
    assert.equal(requests, 0)
    await phone.permissionGesture({ target: { closest: () => false } })
    assert.equal(requests, 0, 'debug panel interactions do not trigger sensor prompts')
    await phone.permissionGesture({ target: { closest: () => true } })
    assert.equal(requests, 2)
    assert.equal(phone.enabled, false)
    assert.match(statuses.at(-1), /denied/)
    document.dispatchEvent(new Event('pointerup'))
    assert.equal(requests, 2, 'no repeated prompts on later touches')
})

test('disposing during a permission prompt does not attach sensor listeners afterward', async t =>
{
    const responses = []
    const { phone } = environment(t, () => new Promise(resolve => responses.push(resolve)))
    phone.start()
    const pending = phone.permissionGesture({ target: { closest: () => true } })
    phone.dispose()
    responses.forEach(resolve => resolve('granted'))
    await pending
    assert.equal(phone.enabled, false)
})

test('insecure pages do not start sensors', t =>
{
    const { phone, statuses, window } = environment(t)
    window.isSecureContext = false
    phone.start()
    assert.equal(phone.enabled, false)
    assert.match(statuses.at(-1), /HTTPS/)
})
