#!/usr/bin/env node
/**
 * Prepares the Azure Functions deployment package in deploy-backend/.
 *
 * Structure produced:
 *   deploy-backend/
 *     dist/          <- compiled backend + shared (from packages/backend/dist)
 *     host.json      <- Azure Functions runtime config
 *     package.json   <- merged deps (backend + shared), no workspace:* refs
 *     node_modules/  <- prod deps installed by npm
 *       @respondex/shared/package.json  <- shim pointing to dist/shared/src/index.js
 */

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'deploy-backend')

// 1. Clean and create output dir
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true })
}
fs.mkdirSync(outDir, { recursive: true })

// 2. Copy compiled dist (contains dist/backend/src + dist/shared/src)
const backendDist = path.join(root, 'packages/backend/dist')
fs.cpSync(backendDist, path.join(outDir, 'dist'), { recursive: true })
console.log('✓ Copied dist/')

// 3. Copy host.json
fs.copyFileSync(
  path.join(root, 'packages/backend/host.json'),
  path.join(outDir, 'host.json')
)
console.log('✓ Copied host.json')

// 4. Build merged package.json
const backendPkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/backend/package.json'), 'utf8'))
const sharedPkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/shared/package.json'), 'utf8'))

// Merge: backend deps + shared deps, remove workspace:* and devDeps
const merged = {
  name: backendPkg.name,
  version: backendPkg.version,
  main: backendPkg.main,
  dependencies: {
    ...backendPkg.dependencies,
    ...(sharedPkg.dependencies || {}),
  },
}
delete merged.dependencies['@respondex/shared']

fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(merged, null, 2))
console.log('✓ Written package.json (merged backend + shared deps, no workspace:*)')

// 5. npm install prod deps
console.log('→ Running npm install --omit=dev ...')
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], {
  cwd: outDir,
  stdio: 'inherit',
})
console.log('✓ node_modules installed')

// 6. Create @respondex/shared shim -> dist/shared/src/index.js
const shimDir = path.join(outDir, 'node_modules/@respondex/shared')
fs.mkdirSync(shimDir, { recursive: true })
const shim = {
  name: '@respondex/shared',
  version: sharedPkg.version || '0.0.1',
  main: '../../../dist/shared/src/index.js',
}
fs.writeFileSync(path.join(shimDir, 'package.json'), JSON.stringify(shim, null, 2))
console.log('✓ Created @respondex/shared shim -> dist/shared/src/index.js')

console.log('\n✅ deploy-backend/ ready')
