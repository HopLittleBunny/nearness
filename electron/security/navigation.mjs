import { resolve, sep } from 'node:path'

export const APP_ORIGIN = 'app://nearness'

export function resolveAppAssetPath(distRoot, requestUrl) {
  const url = new URL(requestUrl)
  if (url.protocol !== 'app:' || url.hostname !== 'nearness') return null
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const root = resolve(distRoot)
  const candidate = resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null
  return candidate
}

export function isTrustedApplicationUrl(url, devUrl = null) {
  try {
    const value = new URL(url)
    if (value.protocol === 'app:' && value.hostname === 'nearness') return true
    if (devUrl) return value.origin === new URL(devUrl).origin
    return false
  } catch { return false }
}

export function isAllowedExternalUrl(url) {
  try {
    const value = new URL(url)
    return value.protocol === 'https:' && ['github.com', 'openai.com', 'platform.openai.com', 'support.apple.com'].includes(value.hostname)
  } catch { return false }
}
