import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
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

async function gesture(type, matches = true)
{
    const event = new Event(type)
    Object.defineProperty(event, 'target', { value: { closest: () => matches } })
    document.dispatchEvent(event)
    await setImmediate()
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
    await gesture('touchend', false)
    assert.equal(requests, 0, 'debug panel interactions do not trigger sensor prompts')
    await gesture('touchend')
    assert.equal(requests, 2)
    assert.equal(phone.enabled, false)
    assert.match(statuses.at(-1), /denied/)
    await gesture('click')
    await gesture('touchend')
    assert.equal(requests, 2, 'no repeated prompts on later touches')
})

test('a rejected gesture request can retry on the next tap', async t =>
{
    let requests = 0, reject = true
    const { phone, statuses } = environment(t, () =>
    {
        requests++
        if(reject) throw new DOMException('User activation required', 'NotAllowedError')
        return Promise.resolve('granted')
    })
    phone.start()
    await gesture('touchend')
    assert.equal(phone.enabled, false)
    assert.match(statuses.at(-1), /Tap again.*NotAllowedError/)
    reject = false
    await gesture('click')
    assert.equal(phone.enabled, true)
    assert.equal(requests, 4)
    await gesture('touchend')
    assert.equal(requests, 4, 'successful permission removes gesture listeners')
})

test('one rejected sensor does not discard the other sensor permission or data', async t =>
{
    const { phone, statuses, window } = environment(t, () => Promise.resolve('granted'))
    window.DeviceMotionEvent.requestPermission = () => Promise.reject(new Error('Unavailable'))
    phone.start()
    await gesture('click')
    assert.equal(phone.enabled, true)
    window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 90, gamma: 30 }))
    assert.equal(phone.input.hasOrientation, true)
    assert.equal(statuses.at(-1), 'Motion on')
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
