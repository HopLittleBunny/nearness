import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

function parseEnvKey(text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+?)\s*$/)
    if (!match) continue
    const value = match[1].replace(/^['"]|['"]$/g, '').trim()
    if (value.startsWith('sk-') && value.length > 30) return value
  }
  return null
}

export class KeyStore {
  constructor({ safeStorage, userDataPath }) {
    this.safeStorage = safeStorage
    this.userDataPath = userDataPath
    this.vaultKeyPath = join(userDataPath, 'vault-key.enc')
    this.openAiKeyPath = join(userDataPath, 'openai-key.enc')
  }

  ensureEncryption() {
    if (!this.safeStorage?.isEncryptionAvailable()) throw new Error('macOS secure storage is not available. Nearness will not create an unprotected vault.')
  }

  async writeProtected(path, value) {
    this.ensureEncryption()
    await mkdir(dirname(path), { recursive: true })
    const encrypted = this.safeStorage.encryptString(value)
    await writeFile(path, encrypted, { mode: 0o600 })
    await chmod(path, 0o600)
  }

  async readProtected(path) {
    this.ensureEncryption()
    if (!(await exists(path))) return null
    const encrypted = await readFile(path)
    return this.safeStorage.decryptString(encrypted)
  }

  async getOrCreateVaultKey() {
    const existing = await this.readProtected(this.vaultKeyPath)
    if (existing) {
      const key = Buffer.from(existing, 'base64')
      if (key.length === 32) return key
    }
    const key = randomBytes(32)
    await this.writeProtected(this.vaultKeyPath, key.toString('base64'))
    return key
  }

  async getOpenAiKey() {
    return this.readProtected(this.openAiKeyPath)
  }

  async hasOpenAiKey() {
    return Boolean(await this.getOpenAiKey())
  }

  async saveOpenAiKey(value) {
    const key = String(value || '').trim()
    if (!key.startsWith('sk-') || key.length < 30) throw new Error('That does not look like a usable OpenAI API key.')
    await this.writeProtected(this.openAiKeyPath, key)
    return { configured: true }
  }

  async deleteOpenAiKey() {
    await rm(this.openAiKeyPath, { force: true })
    return { configured: false }
  }

  async deleteVaultKey() {
    await rm(this.vaultKeyPath, { force: true })
    return { deleted: true }
  }

  async importOpenAiKeyFromEnvFile(path) {
    if (!path || !(await exists(path))) return { imported: false, reason: 'missing' }
    const key = parseEnvKey(await readFile(path, 'utf8'))
    if (!key) return { imported: false, reason: 'not_found' }
    await this.saveOpenAiKey(key)
    return { imported: true }
  }

  paths() {
    return { vaultKeyPath: this.vaultKeyPath, openAiKeyPath: this.openAiKeyPath }
  }
}
