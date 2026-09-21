import { Inspector } from 'three/addons/inspector/Inspector.js'

/** The renderer's built-in RAF hooks don't await our async simulation. */
export class PerformanceInspector extends Inspector
{
    constructor()
    {
        super()
        this.capture = null
        this.report = document.createElement('pre')
        this.report.id = 'inspector-capture'
        this.report.hidden = true
        document.body.append(this.report)
    }

    begin() { }
    finish() { }
    beginFrame() { super.begin() }
    endFrame() { if(this.currentFrame) super.finish() }

    prepareBackend(renderer)
    {
        // r185 labels arrays passed to compute() as render queries, so the
        // Inspector looks in the wrong GPU pool. Correct only that identifier
        // while profiling; commands, batching, and simulation stay unchanged.
        const backend = renderer.backend, original = backend.updateTimeStampUID
        backend.updateTimeStampUID = function(context)
        {
            if(Array.isArray(context))
                this.get(context).timestampUID = `c:${renderer.info.compute.frameCalls}:batch-${context[0].id}:f${renderer.info.frame}`
            else original.call(this, context)
        }
        this.restoreBackend = () => { backend.updateTimeStampUID = original }
    }

    beginRender(uid, scene, camera, target)
    {
        super.beginRender(uid, scene, camera, target)
        if(this.currentRender?.isRenderStats && target?.texture.name)
            this.currentRender.name = target.texture.name
    }

    beginCompute(uid, node)
    {
        if(Array.isArray(node) && !node.name)
            node.name = node.map(item => item.name || `Compute ${item.id}`).join(' + ')
        super.beginCompute(uid, node)
    }

    startCapture(metadata)
    {
        this.capture = { start: this.nodeFrame.frameId, ids: new Set(), rows: new Map(), frames: [], metadata }
        this.report.hidden = false
        this.report.textContent = 'Capturing 180 completed Inspector frames…'
    }

    resolveFrame(frame)
    {
        super.resolveFrame(frame)
        const capture = this.capture
        if(!capture || frame.frameId <= capture.start || capture.ids.has(frame.frameId)) return
        capture.ids.add(frame.frameId)
        let cpu = 0, gpu = 0, missing = 0
        // Render/compute pass arrays contain the timestamped operations once.
        // Do not sum the Inspector's cumulative parent/UI totals again.
        for(const item of [...frame.renders, ...frame.computes])
        {
            const name = item.name?.replaceAll(' [ Compute ]', '') || 'Unnamed compute'
            let row = capture.rows.get(name)
            if(!row) { row = { name, kind: item.isComputeStats ? 'compute' : 'render', cpu: 0, gpu: 0, calls: 0, missing: 0 }; capture.rows.set(name, row) }
            row.cpu += item.cpu; row.gpu += item.gpu; row.calls++
            row.missing += Number(Boolean(item.gpuNotAvailable))
            cpu += item.cpu; gpu += item.gpu; missing += Number(Boolean(item.gpuNotAvailable))
        }
        capture.frames.push({ cpu, gpu, missing, interval: frame.deltaTime, work: frame.finishTime - frame.startTime })
        this.report.textContent = `Capturing Inspector frames: ${capture.frames.length}/180`
        if(capture.frames.length < 180) return
        const n = capture.frames.length
        const mean = key => capture.frames.reduce((sum, item) => sum + item[key], 0) / n
        const round = value => Number(value.toFixed(3))
        const gpuAvailable = this.getRenderer().backend.hasTimestamp && capture.frames.every(item => item.missing === 0)
        const report = {
            ...capture.metadata, frames: n, source: 'Three.js r185 Inspector GPU timestamp queries',
            gpuAvailable, frameIntervalMs: round(mean('interval')),
            cpuSubmissionMs: round(mean('cpu')), gpuPassMs: gpuAvailable ? round(mean('gpu')) : null,
            applicationFrameMs: round(mean('work')),
            passes: [...capture.rows.values()].map(row => ({
                name: row.name, kind: row.kind, callsPerFrame: round(row.calls / n),
                cpuMs: round(row.cpu / n), gpuMs: gpuAvailable && !row.missing ? round(row.gpu / n) : null
            })).sort((a, b) => (b.gpuMs ?? b.cpuMs) - (a.gpuMs ?? a.cpuMs))
        }
        this.report.textContent = JSON.stringify(report, null, 2)
        this.capture = null
    }

    removeCapture() { this.restoreBackend?.(); this.report.remove() }
}

export function nameComputePasses(snow)
{
    const solver = snow.solver
    for(const [key, node] of Object.entries(solver)) if(node?.isComputeNode) node.name = `Snow: ${key}`
    for(const [key, node] of Object.entries(solver.fluid ?? {})) if(node?.isComputeNode) node.name = `PBF: ${key.replace(/^_/, '')}`
    for(const [key, node] of Object.entries(solver.fluid?.grid ?? {})) if(node?.isComputeNode) node.name = `Neighbor grid: ${key.replace(/^_/, '')}`
    if(snow.history.capture) snow.history.capture.name = 'Remember flow colors'
}
