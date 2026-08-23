import { parsePhoneNumberFromString } from 'libphonenumber-js'

function normalizeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizeHandle(value, defaultCountry = 'AU') {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.includes('@')) return raw.toLowerCase()
  const phone = parsePhoneNumberFromString(raw, defaultCountry)
  if (phone?.isPossible()) return phone.number
  return raw.replace(/[\s()\-.]/g, '').toLowerCase()
}

export class IdentityService {
  constructor({ vault }) {
    this.vault = vault
  }

  rebuildProposals() {
    const identities = this.vault.listIdentities()
    const byHandle = new Map()
    const byName = new Map()
    for (const identity of identities) {
      if (identity.handleHash) {
        if (!byHandle.has(identity.handleHash)) byHandle.set(identity.handleHash, [])
        byHandle.get(identity.handleHash).push(identity)
      }
      const name = normalizeName(identity.displayName)
      if (name.length >= 3) {
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name).push(identity)
      }
    }

    for (const group of byHandle.values()) {
      const sources = new Set(group.map((identity) => identity.sourceId))
      if (group.length < 2 || sources.size < 2) continue
      this.vault.createIdentityProposal({
        identityIds: group.map((identity) => identity.id),
        proposedName: group.find((identity) => identity.displayName)?.displayName || 'One person',
        strength: 'strong',
        reasons: ['Matching phone or email', `${sources.size} independent sources`],
      })
    }

    for (const group of byName.values()) {
      const sources = new Set(group.map((identity) => identity.sourceId))
      if (group.length < 2 || sources.size < 2) continue
      const handleSet = new Set(group.map((identity) => identity.handleHash).filter(Boolean))
      if (handleSet.size === 1 && handleSet.size > 0) continue
      this.vault.createIdentityProposal({
        identityIds: group.map((identity) => identity.id),
        proposedName: group[0].displayName,
        strength: 'needs_review',
        reasons: ['Name match only', 'A name is not enough to merge'],
      })
    }
    return this.vault.getIdentityProposals()
  }
}
