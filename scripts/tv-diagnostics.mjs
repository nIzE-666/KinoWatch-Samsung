import http from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { isIP } from 'node:net'

const tvAddress = process.env.KINOWATCH_TV_ADDRESS
if (isIP(tvAddress || '') !== 4) throw new Error('Set KINOWATCH_TV_ADDRESS to the TV IPv4 address before starting diagnostics.')
const allowedClients = new Set([tvAddress, '127.0.0.1'])

const allowed = new Set(['event', 'host', 'kind', 'resume', 'paused', 'code', 'state', 'percent', 'duration', 'status', 'version', 'codecs', 'master', 'encrypted', 'valid', 'attempt'])
mkdirSync('artifacts', { recursive: true })
const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (!allowedClients.has(request.socket.remoteAddress)) { response.writeHead(403).end(); return }
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
  if (request.url !== '/event' || request.method !== 'POST') { response.writeHead(404).end(); return }
  let data = ''
  request.on('data', chunk => { data += chunk; if (data.length > 4096) request.destroy() })
  request.on('end', () => {
    try {
      const raw = JSON.parse(data)
      const entry = { timestamp: new Date().toISOString() }
      for (const [key, value] of Object.entries(raw)) {
        if (allowed.has(key) && ['string', 'number', 'boolean'].includes(typeof value)) entry[key] = typeof value === 'string' ? value.slice(0, 100) : value
      }
      const line = JSON.stringify(entry)
      appendFileSync('artifacts/tv-diagnostics.log', line + '\n')
      console.log(line)
      response.writeHead(204).end()
    } catch { response.writeHead(400).end() }
  })
})
server.listen(8767, '0.0.0.0', () => console.log('Temporary technical probe listening on 8767'))
const close = () => server.close(() => process.exit(0))
process.on('SIGINT', close)
process.on('SIGTERM', close)
