import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createCipheriv, randomBytes } from 'node:crypto'
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
    expect(migrated.db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get().value).toBe('3')
    expect(migrated.db.prepare('PRAGMA table_info(sources)').all().some((column) => column.name === 'source_key')).toBe(true)
    expect(migrated.db.prepare('PRAGMA table_info(conversations)').all().some((column) => column.name === 'stable_key')).toBe(true)
    expect(migrated.db.prepare('PRAGMA table_info(messages)').all().some((column) => column.name === 'event_fingerprint')).toBe(true)
    for (const table of ['source_import_jobs', 'media_items', 'interaction_episodes', 'manual_interactions', 'relationship_roles', 'relationship_norms', 'symbolic_meanings', 'assessment_snapshots', 'consent_receipts', 'processing_runs', 'audit_events']) {
      expect(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)?.name).toBe(table)
    }
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
    vault.insertMessage({ sourceId, conversationId, externalId: 'm2', senderIdentityId: identityId, sentAt: '2026-01-02T00:00:00Z', body: '<attached: SecretVacation.jpg>', attachmentCount: 1, modality: 'image', mediaItems: [{ mediaFamily: 'image', sourceReference: 'SecretVacation.jpg' }] })
    const analysis = new AnalysisService({ vault, keyStore: {} })
    const inspected = analysis.inspectPayload(personId)
    const serialized = JSON.stringify(inspected.payload)
    for (const secret of ['Rohan', 'Amit', 'amit@example.com', '+61 400 111 222', '12 King Street', 'SecretVacation.jpg']) expect(serialized).not.toContain(secret)
    expect(serialized).toContain('media event metadata only')
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
    expect(result.actions[0].reason).toContain('latest substantive visible interaction')
    expect(result.allocated).toBeLessThanOrEqual(Math.floor(vault.getRelationalSelf().weeklyMinutes * 0.7))
    vault.close()
  })

  it('keeps visible touch, interaction episodes and user-confirmed meaningful contact separate', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-ecology-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Friend', sourceHash: 'ecology-fixture' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'whatsapp_name', displayName: 'Friend' })
    const personId = vault.ensurePersonForIdentity(identityId)
    const conversationId = vault.upsertConversation({ sourceId, externalId: 'friend-chat', title: 'Friend', service: 'WhatsApp' })
    vault.linkConversationIdentity(conversationId, identityId)
    vault.insertMessage({ sourceId, conversationId, externalId: 'm1', senderIdentityId: identityId, sentAt: '2026-01-01T00:00:00Z', body: 'Hello' })
    vault.insertMessage({ sourceId, conversationId, externalId: 'm2', senderIdentityId: identityId, sentAt: '2026-02-01T00:00:00Z', body: '<Media omitted>', attachmentCount: 1, modality: 'image', mediaItems: [{ mediaFamily: 'image', sourceReference: 'IMG-001.jpg' }] })
    let person = vault.getPerson(personId)
    expect(person.communicationEcology.lastVisibleTouch).toBe('2026-02-01T00:00:00Z')
    expect(person.communicationEcology.lastMeaningfulContact).toBeNull()
    expect(person.recency.authority).toBe('interaction_episode')
    vault.addManualInteraction(personId, { occurredAt: '2026-03-01T10:00:00Z', interactionType: 'phone_call', meaningful: true, title: 'Long call' })
    person = vault.getPerson(personId)
    expect(person.communicationEcology.lastMeaningfulContact).toBe('2026-03-01T10:00:00.000Z')
    expect(person.recency.authority).toBe('user_confirmed_meaningful')
    expect(person).not.toHaveProperty('score')
    vault.close()
  })

  it('stores relationship context, self-reports and processing receipts with explicit authority', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-authority-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Friend', sourceHash: 'authority-fixture' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'whatsapp_name', displayName: 'Friend' })
    const personId = vault.ensurePersonForIdentity(identityId)
    vault.updatePerson(personId, { roles: ['friend', 'professional_collaborator'], primaryRole: 'friend', norms: { silenceMeaning: 'comfortable continuity', careExpressedAs: ['practical_help'] }, analysisDisabled: true, careDisabled: true })
    vault.addSymbolicMeaning(personId, { symbol: 'Reached?', meaning: 'Checking safe arrival' })
    vault.saveAssessmentSnapshot(personId, 'relationship_experience_profile', { authority: 'user_report', dimensions: { emotional_security: 4 }, noCompositeScore: true })
    const receiptId = vault.createConsentReceipt({ personId, operation: 'relationship_portrait', payloadHash: 'a'.repeat(64), provider: 'OpenAI', model: 'test-model', endpoint: 'Responses API', retentionDisclosureVersion: 'test' })
    const runId = vault.createProcessingRun({ personId, operation: 'relationship_portrait', consentReceiptId: receiptId, model: 'test-model', inputCount: 12 })
    vault.completeProcessingRun(runId, { status: 'completed', outputCount: 2 })
    const person = vault.getPerson(personId)
    expect(person.roles).toEqual(['friend', 'professional_collaborator'])
    expect(person.norms.silenceMeaning).toBe('comfortable continuity')
    expect(person.symbolicMeanings[0].meaning).toBe('Checking safe arrival')
    expect(person.experienceProfile.snapshot.authority).toBe('user_report')
    expect(person.analysisDisabled).toBe(true)
    expect(vault.getProcessingHistory()[0].consent.payloadHash).toBe('a'.repeat(64))
    vault.close()
  })

  it('fails loudly on damaged ciphertext instead of substituting empty personal data', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-corruption-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Friend', sourceHash: 'corrupt-fixture' })
    vault.db.prepare('UPDATE sources SET label_cipher=? WHERE id=?').run(Buffer.from('02deadbeef', 'hex'), sourceId)
    expect(() => vault.getSources()).toThrow(/damaged encrypted data/i)
    vault.close()
  })

  it('decrypts legacy version-one fields after upgrading to the derived field key', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-legacy-crypto-test-'))
    folders.push(folder)
    const masterKey = newMasterKey()
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Placeholder', sourceHash: 'legacy-crypto' })
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
    const encrypted = Buffer.concat([cipher.update('Legacy readable label', 'utf8'), cipher.final()])
    const legacyField = Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted])
    vault.db.prepare('UPDATE sources SET label_cipher=? WHERE id=?').run(legacyField, sourceId)
    expect(vault.getSources()[0].label).toBe('Legacy readable label')
    vault.close()
  })

  it('does not resurrect a user-rejected hypothesis in a later analysis', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-rejection-memory-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Friend', sourceHash: 'rejection-memory' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'whatsapp_name', displayName: 'Friend' })
    const personId = vault.ensurePersonForIdentity(identityId)
    const observation = { statement: 'Visible replies become shorter in the latest period.', construct: 'responsiveness', evidenceType: 'model_inference', evidenceRefs: ['m1'], missing: ['calls'], confidence: 'low', alternatives: ['The visible period may be unusually busy.'] }
    let person = vault.saveAnalysis({ personId, model: 'test', inputCount: 1, portrait: { headline: 'First' }, observations: [observation] })
    vault.updateObservationStatus(person.observations[0].id, 'rejected')
    person = vault.saveAnalysis({ personId, model: 'test', inputCount: 1, portrait: { headline: 'Second' }, observations: [observation] })
    expect(person.observations).toHaveLength(0)
    vault.close()
  })

  it('rolls back an interrupted new-source import when the vault reopens', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-crash-recovery-test-'))
    folders.push(folder)
    const databasePath = join(folder, 'vault.sqlite')
    const masterKey = newMasterKey()
    let vault = await new Vault({ databasePath, masterKey }).open()
    const sourceId = vault.createSource({ type: 'whatsapp', label: 'Interrupted', sourceHash: 'interrupted-fixture', status: 'importing' })
    const jobId = vault.createImportJob({ sourceId, kind: 'whatsapp', totalEvents: 10, stage: 'writing_encrypted_events' })
    const identityId = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'whatsapp_name', displayName: 'Friend' })
    vault.ensurePersonForIdentity(identityId)
    const conversationId = vault.upsertConversation({ sourceId, externalId: 'chat', title: 'Friend', service: 'WhatsApp' })
    vault.insertMessage({ sourceId, conversationId, externalId: 'm1', importJobId: jobId, senderIdentityId: identityId, sentAt: '2026-01-01T00:00:00Z', body: 'Partial write' })
    vault.close()

    vault = await new Vault({ databasePath, masterKey }).open()
    expect(vault.getSources()).toHaveLength(0)
    expect(vault.getPeople()).toHaveLength(0)
    expect(vault.getBootstrap().messageCount).toBe(0)
    expect(vault.getAuditEvents()[0].action).toBe('interrupted_import_recovered')
    vault.close()
  })
})
