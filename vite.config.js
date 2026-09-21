import { existsSync, readFileSync } from 'node:fs'

const key = process.env.HTTPS_KEY ?? new URL('./.certs/server.key', import.meta.url)
const cert = process.env.HTTPS_CERT ?? new URL('./.certs/server.pem', import.meta.url)
const https = process.env.DEV_HTTP !== '1' && existsSync(key) && existsSync(cert)
    ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined

export default ({ command, isPreview }) => ({
    root: 'src/',
    publicDir: '../static/',
    base: command === 'build' || isPreview ? '/globe-tsl-blocks/' : '/',
    server:
    {
        host: '0.0.0.0',
        fs: { deny: ['.certs/**', '**/.certs/**', '**/*.key', '**/*.pem', '.env', '.env.*', '**/.git/**'] },
        https
    },
    build:
    {
        outDir: '../dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1800
    }
})
