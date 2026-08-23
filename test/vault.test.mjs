import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Vault, newMasterKey } from '../electron/services/vault.mjs'

const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })

describe('encrypted vault', () => {
  it('round-trips personal data while keeping it out of database bytes', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-vault-test-'))
    folders.push(folder)
    const path = join(folder, 'vault.sqlite')
    const vault = await new Vault({ databasePath: path, masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Secret friendship export', sourceHash: 'source-hash' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'name:Rohan Mehta', kind: 'whatsapp_name', displayName: 'Rohan Mehta', handle: '+61400111222' })
    const personId = vault.ensurePersonForIdentity(identityId)
    const conversationId = vault.upsertConversation({ sourceId, externalId: 'chat:+61400111222', title: 'Private Rohan chat', service: 'WhatsApp' })
    vault.linkConversationIdentity(conversationId, identityId)
    vault.insertMessage({ sourceId, conversationId, externalId: 'm1', senderIdentityId: identityId, sentAt: '2026-01-01T00:00:00Z', body: 'A uniquely private friendship sentence.' })
    vault.updateSourceCounts(sourceId)
    expect(vault.getPerson(personId).displayName).toBe('Rohan Mehta')
    expect(vault.getMessagesForPerson(personId)[0].body).toBe('A uniquely private friendship sentence.')
    vault.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    vault.close()
    const bytes = await readFile(path)
    for (const secret of ['Rohan Mehta', '+61400111222', 'Private Rohan chat', 'A uniquely private friendship sentence.', 'Secret friendship export']) {
      expect(bytes.includes(Buffer.from(secret))).toBe(false)
    }
  })

  it('joins multiple source identities only after a user decision', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-vault-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const s1 = vault.createSource({ type: 'contacts', label: 'Contacts', sourceHash: 'a' })
    const s2 = vault.createSource({ type: 'imessage', label: 'Messages', sourceHash: 'b' })
    const i1 = vault.upsertIdentity({ sourceId: s1, externalId: 'a', kind: 'phone', displayName: 'Rohan', handle: '+61400111222' })
    const i2 = vault.upsertIdentity({ sourceId: s2, externalId: 'b', kind: 'phone', displayName: '+61400111222', handle: '+61400111222' })
    const p1 = vault.ensurePersonForIdentity(i1)
    const p2 = vault.ensurePersonForIdentity(i2)
    expect(p1).not.toBe(p2)
    const proposalId = vault.createIdentityProposal({ identityIds: [i1, i2], proposedName: 'Rohan', strength: 'strong', reasons: ['Matching phone'] })
    vault.decideIdentityProposal(proposalId, 'merge')
    expect(vault.getPeople()).toHaveLength(1)
    expect(vault.getPeople()[0].identityCount).toBe(2)
    vault.close()
  })
})
