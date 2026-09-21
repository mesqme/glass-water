import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { frameCamera } from '../src/experience/scene/CameraFraming.js'
import { GLOBE } from '../src/experience/simulation/SnowPhysics.js'

for(const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390]])
    test(`phone framing keeps the globe and base inside ${width}×${height}`, () =>
    {
        const camera = new PerspectiveCamera(33, width / height, 0.1, 40)
        frameCamera(camera, width, height, true, 80)
        let minX = 1, maxX = -1
        const check = (x, y, z) =>
        {
            const point = new Vector3(x, GLOBE.centerY + y, z).project(camera)
            assert.ok(Math.abs(point.x) < 1 && point.y < 1 && point.y > -1 + 160 / height, `outside available viewport: ${point.toArray()}`)
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
        }
        for(let i = 0; i < 48; i++) for(let j = 0; j < 24; j++)
        {
            const azimuth = i / 48 * Math.PI * 2, polar = j / 23 * Math.PI
            check(Math.cos(azimuth) * Math.sin(polar) * GLOBE.radius, Math.cos(polar) * GLOBE.radius, Math.sin(azimuth) * Math.sin(polar) * GLOBE.radius)
        }
        for(let i = 0; i < 48; i++) check(Math.cos(i / 48 * Math.PI * 2) * 1.15, -1.72, Math.sin(i / 48 * Math.PI * 2) * 1.15)
        if(height > width) assert.ok((maxX - minX) / 2 > 0.84, 'globe fills at least 84% of portrait width')
    })
