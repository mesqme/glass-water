import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('../.certs/', import.meta.url))
mkdirSync(`${directory}/public`, { recursive: true, mode: 0o700 })
const openssl = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: ['ignore', 'ignore', 'pipe'] })
const addresses = [...new Set(['127.0.0.1', ...Object.values(networkInterfaces()).flat()
    .filter(address => address.family === 'IPv4' && !address.internal).map(address => address.address)])]
const names = [...new Set(['localhost', hostname()])]
if(!existsSync(`${directory}/root.pem`))
{
    writeFileSync(`${directory}/root.cnf`, '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=Snow Globe Local Development\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-config', 'root.cnf', '-keyout', 'root.key', '-out', 'root.pem')
    chmodSync(`${directory}/root.key`, 0o600)
}
writeFileSync(`${directory}/server.cnf`, `[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${[...names.map(name => `DNS:${name}`), ...addresses.map(ip => `IP:${ip}`)].join(',')}\n`)
openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=Snow Globe Development', '-keyout', 'server.key', '-out', 'server.csr')
openssl('x509', '-req', '-in', 'server.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '90', '-sha256', '-extfile', 'server.cnf', '-extensions', 'server', '-out', 'server.pem')
openssl('x509', '-in', 'root.pem', '-outform', 'der', '-out', 'public/snow-globe.cer')
chmodSync(`${directory}/server.key`, 0o600)
console.log('HTTPS certificate ready. Install .certs/public/snow-globe.cer on your phone and enable certificate trust.\nRun npm run https:certificate to download it over your LAN, then restart npm run dev.\nHosts:', [...names, ...addresses].join(', '))
