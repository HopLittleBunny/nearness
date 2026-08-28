import { describe, expect, it } from 'vitest'
import { assertTrustedIpcSender, validateIpcArgs } from '../electron/security/ipc-schema.mjs'
import { isAllowedExternalUrl, isTrustedApplicationUrl, resolveAppAssetPath } from '../electron/security/navigation.mjs'

describe('privileged desktop boundary', () => {
  it('serves only assets contained by the packaged dist root', () => {
    expect(resolveAppAssetPath('/app/dist', 'app://nearness/assets/index.js')).toBe('/app/dist/assets/index.js')
    expect(resolveAppAssetPath('/app/dist', 'app://nearness/%2e%2e%2fsecret.txt')).toBeNull()
    expect(resolveAppAssetPath('/app/dist', 'https://nearness/assets/index.js')).toBeNull()
  })

  it('trusts the app origin and exact configured development origin only', () => {
    expect(isTrustedApplicationUrl('app://nearness/index.html')).toBe(true)
    expect(isTrustedApplicationUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173')).toBe(true)
    expect(isTrustedApplicationUrl('http://127.0.0.1:5174/', 'http://127.0.0.1:5173')).toBe(false)
    expect(() => assertTrustedIpcSender({ senderFrame: { url: 'https://attacker.example/' } })).toThrow(/untrusted/i)
  })

  it('rejects renderer-controlled paths, unknown fields and oversized bytes', () => {
    expect(() => validateIpcArgs('import:commitIMessage', [{ previewId: 'p1', chatIds: ['1'], path: '/private/chat.db' }])).toThrow(/unknown/i)
    expect(() => validateIpcArgs('people:update', ['p1', { displayName: 'Friend', score: 99 }])).toThrow(/unknown/i)
    expect(() => validateIpcArgs('import:previewWhatsAppBytes', [{ name: 'chat.txt', bytes: { byteLength: 300 * 1024 * 1024 } }])).toThrow(/bytes are invalid/i)
  })

  it('keeps external navigation on a narrow https allowlist', () => {
    expect(isAllowedExternalUrl('https://support.apple.com/en-au/guide/mac-help/mh11785/mac')).toBe(true)
    expect(isAllowedExternalUrl('http://support.apple.com/')).toBe(false)
    expect(isAllowedExternalUrl('https://openai.com.attacker.example/')).toBe(false)
  })
})
