import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createServer, preview } from 'vite'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))

test('configured remote gateways survive page startup in dev and preview', async t => {
  const gateway = createHttpServer((req, res) => {
    assert.equal(req.url, '/api/status')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ auth_required: true, auth_providers: ['basic'] }))
  })
  gateway.listen(0, '127.0.0.1')
  await once(gateway, 'listening')
  gateway.on('upgrade', (req, socket) => {
    assert.equal(req.url, '/api/ws?ticket=test-ticket')
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
  })
  t.after(() => new Promise(resolve => gateway.close(resolve)))
  const target = `http://127.0.0.1:${gateway.address().port}`
  const previous = process.env.HERMES_GATEWAY_URL
  process.env.HERMES_GATEWAY_URL = target
  t.after(() => {
    if (previous === undefined) delete process.env.HERMES_GATEWAY_URL
    else process.env.HERMES_GATEWAY_URL = previous
  })

  const dist = await mkdtemp(path.join(tmpdir(), 'hermes-proxy-test-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const fallback = await readFile(path.join(root, 'public/gateway-config.js'), 'utf8')
  await writeFile(path.join(dist, 'gateway-config.js'), fallback)
  await writeFile(path.join(dist, 'index.html'), '<script src="/gateway-config.js"></script>')

  for (const mode of ['dev', 'preview']) {
    await t.test(mode, async t => {
      const config = {
        root,
        configFile: path.join(root, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir: dist },
        server: { host: '127.0.0.1', port: 0, strictPort: false, preTransformRequests: false },
        preview: { host: '127.0.0.1', port: 0, strictPort: false }
      }
      const server = mode === 'dev' ? await createServer(config) : await preview(config)
      t.after(async () => {
        if (mode === 'dev') await server.close()
        else await new Promise(resolve => server.httpServer.close(resolve))
      })
      if (mode === 'dev') await server.listen()
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`
      const html = await (await fetch(origin)).text()
      const context = vm.createContext({ window: {} })
      // Execute classic scripts in page order to catch the old config overwrite.
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (match[1].includes('type="module"')) continue
        const src = /src="([^"]+)"/.exec(match[1])?.[1]
        const code = src ? await (await fetch(new URL(src, origin))).text() : match[2]
        vm.runInContext(code, context)
      }
      assert.deepEqual(Array.from(context.window.__HERMES_GATEWAY_WHITELIST__), [target])
      assert.equal((await fetch(`${origin}/gateway-config.js?v=2`)).headers.get('cache-control'), 'no-store')

      // Exercise the browser's actual routing helpers with the served config.
      context.window.location = new URL(origin)
      context.localStorage = { getItem: () => null }
      context.document = {}
      context.URL = URL
      const source = await readFile(path.join(root, 'src/web-bridge/gateways.ts'), 'utf8')
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
      context.exports = {}
      context.require = () => ({ atom: value => ({ get: () => value, set() {} }) })
      vm.runInContext(compiled, context)
      const routing = context.exports
      assert.equal(routing.classifyGatewayReach(target), null)
      assert.equal(routing.normalizeBase(target), origin)
      const url = routing.withGatewayRoute(`${routing.normalizeBase(target)}/api/status`, routing.upstreamOriginFor(target))
      const status = await (await fetch(url)).json()
      assert.deepEqual(status, { auth_required: true, auth_providers: ['basic'] })
      const wsUrl = routing.withGatewayRoute(`${origin}/api/ws?ticket=test-ticket`, target)
      await new Promise((resolve, reject) => {
        const upgrade = request(wsUrl, { headers: { Connection: 'Upgrade', Upgrade: 'websocket' } })
        upgrade.on('error', reject)
        upgrade.on('response', response => {
          response.resume()
          reject(new Error(`Expected WebSocket upgrade, received ${response.statusCode}`))
        })
        upgrade.on('upgrade', (response, socket) => {
          socket.destroy()
          assert.equal(response.statusCode, 101)
          resolve()
        })
        upgrade.end()
      })
      // An HTTPS page still reaches the HTTP gateway through its own proxy.
      context.window.location = new URL('https://web.example.test')
      assert.equal(routing.classifyGatewayReach(target), null)
      assert.equal(routing.normalizeBase(target), 'https://web.example.test')
      assert.equal(routing.classifyGatewayReach('http://unconfigured.example.test'), 'mixed-content')
    })
  }
})
