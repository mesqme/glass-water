import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

// This temporary server exposes only the public CA certificate, never keys.
const certificate = readFileSync(new URL('../.certs/public/snow-globe.cer', import.meta.url))
createServer((request, response) =>
{
    if(request.url !== '/snow-globe.cer') { response.writeHead(404).end(); return }
    response.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="snow-globe.cer"' })
    response.end(certificate)
}).listen(5175, '0.0.0.0', () => console.log('Public certificate: http://<your-LAN-IP>:5175/snow-globe.cer. Stop this server after installing it.'))
