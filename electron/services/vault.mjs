import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { calculateCareAlignment, defaultRelationalSelf, deriveLocalRelationshipSignals } from '../domain/framework.mjs'

function nowIso() {
  return new Date().toISOString()
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

export class Vault {
  constructor({ databasePath, masterKey }) {
    if (!databasePath) throw new Error('A vault database path is required.')
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new Error('The vault master key must be 32 bytes.')
    this.databasePath = databasePath
    this.masterKey = masterKey
    this.db = null
  }

  async open() {
    await mkdir(dirname(this.databasePath), { recursive: true })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;')
    this.migrate()
    if (!this.getRelationalSelf()) this.saveRelationalSelf(defaultRelationalSelf())
    return this
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label_cipher BLOB NOT NULL,
        source_hash TEXT NOT NULL UNIQUE,
        imported_at TEXT NOT NULL,
        status TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        conversation_count INTEGER NOT NULL DEFAULT 0,
        participant_count INTEGER NOT NULL DEFAULT 0,
        start_at TEXT,
        end_at TEXT,
        config_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        display_name_cipher BLOB NOT NULL,
        handle_hash TEXT,
        handle_cipher BLOB,
        is_self INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(source_id, external_id)
      );
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        display_name_cipher BLOB NOT NULL,
        primary_class TEXT NOT NULL DEFAULT 'friendship',
        specific_relationship TEXT NOT NULL DEFAULT 'friend',
        social_worlds_json TEXT NOT NULL DEFAULT '[]',
        forms_json TEXT NOT NULL DEFAULT '[]',
        closeness TEXT NOT NULL DEFAULT 'active',
        trajectory TEXT NOT NULL DEFAULT 'unknown',
        intention TEXT,
        cadence_days INTEGER,
        intentionally_quiet INTEGER NOT NULL DEFAULT 0,
        notes_cipher BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS person_identities (
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
        decision TEXT NOT NULL DEFAULT 'confirmed',
        confidence_label TEXT NOT NULL DEFAULT 'user_confirmed',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        PRIMARY KEY(person_id, identity_id)
      );
      CREATE TABLE IF NOT EXISTS identity_proposals (
        id TEXT PRIMARY KEY,
        identity_ids_json TEXT NOT NULL,
        proposed_name_cipher BLOB NOT NULL,
        strength TEXT NOT NULL,
        reason_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        title_cipher BLOB NOT NULL,
        is_group INTEGER NOT NULL DEFAULT 0,
        service TEXT NOT NULL,
        start_at TEXT,
        end_at TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        participant_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(source_id, external_id)
      );
      CREATE TABLE IF NOT EXISTS conversation_identities (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        identity_id TEXT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
        PRIMARY KEY(conversation_id, identity_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        sender_identity_id TEXT REFERENCES identities(id) ON DELETE SET NULL,
        sent_at TEXT NOT NULL,
        is_from_me INTEGER NOT NULL DEFAULT 0,
        body_cipher BLOB,
        body_hash TEXT,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        reply_to_external_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(source_id, external_id)
      );
      CREATE TABLE IF NOT EXISTS relational_self (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        profile_cipher BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
        statement_cipher BLOB NOT NULL,
        construct TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        time_start TEXT,
        time_end TEXT,
        missing_json TEXT NOT NULL DEFAULT '[]',
        confidence TEXT NOT NULL,
        alternatives_cipher BLOB,
        user_status TEXT NOT NULL DEFAULT 'unreviewed',
        model_version TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        input_count INTEGER NOT NULL DEFAULT 0,
        usage_json TEXT NOT NULL DEFAULT '{}',
        portrait_cipher BLOB,
        error_cipher BLOB,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS care_actions (
        id TEXT PRIMARY KEY,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        title_cipher BLOB NOT NULL,
        reason_cipher BLOB NOT NULL,
        minutes INTEGER NOT NULL,
        energy TEXT NOT NULL,
        due_at TEXT,
        status TEXT NOT NULL DEFAULT 'suggested',
        source_refs_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_date ON messages(conversation_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_date ON messages(sender_identity_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_person_identities_identity ON person_identities(identity_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_person_identity_unique ON person_identities(identity_id);
      CREATE INDEX IF NOT EXISTS idx_observations_person ON observations(person_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_care_actions_status ON care_actions(status, due_at);
    `)
    this.db.prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)').run('schema_version', '1')
  }

  close() {
    if (this.db) this.db.close()
    this.db = null
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  encrypt(value) {
    if (value == null) return null
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv)
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([Buffer.from([1]), iv, tag, encrypted])
  }

  decrypt(value, fallback = '') {
    if (value == null) return fallback
    try {
      const buffer = Buffer.from(value)
      if (buffer[0] !== 1) return fallback
      const iv = buffer.subarray(1, 13)
      const tag = buffer.subarray(13, 29)
      const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(buffer.subarray(29)), decipher.final()]).toString('utf8')
    } catch {
      return fallback
    }
  }

  encryptJson(value) { return this.encrypt(JSON.stringify(value)) }
  decryptJson(value, fallback = null) { return parseJson(this.decrypt(value, ''), fallback) }
  hash(value) { return createHmac('sha256', this.masterKey).update(String(value || '').trim().toLowerCase()).digest('hex') }

  setState(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO app_state(key, value_json) VALUES (?, ?)').run(key, JSON.stringify(value))
  }

  getState(key, fallback = null) {
    return parseJson(this.db.prepare('SELECT value_json FROM app_state WHERE key = ?').get(key)?.value_json, fallback)
  }

  saveRelationalSelf(profile) {
    const value = { ...defaultRelationalSelf(), ...profile, updatedAt: nowIso() }
    this.db.prepare(`INSERT OR REPLACE INTO relational_self(id, profile_cipher, updated_at) VALUES (1, ?, ?)`).run(this.encryptJson(value), value.updatedAt)
    return value
  }

  getRelationalSelf() {
    const row = this.db.prepare('SELECT profile_cipher FROM relational_self WHERE id = 1').get()
    return row ? this.decryptJson(row.profile_cipher, defaultRelationalSelf()) : null
  }

  findSourceByHash(sourceHash) {
    return this.db.prepare('SELECT id FROM sources WHERE source_hash = ?').get(sourceHash) || null
  }

  getSourceIdByHash(sourceHash) {
    return this.findSourceByHash(sourceHash)?.id || null
  }

  createSource({ type, label, sourceHash, status = 'imported', messageCount = 0, conversationCount = 0, participantCount = 0, startAt = null, endAt = null, config = {} }) {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO sources(id, type, label_cipher, source_hash, imported_at, status, message_count, conversation_count, participant_count, start_at, end_at, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, this.encrypt(label), sourceHash, nowIso(), status, messageCount, conversationCount, participantCount, startAt, endAt, JSON.stringify(config))
    return id
  }

  getSources() {
    return this.db.prepare('SELECT * FROM sources ORDER BY imported_at DESC').all().map((row) => ({
      id: row.id, type: row.type, label: this.decrypt(row.label_cipher), importedAt: row.imported_at,
      status: row.status, messageCount: row.message_count, conversationCount: row.conversation_count,
      participantCount: row.participant_count, startAt: row.start_at, endAt: row.end_at,
      config: parseJson(row.config_json, {}),
    }))
  }

  deleteSource(sourceId) {
    const source = this.db.prepare('SELECT id FROM sources WHERE id = ?').get(sourceId)
    if (!source) throw new Error('Source not found.')
    this.transaction(() => {
      this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
      this.db.exec(`DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM person_identities)`)
    })
    return this.getBootstrap()
  }

  updateSourceCounts(sourceId) {
    const stats = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM messages WHERE source_id = ?) AS messages,
        (SELECT COUNT(*) FROM conversations WHERE source_id = ?) AS conversations,
        (SELECT COUNT(*) FROM identities WHERE source_id = ? AND is_self = 0) AS participants,
        (SELECT MIN(sent_at) FROM messages WHERE source_id = ?) AS start_at,
        (SELECT MAX(sent_at) FROM messages WHERE source_id = ?) AS end_at
    `).get(sourceId, sourceId, sourceId, sourceId, sourceId)
    this.db.prepare(`UPDATE sources SET message_count=?, conversation_count=?, participant_count=?, start_at=?, end_at=? WHERE id=?`).run(
      stats.messages, stats.conversations, stats.participants, stats.start_at, stats.end_at, sourceId,
    )
  }

  upsertIdentity({ sourceId, externalId, kind, displayName, handle = null, isSelf = false, metadata = {} }) {
    const externalKey = this.hash(`identity:${externalId}`)
    const existing = this.db.prepare('SELECT id FROM identities WHERE source_id = ? AND external_id = ?').get(sourceId, externalKey)
    if (existing) return existing.id
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO identities(id, source_id, external_id, kind, display_name_cipher, handle_hash, handle_cipher, is_self, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, externalKey, kind, this.encrypt(displayName), handle ? this.hash(handle) : null, handle ? this.encrypt(handle) : null, isSelf ? 1 : 0, JSON.stringify(metadata))
    return id
  }

  createPerson({ displayName, primaryClass = 'friendship', specificRelationship = 'friend', socialWorlds = [], forms = [], closeness = 'active', trajectory = 'unknown', intention = null }) {
    const id = randomUUID()
    const timestamp = nowIso()
    this.db.prepare(`
      INSERT INTO people(id, display_name_cipher, primary_class, specific_relationship, social_worlds_json, forms_json, closeness, trajectory, intention, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.encrypt(displayName), primaryClass, specificRelationship, JSON.stringify(socialWorlds), JSON.stringify(forms), closeness, trajectory, intention, timestamp, timestamp)
    return id
  }

  linkIdentityToPerson(personId, identityId, { decision = 'confirmed', confidenceLabel = 'user_confirmed', evidence = [] } = {}) {
    this.db.prepare(`
      INSERT OR REPLACE INTO person_identities(person_id, identity_id, decision, confidence_label, evidence_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(personId, identityId, decision, confidenceLabel, JSON.stringify(evidence), nowIso())
  }

  ensurePersonForIdentity(identityId) {
    const linked = this.db.prepare('SELECT person_id FROM person_identities WHERE identity_id = ? LIMIT 1').get(identityId)
    if (linked) return linked.person_id
    const identity = this.db.prepare('SELECT display_name_cipher, is_self FROM identities WHERE id = ?').get(identityId)
    if (!identity || identity.is_self) return null
    const personId = this.createPerson({ displayName: this.decrypt(identity.display_name_cipher) })
    this.linkIdentityToPerson(personId, identityId, { decision: 'source_identity', confidenceLabel: 'source_only' })
    return personId
  }

  upsertConversation({ sourceId, externalId, title, isGroup = false, service, startAt = null, endAt = null, messageCount = 0, participantCount = 0, metadata = {} }) {
    const externalKey = this.hash(`conversation:${externalId}`)
    const existing = this.db.prepare('SELECT id FROM conversations WHERE source_id = ? AND external_id = ?').get(sourceId, externalKey)
    if (existing) return existing.id
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO conversations(id, source_id, external_id, title_cipher, is_group, service, start_at, end_at, message_count, participant_count, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, externalKey, this.encrypt(title), isGroup ? 1 : 0, service, startAt, endAt, messageCount, participantCount, JSON.stringify(metadata))
    return id
  }

  linkConversationIdentity(conversationId, identityId) {
    this.db.prepare('INSERT OR IGNORE INTO conversation_identities(conversation_id, identity_id) VALUES (?, ?)').run(conversationId, identityId)
  }

  insertMessage({ sourceId, conversationId, externalId, senderIdentityId = null, sentAt, isFromMe = false, body = '', attachmentCount = 0, replyToExternalId = null, metadata = {} }) {
    const id = randomUUID()
    const externalKey = this.hash(`message:${externalId}`)
    this.db.prepare(`
      INSERT OR IGNORE INTO messages(id, source_id, conversation_id, external_id, sender_identity_id, sent_at, is_from_me, body_cipher, body_hash, attachment_count, reply_to_external_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, conversationId, externalKey, senderIdentityId, sentAt, isFromMe ? 1 : 0, body ? this.encrypt(body) : null, body ? this.hash(`body:${body}`) : null, attachmentCount, replyToExternalId ? this.hash(`message:${replyToExternalId}`) : null, JSON.stringify(metadata))
    return id
  }

  listIdentities() {
    return this.db.prepare(`SELECT i.*, s.type AS source_type FROM identities i JOIN sources s ON s.id=i.source_id WHERE i.is_self=0`).all().map((row) => ({
      id: row.id, sourceId: row.source_id, sourceType: row.source_type, externalId: row.external_id,
      kind: row.kind, displayName: this.decrypt(row.display_name_cipher), handle: this.decrypt(row.handle_cipher, null),
      handleHash: row.handle_hash, metadata: parseJson(row.metadata_json, {}),
    }))
  }

  createIdentityProposal({ identityIds, proposedName, strength, reasons }) {
    const sorted = [...identityIds].sort()
    const duplicate = this.db.prepare(`SELECT id FROM identity_proposals WHERE identity_ids_json = ? AND status = 'pending'`).get(JSON.stringify(sorted))
    if (duplicate) return duplicate.id
    const id = randomUUID()
    this.db.prepare(`INSERT INTO identity_proposals(id, identity_ids_json, proposed_name_cipher, strength, reason_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(
      id, JSON.stringify(sorted), this.encrypt(proposedName), strength, JSON.stringify(reasons), nowIso(),
    )
    return id
  }

  getIdentityProposals() {
    const identities = new Map(this.listIdentities().map((identity) => [identity.id, identity]))
    return this.db.prepare('SELECT * FROM identity_proposals ORDER BY created_at').all().map((row) => ({
      id: row.id,
      identityIds: parseJson(row.identity_ids_json, []),
      identities: parseJson(row.identity_ids_json, []).map((id) => identities.get(id)).filter(Boolean),
      proposedName: this.decrypt(row.proposed_name_cipher), strength: row.strength,
      reasons: parseJson(row.reason_json, []), status: row.status, createdAt: row.created_at,
    }))
  }

  decideIdentityProposal(proposalId, decision) {
    const row = this.db.prepare('SELECT * FROM identity_proposals WHERE id = ?').get(proposalId)
    if (!row) throw new Error('Identity proposal not found.')
    const ids = parseJson(row.identity_ids_json, [])
    if (decision === 'merge') {
      const placeholders = ids.map(() => '?').join(',')
      const links = this.db.prepare(`SELECT DISTINCT person_id FROM person_identities WHERE identity_id IN (${placeholders})`).all(...ids)
      const targetPersonId = links[0]?.person_id || this.createPerson({ displayName: this.decrypt(row.proposed_name_cipher) })
      for (const identityId of ids) this.linkIdentityToPerson(targetPersonId, identityId, { decision: 'user_merged', confidenceLabel: 'user_confirmed', evidence: parseJson(row.reason_json, []) })
      for (const link of links.slice(1)) {
        this.db.prepare('UPDATE OR IGNORE person_identities SET person_id = ? WHERE person_id = ?').run(targetPersonId, link.person_id)
        this.db.prepare('DELETE FROM people WHERE id = ?').run(link.person_id)
      }
    }
    this.db.prepare('UPDATE identity_proposals SET status = ?, decided_at = ? WHERE id = ?').run(decision, nowIso(), proposalId)
    return this.getIdentityProposals().find((proposal) => proposal.id === proposalId)
  }

  updatePerson(personId, changes) {
    const existing = this.db.prepare('SELECT * FROM people WHERE id = ?').get(personId)
    if (!existing) throw new Error('Person not found.')
    const value = {
      displayName: changes.displayName ?? this.decrypt(existing.display_name_cipher),
      primaryClass: changes.primaryClass ?? existing.primary_class,
      specificRelationship: changes.specificRelationship ?? existing.specific_relationship,
      socialWorlds: changes.socialWorlds ?? parseJson(existing.social_worlds_json, []),
      forms: changes.forms ?? parseJson(existing.forms_json, []),
      closeness: changes.closeness ?? existing.closeness,
      trajectory: changes.trajectory ?? existing.trajectory,
      intention: changes.intention ?? existing.intention,
      cadenceDays: changes.cadenceDays ?? existing.cadence_days,
      intentionallyQuiet: changes.intentionallyQuiet ?? Boolean(existing.intentionally_quiet),
      notes: changes.notes ?? this.decrypt(existing.notes_cipher, ''),
    }
    this.db.prepare(`
      UPDATE people SET display_name_cipher=?, primary_class=?, specific_relationship=?, social_worlds_json=?, forms_json=?, closeness=?, trajectory=?, intention=?, cadence_days=?, intentionally_quiet=?, notes_cipher=?, updated_at=? WHERE id=?
    `).run(this.encrypt(value.displayName), value.primaryClass, value.specificRelationship, JSON.stringify(value.socialWorlds), JSON.stringify(value.forms), value.closeness, value.trajectory, value.intention, value.cadenceDays, value.intentionallyQuiet ? 1 : 0, value.notes ? this.encrypt(value.notes) : null, nowIso(), personId)
    return this.getPerson(personId)
  }

  getPeople() {
    const rows = this.db.prepare(`
      SELECT p.*, COUNT(DISTINCT pi.identity_id) AS identity_count,
        COUNT(DISTINCT ci.conversation_id) AS conversation_count,
        MAX(m.sent_at) AS last_message_at,
        COUNT(DISTINCT m.id) AS message_count
      FROM people p
      LEFT JOIN person_identities pi ON pi.person_id = p.id
      LEFT JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      LEFT JOIN messages m ON m.conversation_id = ci.conversation_id
      GROUP BY p.id
      ORDER BY p.closeness, last_message_at DESC
    `).all()
    return rows.map((row) => this.personRow(row))
  }

  personRow(row) {
    const alignment = calculateCareAlignment({
      intention: row.intention, cadenceDays: row.cadence_days, lastMeaningfulAt: row.last_message_at,
      coverage: row.message_count ? 'partial' : 'none', intentionallyQuiet: Boolean(row.intentionally_quiet),
    })
    return {
      id: row.id, displayName: this.decrypt(row.display_name_cipher), primaryClass: row.primary_class,
      specificRelationship: row.specific_relationship, socialWorlds: parseJson(row.social_worlds_json, []),
      forms: parseJson(row.forms_json, []), closeness: row.closeness, trajectory: row.trajectory,
      intention: row.intention, cadenceDays: row.cadence_days, intentionallyQuiet: Boolean(row.intentionally_quiet),
      notes: this.decrypt(row.notes_cipher, ''), identityCount: Number(row.identity_count || 0),
      conversationCount: Number(row.conversation_count || 0), messageCount: Number(row.message_count || 0),
      lastMessageAt: row.last_message_at, alignment,
    }
  }

  getPerson(personId) {
    const row = this.db.prepare(`
      SELECT p.*, COUNT(DISTINCT pi.identity_id) AS identity_count,
        COUNT(DISTINCT ci.conversation_id) AS conversation_count,
        MAX(m.sent_at) AS last_message_at, COUNT(DISTINCT m.id) AS message_count
      FROM people p
      LEFT JOIN person_identities pi ON pi.person_id = p.id
      LEFT JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      LEFT JOIN messages m ON m.conversation_id = ci.conversation_id
      WHERE p.id = ? GROUP BY p.id
    `).get(personId)
    if (!row) return null
    const person = this.personRow(row)
    const messages = this.getMessagesForPerson(personId)
    const observations = this.db.prepare('SELECT * FROM observations WHERE person_id = ? ORDER BY created_at DESC').all(personId).map((item) => ({
      id: item.id, statement: this.decrypt(item.statement_cipher), construct: item.construct,
      evidenceType: item.evidence_type, evidenceRefs: parseJson(item.evidence_refs_json, []),
      timeStart: item.time_start, timeEnd: item.time_end, missing: parseJson(item.missing_json, []),
      confidence: item.confidence, alternatives: this.decryptJson(item.alternatives_cipher, []),
      userStatus: item.user_status, modelVersion: item.model_version, createdAt: item.created_at,
    }))
    const latestAnalysis = this.db.prepare(`SELECT * FROM analyses WHERE person_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1`).get(personId)
    return {
      ...person,
      signals: deriveLocalRelationshipSignals(messages),
      observations,
      portrait: latestAnalysis ? this.decryptJson(latestAnalysis.portrait_cipher, null) : null,
      analysis: latestAnalysis ? { id: latestAnalysis.id, model: latestAnalysis.model, completedAt: latestAnalysis.completed_at, usage: parseJson(latestAnalysis.usage_json, {}) } : null,
    }
  }

  getMessagesForPerson(personId, { limit = 20000 } = {}) {
    return this.db.prepare(`
      SELECT DISTINCT m.*, i.display_name_cipher AS sender_name_cipher, c.is_group, c.title_cipher
      FROM person_identities pi
      JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      JOIN messages m ON m.conversation_id = ci.conversation_id
      LEFT JOIN identities i ON i.id = m.sender_identity_id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE pi.person_id = ?
      ORDER BY m.sent_at ASC LIMIT ?
    `).all(personId, limit).map((row) => ({
      id: row.id, externalId: row.external_id, sentAt: row.sent_at, isFromMe: Boolean(row.is_from_me),
      sender: row.is_from_me ? 'Me' : this.decrypt(row.sender_name_cipher, 'Unknown'),
      body: this.decrypt(row.body_cipher, ''), attachmentCount: row.attachment_count,
      conversationId: row.conversation_id, conversationTitle: this.decrypt(row.title_cipher), isGroup: Boolean(row.is_group),
    }))
  }

  getMessageExcerpts(personId, messageIds) {
    const allowed = new Set((messageIds || []).map(String))
    if (!allowed.size) return []
    return this.getMessagesForPerson(personId).filter((message) => allowed.has(message.id)).map((message) => ({
      id: message.id,
      sentAt: message.sentAt,
      direction: message.isFromMe ? 'from_you' : 'to_you',
      context: message.isGroup ? 'group' : 'one_to_one',
      body: message.body.slice(0, 900),
      attachmentCount: message.attachmentCount,
    }))
  }

  getGroups() {
    return this.db.prepare(`
      SELECT c.*, COUNT(DISTINCT m.id) AS visible_messages, MAX(m.sent_at) AS last_message_at
      FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.is_group = 1 GROUP BY c.id ORDER BY last_message_at DESC
    `).all().map((row) => ({
      id: row.id,
      title: this.decrypt(row.title_cipher),
      service: row.service,
      messageCount: Number(row.visible_messages || row.message_count || 0),
      participantCount: Number(row.participant_count || 0),
      startAt: row.start_at,
      endAt: row.end_at || row.last_message_at,
      metadata: parseJson(row.metadata_json, {}),
    }))
  }

  saveAnalysis({ personId, model, inputCount, usage = {}, portrait, observations = [] }) {
    const id = randomUUID()
    const completedAt = nowIso()
    this.transaction(() => {
      this.db.prepare(`INSERT INTO analyses(id, person_id, status, model, input_count, usage_json, portrait_cipher, created_at, completed_at) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?)`).run(
        id, personId, model, inputCount, JSON.stringify(usage), this.encryptJson(portrait), completedAt, completedAt,
      )
      for (const observation of observations) {
        this.db.prepare(`
          INSERT INTO observations(id, person_id, statement_cipher, construct, evidence_type, evidence_refs_json, time_start, time_end, missing_json, confidence, alternatives_cipher, user_status, model_version, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?)
        `).run(randomUUID(), personId, this.encrypt(observation.statement), observation.construct, observation.evidenceType, JSON.stringify(observation.evidenceRefs || []), observation.timeStart || null, observation.timeEnd || null, JSON.stringify(observation.missing || []), observation.confidence || 'medium', this.encryptJson(observation.alternatives || []), model, completedAt)
      }
    })
    return this.getPerson(personId)
  }

  createFailedAnalysis({ personId, model, error }) {
    const id = randomUUID()
    this.db.prepare(`INSERT INTO analyses(id, person_id, status, model, error_cipher, created_at, completed_at) VALUES (?, ?, 'failed', ?, ?, ?, ?)`).run(id, personId, model, this.encrypt(String(error)), nowIso(), nowIso())
    return id
  }

  updateObservationStatus(observationId, status, correction = null) {
    const row = this.db.prepare('SELECT * FROM observations WHERE id=?').get(observationId)
    if (!row) throw new Error('Observation not found.')
    this.db.prepare('UPDATE observations SET user_status=? WHERE id=?').run(status, observationId)
    if (correction) {
      this.db.prepare(`INSERT INTO observations(id, person_id, statement_cipher, construct, evidence_type, evidence_refs_json, missing_json, confidence, alternatives_cipher, user_status, model_version, created_at) VALUES (?, ?, ?, ?, 'user_narration', '[]', '[]', 'user_confirmed', ?, 'confirmed', 'user', ?)`).run(
        randomUUID(), row.person_id, this.encrypt(correction), row.construct, this.encryptJson([]), nowIso(),
      )
    }
    return true
  }

  replaceCareActions(actions) {
    this.transaction(() => {
      this.db.exec(`DELETE FROM care_actions WHERE status='suggested'`)
      for (const action of actions) {
        this.db.prepare(`INSERT INTO care_actions(id, person_id, action_type, title_cipher, reason_cipher, minutes, energy, due_at, status, source_refs_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?)`).run(
          randomUUID(), action.personId, action.actionType, this.encrypt(action.title), this.encrypt(action.reason), action.minutes, action.energy, action.dueAt || null, JSON.stringify(action.sourceRefs || []), nowIso(),
        )
      }
    })
  }

  getCareActions() {
    return this.db.prepare(`
      SELECT ca.*, p.display_name_cipher FROM care_actions ca LEFT JOIN people p ON p.id=ca.person_id
      WHERE ca.status != 'dismissed' ORDER BY CASE ca.status WHEN 'suggested' THEN 0 ELSE 1 END, ca.due_at
    `).all().map((row) => ({
      id: row.id, personId: row.person_id, personName: this.decrypt(row.display_name_cipher, 'Relationship'),
      actionType: row.action_type, title: this.decrypt(row.title_cipher), reason: this.decrypt(row.reason_cipher),
      minutes: row.minutes, energy: row.energy, dueAt: row.due_at, status: row.status,
      sourceRefs: parseJson(row.source_refs_json, []), completedAt: row.completed_at,
    }))
  }

  updateCareAction(actionId, status) {
    this.db.prepare('UPDATE care_actions SET status=?, completed_at=? WHERE id=?').run(status, status === 'completed' ? nowIso() : null, actionId)
    return this.getCareActions().find((action) => action.id === actionId)
  }

  getBootstrap() {
    const sourceCount = Number(this.db.prepare('SELECT COUNT(*) AS value FROM sources').get().value)
    const peopleCount = Number(this.db.prepare('SELECT COUNT(*) AS value FROM people').get().value)
    const messageCount = Number(this.db.prepare('SELECT COUNT(*) AS value FROM messages').get().value)
    const analysisCount = Number(this.db.prepare(`SELECT COUNT(DISTINCT person_id) AS value FROM analyses WHERE status='completed'`).get().value)
    return {
      hasData: sourceCount > 0,
      sourceCount,
      peopleCount,
      messageCount,
      analysisCount,
      onboardingStep: this.getState('onboarding_step', sourceCount ? 'people' : 'sources'),
      onboardingComplete: Boolean(this.getState('onboarding_complete', false)),
      relationalSelf: this.getRelationalSelf(),
    }
  }

  finishOnboarding() {
    this.setState('onboarding_complete', true)
    this.setState('onboarding_step', 'atlas')
    return this.getBootstrap()
  }

  exportData() {
    return {
      exportedAt: nowIso(),
      product: 'Nearness',
      schemaVersion: 1,
      relationalSelf: this.getRelationalSelf(),
      sources: this.getSources(),
      people: this.getPeople().map((person) => this.getPerson(person.id)),
      groups: this.getGroups(),
      careActions: this.getCareActions(),
    }
  }
}

export function newMasterKey() {
  return randomBytes(32)
}
