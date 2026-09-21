import { Euler, Quaternion, Vector3 } from 'three/webgpu'

const sway = new Quaternion(), inverse = new Quaternion(), euler = new Euler(), vector = new Vector3(), deviceVector = new Vector3()

/** Positive rotation around camera-forward appears clockwise on screen. */
export function updateGlobeOrientation(motion, cameraForward, rotation)
{
    sway.setFromEuler(euler.set(-motion.position.y * 0.24, motion.position.x * 0.12, -motion.position.x * 0.22))
    rotation.setFromAxisAngle(cameraForward, motion.roll ?? 0).multiply(sway)
    inverse.copy(rotation).invert()
    vector.copy(motion.deviceGravity ?? { x: 0, y: -1, z: 0 }).applyQuaternion(inverse)
    Object.assign(motion.gravity, { x: vector.x, y: vector.y, z: vector.z })
    vector.copy(cameraForward).applyQuaternion(inverse).multiplyScalar(motion.rollVelocity ?? 0)
    if(motion.deviceAngularVelocity) vector.add(deviceVector.copy(motion.deviceAngularVelocity).applyQuaternion(inverse))
    Object.assign(motion.angularVelocity, { x: vector.x, y: vector.y, z: vector.z })
}
