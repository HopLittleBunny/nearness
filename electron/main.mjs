import { app, BrowserWindow, dialog as electronDialog, net, protocol, safeStorage, shell } from 'electron'
import { appendFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AnalysisService } from './services/analysis-service.mjs'
import { CareEngine } from './services/care-engine.mjs'
import { IdentityService } from './services/identity-service.mjs'
import { ImportService } from './services/import-service.mjs'
import { KeyStore } from './services/key-store.mjs'
import { Vault } from './services/vault.mjs'
import { registerIpc } from './ipc.mjs'
import { isAllowedExternalUrl, isTrustedApplicationUrl, resolveAppAssetPath } from './security/navigation.mjs'

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url))
let mainWindow

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }])

function trace(phase) {
  if (!process.env.NEARNESS_SMOKE_LOG) return
  appendFile(process.env.NEARNESS_SMOKE_LOG, `${new Date().toISOString()} ${phase}\n`).catch(() => {})
}

app.setName('Nearness')
if (process.env.NEARNESS_USER_DATA) app.setPath('userData', process.env.NEARNESS_USER_DATA)

const runtime = {
  keyStore: null,
  vault: null,
  identityService: null,
  importService: null,
  analysisService: null,
  careEngine: null,
  databasePath: null,
  async initialiseServices() {
    trace('services:start')
    const userDataPath = app.getPath('userData')
    this.databasePath = join(userDataPath, 'nearness-vault.sqlite')
    this.keyStore ||= new KeyStore({ safeStorage, userDataPath })
    const bootstrapKeyFile = process.env.NEARNESS_BOOTSTRAP_KEY_FILE
    if (bootstrapKeyFile && !(await this.keyStore.hasOpenAiKey())) {
      await this.keyStore.importOpenAiKeyFromEnvFile(bootstrapKeyFile)
    }
    trace('services:keys-ready')
    const masterKey = await this.keyStore.getOrCreateVaultKey()
    this.vault = await new Vault({ databasePath: this.databasePath, masterKey }).open()
    this.identityService = new IdentityService({ vault: this.vault })
    this.importService = new ImportService({ vault: this.vault, identityService: this.identityService })
    this.analysisService = new AnalysisService({ vault: this.vault, keyStore: this.keyStore })
    this.careEngine = new CareEngine({ vault: this.vault })
    trace('services:vault-ready')
  },
  async resetVault({ deleteOpenAiKey = false } = {}) {
    await this.importService?.dispose?.()
    this.vault?.close()
    for (const path of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
      await rm(path, { force: true })
    }
    await this.keyStore.deleteVaultKey()
    if (deleteOpenAiKey) await this.keyStore.deleteOpenAiKey()
    await this.initialiseServices()
    mainWindow?.reload()
  },
}

function createWindow() {
  trace('window:create')
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 1000,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#07141c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 19 },
    show: false,
    webPreferences: {
      preload: join(moduleDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: Boolean(process.env.NEARNESS_DEV_URL),
    },
  })
  trace('window:constructed')

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isTrustedApplicationUrl(url, process.env.NEARNESS_DEV_URL || null)
    if (!allowed) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.once('did-finish-load', () => trace('window:loaded'))
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.NEARNESS_DEV_URL) mainWindow.loadURL(process.env.NEARNESS_DEV_URL)
  else mainWindow.loadURL('app://nearness/index.html')
  trace('window:load-requested')
}

trace('module:loaded')
app.whenReady().then(async () => {
  trace('app:ready')
  const distRoot = join(moduleDirectory, '..', 'dist')
  protocol.handle('app', (request) => {
    const assetPath = resolveAppAssetPath(distRoot, request.url)
    return assetPath ? net.fetch(pathToFileURL(assetPath).toString()) : new Response('Not found', { status: 404 })
  })
  await runtime.initialiseServices()
  registerIpc(runtime)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}).catch((error) => {
  trace(`startup:error:${String(error?.message || error).replace(/\s+/g, ' ').slice(0, 240)}`)
  electronDialog.showErrorBox('Nearness could not open its private vault', String(error?.message || error))
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  runtime.importService?.dispose?.()
  runtime.vault?.close()
})
