import { GLOBE } from '../simulation/SnowPhysics.js'

export function frameCamera(camera, width, height, compact, footerHeight = 80)
{
    camera.aspect = width / height
    const tangent = Math.tan(camera.fov * Math.PI / 360)
    const targetY = GLOBE.centerY - 0.06
    if(compact)
    {
        const horizontal = Math.atan(tangent * camera.aspect * Math.max(0.5, 1 - 24 / width))
        const vertical = Math.atan(tangent * Math.max(0.25, (height - footerHeight - 24) / height))
        const distance = Math.max(1.7 / Math.sin(horizontal), 1.82 / Math.sin(vertical))
        camera.position.set(0, targetY + distance * 0.06, distance)
        camera.setViewOffset(width, height, 0, footerHeight / 2, width, height)
        camera.userData.motionLimits = {
            x: distance * Math.tan(horizontal - Math.asin(GLOBE.radius / distance)),
            y: distance * Math.tan(vertical - Math.asin(1.74 / distance))
        }
    }
    else
    {
        camera.position.set(0, 2.2, Math.max(8.8, 2.35 / (tangent * camera.aspect)))
        camera.clearViewOffset()
        camera.userData.motionLimits = null
    }
    camera.lookAt(0, targetY, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
}
