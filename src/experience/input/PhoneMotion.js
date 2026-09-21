import { Quaternion, Vector3 } from 'three/webgpu'

const radians = Math.PI / 180
const finiteVector = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]))

// Sensors use the phone's natural portrait axes; the canvas uses screen axes.
export function screenVector(x, y, z, angle = 0, out = new Vector3())
{
    const c = Math.cos(angle * radians), s = Math.sin(angle * radians)
    return out.set(c * x + s * y, -s * x + c * y, z)
}

export function orientationGravity(beta, gamma, angle = 0, out = new Vector3())
{
    const b = beta * radians, g = gamma * radians
    return screenVector(Math.sin(g) * Math.cos(b), -Math.sin(b), -Math.cos(g) * Math.cos(b), angle, out)
}

/** Pure sensor state: bounded inputs, noise gates, no event-rate energy gain. */
export class PhoneMotionInput
{
    constructor(settings)
    {
        this.settings = settings
        this.targetGravity = new Vector3(0, -1, 0)
        this.gravity = new Vector3(0, -1, 0)
        this.angular = new Vector3()
        this.acceleration = new Vector3()
        this.filteredAcceleration = new Vector3()
        this.lowpass = new Vector3()
        this.previousGravity = new Vector3()
        this.turn = new Quaternion()
        this.identity = new Quaternion()
        this.lastOrientation = this.lastAcceleration = this.lastGyro = -Infinity
        this.hasOrientation = this.hasLowpass = false
    }
    orientation(event, angle, seconds)
    {
        if(!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return false
        this.previousGravity.copy(this.targetGravity)
        orientationGravity(event.beta, event.gamma, angle, this.targetGravity)
        const dt = seconds - this.lastOrientation
        if(this.hasOrientation && dt > 0.002 && dt < 0.2 && seconds - this.lastGyro > 0.2)
            this.angular.crossVectors(this.targetGravity, this.previousGravity).multiplyScalar(1 / dt).clampLength(0, 8)
        this.lastOrientation = seconds
        this.hasOrientation = true
        return true
    }
    motion(event, angle, seconds)
    {
        const dt = Math.min(0.05, Math.max(0.001, seconds - this.lastAcceleration))
        let valid = false
        if(finiteVector(event.acceleration))
        {
            screenVector(event.acceleration.x, event.acceleration.y, event.acceleration.z, angle, this.acceleration)
            valid = true
        }
        else if(finiteVector(event.accelerationIncludingGravity))
        {
            const value = event.accelerationIncludingGravity
            screenVector(value.x, value.y, value.z, angle, this.acceleration)
            if(!this.hasLowpass) { this.lowpass.copy(this.acceleration); this.hasLowpass = true }
            this.lowpass.lerp(this.acceleration, 1 - Math.exp(-dt * 5))
            this.acceleration.sub(this.lowpass)
            valid = true
        }
        if(valid) { this.acceleration.clampLength(0, 35); this.lastAcceleration = seconds }
        const rate = event.rotationRate
        if(rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite))
        {
            screenVector(rate.beta, rate.gamma, rate.alpha, angle, this.angular).multiplyScalar(radians).clampLength(0, 8)
            this.lastGyro = seconds
            valid = true
        }
        return valid
    }
    step(motion, camera, dt, seconds)
    {
        dt = Math.min(1 / 30, Math.max(0, dt))
        const previousGravity = this.gravity.clone()
        // A quaternion also handles a complete inversion, where normalized
        // linear interpolation would remain stuck on the original direction.
        this.turn.setFromUnitVectors(this.gravity, this.targetGravity).slerp(this.identity, Math.exp(-dt * 9))
        this.gravity.applyQuaternion(this.turn).normalize()
        const acceleration = seconds - this.lastAcceleration < 0.2 ? this.acceleration : new Vector3()
        this.filteredAcceleration.lerp(acceleration, 1 - Math.exp(-dt * 14))
        const force = this.filteredAcceleration.length()
        if(force > 0.8)
        {
            const scale = (1 - 0.8 / force) * 0.45 * this.settings.shake
            motion.inject3D(this.filteredAcceleration.x * scale, this.filteredAcceleration.y * scale, this.filteredAcceleration.z * scale, dt)
            motion.velocity.x += this.filteredAcceleration.x * scale * dt * 0.08
            motion.velocity.y += this.filteredAcceleration.y * scale * dt * 0.08
        }
        const rateIsFresh = seconds - Math.max(this.lastGyro, this.lastOrientation) < 0.2
        const omega = rateIsFresh ? this.angular.length() : 0
        const angular = omega > 0.025 ? this.angular.clone().multiplyScalar(this.settings.tilt) : new Vector3()
        motion.energy = Math.min(1, motion.energy + angular.lengthSq() * dt * 0.07)
        motion.deviceGravity = this.hasOrientation ? this.gravity.clone().applyQuaternion(camera.quaternion) : null
        motion.deviceAngularVelocity = angular.applyQuaternion(camera.quaternion)
        return force * this.settings.shake > 0.8 || angular.lengthSq() > 0.001 || previousGravity.distanceToSquared(this.gravity) > 0.000001
    }
    reset()
    {
        this.angular.set(0, 0, 0); this.acceleration.set(0, 0, 0); this.filteredAcceleration.set(0, 0, 0)
        this.lastOrientation = this.lastAcceleration = this.lastGyro = -Infinity
        this.hasLowpass = false
    }
}

