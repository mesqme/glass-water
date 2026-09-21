import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three'
import { setKnotPose } from '../simulation/KnotShape.js'

export class KnotMotion
{
    constructor()
    {
        this.quaternion = new Quaternion()
        this.increment = new Quaternion()
        this.axis = new Vector3()
        this.angularVelocity = new Vector3()
        this.matrix = new Matrix3()
        this.matrix4 = new Matrix4()
        this.moving = false
    }
    update(settings, dt)
    {
        this.axis.set(Number(settings.axisX), Number(settings.axisY), Number(settings.axisZ)).normalize()
        const rate = settings.autoRotate ? settings.speed * Math.PI / 180 : 0
        this.angularVelocity.copy(this.axis).multiplyScalar(rate)
        this.moving = this.angularVelocity.lengthSq() > 0.000001 && dt > 0
        if(this.moving) this.quaternion.premultiply(this.increment.setFromAxisAngle(this.axis, rate * dt)).normalize()
        this.matrix.setFromMatrix4(this.matrix4.makeRotationFromQuaternion(this.quaternion))
        setKnotPose(this.matrix.elements, settings.scale, this.moving ? this.angularVelocity : { x: 0, y: 0, z: 0 })
    }
}
