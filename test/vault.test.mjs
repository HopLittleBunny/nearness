import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Vault, newMasterKey } from '../electron/services/vault.mjs'
import { AnalysisService } from '../electron/services/analysis-service.mjs'
import { CareEngine } from '../electron/services/care-engine.mjs'

const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })

describe('encrypted vault', () => {
  it('opens at the current schema with stable import deduplication columns', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-vault-schema-test-'))
    folders.push(folder)
    const databasePath = join(folder, 'vault.sqlite')
    const masterKey = newMasterKey()
    const original = await new Vault({ databasePath, masterKey }).open()
    original.db.exec(`
      DROP INDEX idx_sources_type_key;
      DROP INDEX idx_conversations_service_key;
      DROP INDEX idx_messages_conversation_fingerprint;
      ALTER TABLE sources DROP COLUMN source_key;
      ALTER TABLE conversations DROP COLUMN stable_key;
      ALTER TABLE messages DROP COLUMN event_fingerprint;
      UPDATE metadata SET value='1' WHERE key='schema_version';
    `)
    original.close()

    const migrated = await new Vault({ databasePath, masterKey }).open()
    expect(migrated.db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get().value).toBe('2')
    expect(migrated.db.prepare('PRAGMA table_info(sources)').all().some((column) => column.name === 'source_key')).toBe(true)
    expect(migrated.db.prepare('PRAGMA table_info(conversations)').all().some((column) => column.name === 'stable_key')).toBe(true)
    expect(migrated.db.prepare('PRAGMA table_info(messages)').all().some((column) => column.name === 'event_fingerprint')).toBe(true)
    migrated.close()
  })

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

  it('keeps unrelated group authors out of a person relationship history', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-vault-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Group fixture', sourceHash: 'group-fixture' })
    const bobIdentity = vault.upsertIdentity({ sourceId, externalId: 'bob', kind: 'whatsapp_name', displayName: 'Bob' })
    const aliceIdentity = vault.upsertIdentity({ sourceId, externalId: 'alice', kind: 'whatsapp_name', displayName: 'Alice' })
    const meIdentity = vault.upsertIdentity({ sourceId, externalId: 'me', kind: 'whatsapp_name', displayName: 'Me', isSelf: true })
    const bobPerson = vault.ensurePersonForIdentity(bobIdentity)
    vault.ensurePersonForIdentity(aliceIdentity)

    const direct = vault.upsertConversation({ sourceId, externalId: 'direct-bob', title: 'Bob', service: 'WhatsApp' })
    vault.linkConversationIdentity(direct, bobIdentity)
    vault.insertMessage({ sourceId, conversationId: direct, externalId: 'direct-me', senderIdentityId: meIdentity, sentAt: '2026-01-01T00:00:00Z', isFromMe: true, body: 'Direct message from me' })
    vault.insertMessage({ sourceId, conversationId: direct, externalId: 'direct-bob', senderIdentityId: bobIdentity, sentAt: '2026-01-02T00:00:00Z', body: 'Direct reply from Bob' })

    const group = vault.upsertConversation({ sourceId, externalId: 'group', title: 'Friends group', service: 'WhatsApp', isGroup: true })
    for (const identity of [bobIdentity, aliceIdentity, meIdentity]) vault.linkConversationIdentity(group, identity)
    vault.insertMessage({ sourceId, conversationId: group, externalId: 'group-alice', senderIdentityId: aliceIdentity, sentAt: '2026-02-01T00:00:00Z', body: 'Alice private fixture text' })
    vault.insertMessage({ sourceId, conversationId: group, externalId: 'group-me', senderIdentityId: meIdentity, sentAt: '2026-02-02T00:00:00Z', isFromMe: true, body: 'General group message from me' })
    vault.insertMessage({ sourceId, conversationId: group, externalId: 'group-bob', senderIdentityId: bobIdentity, sentAt: '2026-02-03T00:00:00Z', body: 'Bob group contribution' })

    const bobMessages = vault.getMessagesForPerson(bobPerson)
    expect(bobMessages.map((message) => message.body)).toEqual(['Direct message from me', 'Direct reply from Bob', 'Bob group contribution'])
    expect(bobMessages.some((message) => message.body.includes('Alice'))).toBe(false)
    expect(bobMessages.at(-1).evidenceScope).toBe('person_in_group')
    expect(vault.getPerson(bobPerson).lastMessageAt).toBe('2026-01-02T00:00:00Z')
    vault.close()
  })

  it('shows and hashes the exact recursively redacted analysis payload', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-vault-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    vault.saveRelationalSelf({ displayName: 'Amit', currentChapter: 'Amit moved near 12 King Street', norms: { notes: 'Email amit@example.com' } })
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Rohan', sourceHash: 'payload-fixture' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'rohan', kind: 'whatsapp_name', displayName: 'Rohan' })
    const personId = vault.ensurePersonForIdentity(identityId)
    const conversationId = vault.upsertConversation({ sourceId, externalId: 'rohan-chat', title: 'Rohan', service: 'WhatsApp' })
    vault.linkConversationIdentity(conversationId, identityId)
    vault.insertMessage({ sourceId, conversationId, externalId: 'm1', senderIdentityId: identityId, sentAt: '2026-01-01T00:00:00Z', body: 'I will call Amit tomorrow at +61 400 111 222' })
    const analysis = new AnalysisService({ vault, keyStore: {} })
    const inspected = analysis.inspectPayload(personId)
    const serialized = JSON.stringify(inspected.payload)
    for (const secret of ['Rohan', 'Amit', 'amit@example.com', '+61 400 111 222', '12 King Street']) expect(serialized).not.toContain(secret)
    expect(inspected.excerptSample).toEqual(inspected.payload.excerpts)
    expect(inspected.payloadHash).toMatch(/^[a-f0-9]{64}$/)
    vault.close()
  })

  it('turns a saved relationship intention into a bounded Care suggestion', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-care-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Friend', sourceHash: 'care-fixture' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'whatsapp_name', displayName: 'Friend' })
    const personId = vault.ensurePersonForIdentity(identityId)
    const conversationId = vault.upsertConversation({ sourceId, externalId: 'friend-chat', title: 'Friend', service: 'WhatsApp' })
    vault.linkConversationIdentity(conversationId, identityId)
    vault.insertMessage({ sourceId, conversationId, externalId: 'old-message', senderIdentityId: identityId, sentAt: '2025-01-01T00:00:00Z', body: 'Hello' })
    vault.updatePerson(personId, { intention: 'preserve', cadenceDays: 30 })

    const result = new CareEngine({ vault }).rebuild()
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].personId).toBe(personId)
    expect(result.actions[0].reason).toContain('rhythm you chose')
    expect(result.allocated).toBeLessThanOrEqual(Math.floor(vault.getRelationalSelf().weeklyMinutes * 0.7))
    vault.close()
  })
})