export class PhoneMotion
{
    constructor(settings, onStatus, onMovement)
    {
        this.input = new PhoneMotionInput(settings)
        this.onStatus = onStatus
        this.onMovement = onMovement
        this.enabled = false
        this.requesting = false
        this.motionEvent = event => this.receive('motion', event)
        this.orientationEvent = event => this.receive('orientation', event)
        this.visibilityEvent = () => this.input.reset()
        this.screenEvent = () => { this.input.reset(); this.input.hasOrientation = false }
        this.received = false
        this.permissionGesture = event =>
        {
            if(!event.target.closest?.('.threejs, .view-controls')) return
            return this.enable()
        }
    }
    receive(kind, event)
    {
        if(document.hidden) return
        const angle = screen.orientation?.angle ?? window.orientation ?? 0
        if(this.input[kind](event, angle, performance.now() / 1000) && !this.received)
        {
            this.received = true
            clearTimeout(this.timeout)
            this.onStatus('Motion on')
        }
    }
    start()
    {
        if(!window.isSecureContext) { this.onStatus('Phone motion needs HTTPS'); return }
        const APIs = [window.DeviceMotionEvent, window.DeviceOrientationEvent].filter(Boolean)
        if(!APIs.length) { this.onStatus('Sensors unavailable · swipe to shake'); return }
        if(APIs.some(API => typeof API.requestPermission === 'function'))
        {
            this.onStatus('Tap the globe to allow motion')
            document.addEventListener('touchend', this.permissionGesture, true)
            document.addEventListener('click', this.permissionGesture, true)
        }
        else return this.enable()
    }
    removePermissionGesture()
    {
        document.removeEventListener('touchend', this.permissionGesture, { capture: true })
        document.removeEventListener('click', this.permissionGesture, { capture: true })
    }
    async enable()
    {
        if(this.disposed || this.enabled || this.requesting) return
        const APIs = [window.DeviceMotionEvent, window.DeviceOrientationEvent].filter(Boolean)
        this.requesting = true
        try
        {
            // Start both requests inside the gesture. One unavailable sensor
            // must not discard permission granted for the other.
            const results = await Promise.allSettled(APIs.map(async API => typeof API.requestPermission === 'function' ? API.requestPermission() : 'granted'))
            if(this.disposed) return
            if(!results.some(result => result.status === 'fulfilled' && result.value === 'granted'))
            {
                const failed = results.find(result => result.status === 'rejected')
                if(failed) this.onStatus(`Tap again to allow motion (${failed.reason?.name ?? 'request failed'})`)
                else
                {
                    this.removePermissionGesture()
                    this.onStatus('Motion denied · allow Motion & Orientation in site settings')
                }
                return
            }
            this.removePermissionGesture()
            this.enabled = true
            this.received = false
            this.input.reset()
            window.addEventListener('devicemotion', this.motionEvent)
            window.addEventListener('deviceorientation', this.orientationEvent)
            window.addEventListener('orientationchange', this.screenEvent)
            document.addEventListener('visibilitychange', this.visibilityEvent)
            this.onStatus('Waiting for sensors…')
            this.timeout = setTimeout(() => { if(!this.received) this.onStatus('No sensor data · swipe to shake') }, 4000)
        }
        finally { this.requesting = false }
    }
    step(motion, camera, dt)
    {
        if(this.enabled)
        {
            if(this.input.step(motion, camera, dt, performance.now() / 1000)) this.onMovement()
        }
        else { motion.deviceGravity = null; motion.deviceAngularVelocity = null }
    }
    disable()
    {
        if(this.enabled && !this.disposed) this.onMovement()
        this.enabled = false
        this.removePermissionGesture()
        clearTimeout(this.timeout)
        window.removeEventListener('devicemotion', this.motionEvent)
        window.removeEventListener('deviceorientation', this.orientationEvent)
        window.removeEventListener('orientationchange', this.screenEvent)
        document.removeEventListener('visibilitychange', this.visibilityEvent)
        this.input.reset()
        this.onStatus('Motion off')
    }
    dispose() { this.disposed = true; this.disable() }
}
