import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { calculateCareAlignment, defaultRelationalSelf, deriveLocalRelationshipSignals } from '../domain/framework.mjs'
import {
  DEFAULT_RELATIONSHIP_NORMS, careRecency, reflectionPromptsFor,
  summarizeCommunicationEcology,
} from '../domain/communication-ecology.mjs'

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
    this.encryptionKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'nearness:field-encryption:v2', 32))
    this.db = null
  }

  async open() {
    await mkdir(dirname(this.databasePath), { recursive: true })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;')
    this.migrate()
    this.recoverIncompleteImports()
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
        source_key TEXT,
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
        analysis_disabled INTEGER NOT NULL DEFAULT 0,
        care_disabled INTEGER NOT NULL DEFAULT 0,
        hidden_from_atlas INTEGER NOT NULL DEFAULT 0,
        relationship_stage TEXT,
        household_status TEXT,
        coparenting_status TEXT,
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
        stable_key TEXT,
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
        event_fingerprint TEXT,
        sender_identity_id TEXT REFERENCES identities(id) ON DELETE SET NULL,
        sent_at TEXT NOT NULL,
        is_from_me INTEGER NOT NULL DEFAULT 0,
        body_cipher BLOB,
        body_hash TEXT,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        reply_to_external_id TEXT,
        modality TEXT NOT NULL DEFAULT 'text',
        forwarded_status TEXT NOT NULL DEFAULT 'metadata_unavailable',
        quote_status TEXT NOT NULL DEFAULT 'unavailable',
        edit_status TEXT NOT NULL DEFAULT 'unavailable',
        parser_version TEXT,
        parse_warnings_json TEXT NOT NULL DEFAULT '[]',
        import_job_id TEXT,
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
        analysis_id TEXT REFERENCES analyses(id) ON DELETE CASCADE,
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
        created_at TEXT NOT NULL,
        superseded_at TEXT
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
        consent_receipt_id TEXT,
        payload_hash TEXT,
        superseded_at TEXT,
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
      CREATE TABLE IF NOT EXISTS source_import_jobs (
        id TEXT PRIMARY KEY,
        source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        total_events INTEGER NOT NULL DEFAULT 0,
        imported_events INTEGER NOT NULL DEFAULT 0,
        stage TEXT NOT NULL,
        error_cipher BLOB,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS media_items (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        source_media_id TEXT,
        mime_type TEXT,
        media_family TEXT NOT NULL DEFAULT 'unknown',
        size_bytes INTEGER,
        width INTEGER,
        height INTEGER,
        duration_ms INTEGER,
        content_hash TEXT,
        availability_state TEXT NOT NULL DEFAULT 'source_reported_only',
        storage_mode TEXT NOT NULL DEFAULT 'metadata_only',
        source_reference_cipher BLOB,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS interaction_episodes (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
        structure TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        event_ids_json TEXT NOT NULL,
        initiated_by TEXT,
        modality_mix_json TEXT NOT NULL DEFAULT '{}',
        substantive INTEGER NOT NULL DEFAULT 0,
        algorithm_version TEXT NOT NULL,
        derived_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS manual_interactions (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        occurred_at TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        meaningful INTEGER NOT NULL DEFAULT 0,
        title_cipher BLOB,
        notes_cipher BLOB,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relationship_roles (
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY(person_id, role)
      );
      CREATE TABLE IF NOT EXISTS relationship_norms (
        person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
        norms_cipher BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS symbolic_meanings (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        symbol_cipher BLOB NOT NULL,
        meaning_cipher BLOB NOT NULL,
        applies_from TEXT,
        applies_to TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assessment_snapshots (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        snapshot_cipher BLOB NOT NULL,
        inputs_json TEXT NOT NULL DEFAULT '{}',
        algorithm_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        superseded_at TEXT
      );
      CREATE TABLE IF NOT EXISTS consent_receipts (
        id TEXT PRIMARY KEY,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        operation TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        response_storage_disabled INTEGER NOT NULL DEFAULT 1,
        retention_disclosure_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processing_runs (
        id TEXT PRIMARY KEY,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        consent_receipt_id TEXT REFERENCES consent_receipts(id) ON DELETE SET NULL,
        model TEXT,
        input_count INTEGER NOT NULL DEFAULT 0,
        output_count INTEGER NOT NULL DEFAULT 0,
        error_cipher BLOB,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details_cipher BLOB,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_date ON messages(conversation_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_date ON messages(sender_identity_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_person_identities_identity ON person_identities(identity_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_person_identity_unique ON person_identities(identity_id);
      CREATE INDEX IF NOT EXISTS idx_observations_person ON observations(person_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_care_actions_status ON care_actions(status, due_at);
      CREATE INDEX IF NOT EXISTS idx_manual_interactions_person_date ON manual_interactions(person_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_person_date ON interaction_episodes(person_id, end_at);
      CREATE INDEX IF NOT EXISTS idx_assessments_person_kind ON assessment_snapshots(person_id, kind, created_at);
      CREATE INDEX IF NOT EXISTS idx_processing_person_date ON processing_runs(person_id, started_at);
    `)
    const schemaVersion = Number(this.db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get()?.value || 0)
    if (schemaVersion < 2) {
      const ensureColumn = (table, column, definition) => {
        const present = this.db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)
        if (!present) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
      ensureColumn('sources', 'source_key', 'TEXT')
      ensureColumn('conversations', 'stable_key', 'TEXT')
      ensureColumn('messages', 'event_fingerprint', 'TEXT')
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_type_key ON sources(type, source_key) WHERE source_key IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_service_key ON conversations(service, stable_key) WHERE stable_key IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_fingerprint ON messages(conversation_id, event_fingerprint) WHERE event_fingerprint IS NOT NULL;
      `)
      this.db.prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)').run('schema_version', '2')
    }
    if (schemaVersion < 3) {
      const ensureColumn = (table, column, definition) => {
        const present = this.db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column)
        if (!present) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
      ensureColumn('people', 'analysis_disabled', 'INTEGER NOT NULL DEFAULT 0')
      ensureColumn('people', 'care_disabled', 'INTEGER NOT NULL DEFAULT 0')
      ensureColumn('people', 'hidden_from_atlas', 'INTEGER NOT NULL DEFAULT 0')
      ensureColumn('people', 'relationship_stage', 'TEXT')
      ensureColumn('people', 'household_status', 'TEXT')
      ensureColumn('people', 'coparenting_status', 'TEXT')
      ensureColumn('messages', 'modality', "TEXT NOT NULL DEFAULT 'text'")
      ensureColumn('messages', 'forwarded_status', "TEXT NOT NULL DEFAULT 'metadata_unavailable'")
      ensureColumn('messages', 'quote_status', "TEXT NOT NULL DEFAULT 'unavailable'")
      ensureColumn('messages', 'edit_status', "TEXT NOT NULL DEFAULT 'unavailable'")
      ensureColumn('messages', 'parser_version', 'TEXT')
      ensureColumn('messages', 'parse_warnings_json', "TEXT NOT NULL DEFAULT '[]'")
      ensureColumn('messages', 'import_job_id', 'TEXT')
      ensureColumn('observations', 'analysis_id', 'TEXT')
      ensureColumn('observations', 'superseded_at', 'TEXT')
      ensureColumn('analyses', 'consent_receipt_id', 'TEXT')
      ensureColumn('analyses', 'payload_hash', 'TEXT')
      ensureColumn('analyses', 'superseded_at', 'TEXT')
      this.db.prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)').run('schema_version', '3')
    }
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
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([Buffer.from([2]), iv, tag, encrypted])
  }

  decrypt(value, fallback = '') {
    if (value == null) return fallback
    try {
      const buffer = Buffer.from(value)
      if (![1, 2].includes(buffer[0])) throw new Error('Unsupported encrypted field version.')
      const iv = buffer.subarray(1, 13)
      const tag = buffer.subarray(13, 29)
      const decipher = createDecipheriv('aes-256-gcm', buffer[0] === 1 ? this.masterKey : this.encryptionKey, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(buffer.subarray(29)), decipher.final()]).toString('utf8')
    } catch (error) {
      throw new Error(`Nearness detected damaged encrypted data. Restore a known-good export or remove the affected source. (${error.message})`)
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

  recordAudit(action, { entityType = null, entityId = null, details = {} } = {}) {
    const id = randomUUID()
    this.db.prepare('INSERT INTO audit_events(id, action, entity_type, entity_id, details_cipher, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, action, entityType, entityId, this.encryptJson(details), nowIso(),
    )
    return id
  }

  getAuditEvents({ limit = 200 } = {}) {
    return this.db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 200, 1000))).map((row) => ({
      id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id,
      details: this.decryptJson(row.details_cipher, {}), createdAt: row.created_at,
    }))
  }

  createImportJob({ sourceId, kind, totalEvents = 0, stage = 'importing' }) {
    const id = randomUUID()
    this.db.prepare('INSERT INTO source_import_jobs(id, source_id, kind, status, total_events, imported_events, stage, started_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(
      id, sourceId, kind, 'importing', Number(totalEvents || 0), stage, nowIso(),
    )
    return id
  }

  updateImportJob(jobId, { status = 'importing', importedEvents = null, stage = null, error = null } = {}) {
    const row = this.db.prepare('SELECT * FROM source_import_jobs WHERE id = ?').get(jobId)
    if (!row) throw new Error('Import job not found.')
    const completedAt = ['completed', 'cancelled', 'failed', 'rolled_back'].includes(status) ? nowIso() : null
    this.db.prepare('UPDATE source_import_jobs SET status=?, imported_events=?, stage=?, error_cipher=?, completed_at=? WHERE id=?').run(
      status,
      importedEvents == null ? row.imported_events : Number(importedEvents),
      stage || row.stage,
      error ? this.encrypt(error) : row.error_cipher,
      completedAt || row.completed_at,
      jobId,
    )
    return this.getImportJob(jobId)
  }

  getImportJob(jobId) {
    const row = this.db.prepare('SELECT * FROM source_import_jobs WHERE id = ?').get(jobId)
    if (!row) return null
    return {
      id: row.id, sourceId: row.source_id, kind: row.kind, status: row.status,
      totalEvents: Number(row.total_events), importedEvents: Number(row.imported_events),
      stage: row.stage, error: this.decrypt(row.error_cipher, null),
      startedAt: row.started_at, completedAt: row.completed_at,
    }
  }

  recoverIncompleteImports() {
    const jobs = this.db.prepare("SELECT * FROM source_import_jobs WHERE status = 'importing'").all()
    for (const job of jobs) {
      const source = this.db.prepare('SELECT id, status FROM sources WHERE id = ?').get(job.source_id)
      this.transaction(() => {
        if (source?.status === 'importing') {
          this.db.prepare('DELETE FROM sources WHERE id = ?').run(source.id)
          this.db.exec('DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM person_identities)')
        } else {
          this.db.prepare('DELETE FROM messages WHERE import_job_id = ?').run(job.id)
          this.updateImportJob(job.id, { status: 'rolled_back', stage: 'recovered_after_interruption', error: 'Nearness rolled back an interrupted import during startup.' })
          if (source) this.updateSourceCounts(source.id)
        }
      })
      this.recordAudit('interrupted_import_recovered', { entityType: 'source', entityId: job.source_id, details: { jobId: job.id, kind: job.kind } })
    }
  }

  rollbackImportJob(jobId) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM messages WHERE import_job_id = ?').run(jobId)
      this.updateImportJob(jobId, { status: 'rolled_back', stage: 'rolled_back' })
    })
  }

  findSourceByHash(sourceHash) {
    return this.db.prepare('SELECT id FROM sources WHERE source_hash = ?').get(sourceHash) || null
  }

  getSourceIdByHash(sourceHash) {
    return this.findSourceByHash(sourceHash)?.id || null
  }

  findSourceByKey(type, sourceKey) {
    if (!sourceKey) return null
    return this.db.prepare('SELECT * FROM sources WHERE type = ? AND source_key = ?').get(type, this.hash(`source-key:${sourceKey}`)) || null
  }

  findWhatsAppSourceByFirstMessage({ sentAt, body }) {
    if (!sentAt) return null
    return this.db.prepare(`
      SELECT s.* FROM sources s
      JOIN messages m ON m.source_id = s.id
      WHERE s.type = 'whatsapp' AND m.sent_at = ? AND m.body_hash = ?
      LIMIT 1
    `).get(sentAt, body ? this.hash(`body:${body}`) : null) || null
  }

  createSource({ type, label, sourceHash, sourceKey = null, status = 'imported', messageCount = 0, conversationCount = 0, participantCount = 0, startAt = null, endAt = null, config = {} }) {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO sources(id, type, label_cipher, source_hash, source_key, imported_at, status, message_count, conversation_count, participant_count, start_at, end_at, config_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, this.encrypt(label), sourceHash, sourceKey ? this.hash(`source-key:${sourceKey}`) : null, nowIso(), status, messageCount, conversationCount, participantCount, startAt, endAt, JSON.stringify(config))
    return id
  }

  recordSourceImport(sourceId, archiveHash, configPatch = {}, sourceKey = null) {
    const row = this.db.prepare('SELECT config_json FROM sources WHERE id = ?').get(sourceId)
    if (!row) throw new Error('Source not found.')
    const current = parseJson(row.config_json, {})
    const importedArchiveHashes = [...new Set([...(current.importedArchiveHashes || []), archiveHash].filter(Boolean))]
    const hashedSourceKey = sourceKey ? this.hash(`source-key:${sourceKey}`) : null
    this.db.prepare("UPDATE sources SET config_json = ?, imported_at = ?, source_key = CASE WHEN ? IS NULL THEN source_key ELSE ? END, status = 'imported' WHERE id = ?").run(
      JSON.stringify({ ...current, ...configPatch, importedArchiveHashes }), nowIso(), hashedSourceKey, hashedSourceKey, sourceId,
    )
  }

  getSources() {
    return this.db.prepare('SELECT * FROM sources ORDER BY imported_at DESC').all().map((row) => ({
      id: row.id, type: row.type, label: this.decrypt(row.label_cipher), importedAt: row.imported_at,
      status: row.status, messageCount: row.message_count, conversationCount: row.conversation_count,
      participantCount: row.participant_count, startAt: row.start_at, endAt: row.end_at,
      config: parseJson(row.config_json, {}),
    }))
  }

  setSourceStatus(sourceId, status) {
    this.db.prepare('UPDATE sources SET status = ? WHERE id = ?').run(status, sourceId)
  }

  deleteSource(sourceId) {
    const source = this.db.prepare('SELECT id FROM sources WHERE id = ?').get(sourceId)
    if (!source) throw new Error('Source not found.')
    this.transaction(() => {
      this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId)
      this.db.exec(`DELETE FROM people WHERE id NOT IN (SELECT DISTINCT person_id FROM person_identities)`)
    })
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;')
    this.recordAudit('source_deleted', { entityType: 'source', entityId: sourceId })
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

  getSingleConversationIdForSource(sourceId, service) {
    const candidates = this.db.prepare('SELECT id FROM conversations WHERE source_id = ? AND service = ? LIMIT 2').all(sourceId, service)
    return candidates.length === 1 ? candidates[0].id : null
  }

  upsertConversation({ sourceId, externalId, stableKey = null, existingConversationId = null, title, isGroup = false, service, startAt = null, endAt = null, messageCount = 0, participantCount = 0, metadata = {} }) {
    const externalKey = this.hash(`conversation:${externalId}`)
    const hashedStableKey = stableKey ? this.hash(`conversation-key:${stableKey}`) : null
    const existing = existingConversationId
      ? this.db.prepare('SELECT id FROM conversations WHERE id = ? AND source_id = ?').get(existingConversationId, sourceId)
      : hashedStableKey
      ? this.db.prepare('SELECT id FROM conversations WHERE service = ? AND stable_key = ?').get(service, hashedStableKey)
      : this.db.prepare('SELECT id FROM conversations WHERE source_id = ? AND external_id = ?').get(sourceId, externalKey)
    if (existing) {
      this.db.prepare(`UPDATE conversations SET stable_key=COALESCE(?, stable_key), title_cipher=?, is_group=?, start_at=CASE WHEN start_at IS NULL OR ? < start_at THEN ? ELSE start_at END, end_at=CASE WHEN end_at IS NULL OR ? > end_at THEN ? ELSE end_at END, participant_count=MAX(participant_count, ?) WHERE id=?`).run(
        hashedStableKey, this.encrypt(title), isGroup ? 1 : 0, startAt, startAt, endAt, endAt, participantCount, existing.id,
      )
      return existing.id
    }
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO conversations(id, source_id, external_id, stable_key, title_cipher, is_group, service, start_at, end_at, message_count, participant_count, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, externalKey, hashedStableKey, this.encrypt(title), isGroup ? 1 : 0, service, startAt, endAt, messageCount, participantCount, JSON.stringify(metadata))
    return id
  }

  updateConversationCounts(conversationId) {
    const stats = this.db.prepare('SELECT COUNT(*) AS message_count, MIN(sent_at) AS start_at, MAX(sent_at) AS end_at FROM messages WHERE conversation_id = ?').get(conversationId)
    this.db.prepare('UPDATE conversations SET message_count=?, start_at=?, end_at=? WHERE id=?').run(stats.message_count, stats.start_at, stats.end_at, conversationId)
  }

  linkConversationIdentity(conversationId, identityId) {
    this.db.prepare('INSERT OR IGNORE INTO conversation_identities(conversation_id, identity_id) VALUES (?, ?)').run(conversationId, identityId)
  }

  insertMessage({ sourceId, conversationId, externalId, eventFingerprint = null, senderIdentityId = null, sentAt, isFromMe = false, body = '', attachmentCount = 0, replyToExternalId = null, modality = null, forwardedStatus = 'metadata_unavailable', quoteStatus = 'unavailable', editStatus = 'unavailable', parserVersion = null, parseWarnings = [], importJobId = null, mediaItems = [], metadata = {} }) {
    return this.insertMessages([{ sourceId, conversationId, externalId, eventFingerprint, senderIdentityId, sentAt, isFromMe, body, attachmentCount, replyToExternalId, modality, forwardedStatus, quoteStatus, editStatus, parserVersion, parseWarnings, importJobId, mediaItems, metadata }])[0]
  }

  insertMessages(messages) {
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO messages(id, source_id, conversation_id, external_id, event_fingerprint, sender_identity_id, sent_at, is_from_me, body_cipher, body_hash, attachment_count, reply_to_external_id, modality, forwarded_status, quote_status, edit_status, parser_version, parse_warnings_json, import_job_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const mediaStatement = this.db.prepare(`
      INSERT INTO media_items(id, message_id, source_media_id, mime_type, media_family, size_bytes, width, height, duration_ms, content_hash, availability_state, storage_mode, source_reference_cipher, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const ids = []
    for (const { sourceId, conversationId, externalId, eventFingerprint = null, senderIdentityId = null, sentAt, isFromMe = false, body = '', attachmentCount = 0, replyToExternalId = null, modality = null, forwardedStatus = 'metadata_unavailable', quoteStatus = 'unavailable', editStatus = 'unavailable', parserVersion = null, parseWarnings = [], importJobId = null, mediaItems = [], metadata = {} } of messages) {
      const id = randomUUID()
      const externalKey = this.hash(`message:${externalId}`)
      const resolvedModality = modality || (attachmentCount ? 'unknown' : 'text')
      const result = statement.run(id, sourceId, conversationId, externalKey, eventFingerprint ? this.hash(`event:${eventFingerprint}`) : null, senderIdentityId, sentAt, isFromMe ? 1 : 0, body ? this.encrypt(body) : null, body ? this.hash(`body:${body}`) : null, attachmentCount, replyToExternalId ? this.hash(`message:${replyToExternalId}`) : null, resolvedModality, forwardedStatus, quoteStatus, editStatus, parserVersion, JSON.stringify(parseWarnings || []), importJobId, JSON.stringify(metadata))
      if (result.changes) {
        const items = mediaItems.length ? mediaItems : Array.from({ length: Number(attachmentCount || 0) }, (_, index) => ({ sourceMediaId: `${externalId}:attachment:${index}`, mediaFamily: resolvedModality === 'text' ? 'unknown' : resolvedModality }))
        for (const item of items) mediaStatement.run(
          randomUUID(), id, item.sourceMediaId || null, item.mimeType || null, item.mediaFamily || 'unknown',
          item.sizeBytes || null, item.width || null, item.height || null, item.durationMs || null,
          item.contentHash || null, item.availabilityState || 'source_reported_only', item.storageMode || 'metadata_only',
          item.sourceReference ? this.encrypt(item.sourceReference) : null, nowIso(),
        )
      }
      ids.push(id)
    }
    return ids
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

  getRelationshipRoles(personId) {
    return this.db.prepare('SELECT role, is_primary FROM relationship_roles WHERE person_id = ? ORDER BY is_primary DESC, role').all(personId).map((row) => ({ role: row.role, isPrimary: Boolean(row.is_primary) }))
  }

  replaceRelationshipRoles(personId, roles = [], primaryRole = null) {
    const unique = [...new Set((roles || []).map(String).map((value) => value.trim()).filter(Boolean))]
    this.transaction(() => {
      this.db.prepare('DELETE FROM relationship_roles WHERE person_id = ?').run(personId)
      const statement = this.db.prepare('INSERT INTO relationship_roles(person_id, role, is_primary, created_at) VALUES (?, ?, ?, ?)')
      for (const role of unique) statement.run(personId, role, role === primaryRole ? 1 : 0, nowIso())
    })
    return this.getRelationshipRoles(personId)
  }

  getRelationshipNorms(personId) {
    const row = this.db.prepare('SELECT norms_cipher FROM relationship_norms WHERE person_id = ?').get(personId)
    return { ...DEFAULT_RELATIONSHIP_NORMS, ...(row ? this.decryptJson(row.norms_cipher, {}) : {}) }
  }

  saveRelationshipNorms(personId, norms = {}) {
    const value = { ...DEFAULT_RELATIONSHIP_NORMS, ...norms }
    this.db.prepare('INSERT OR REPLACE INTO relationship_norms(person_id, norms_cipher, updated_at) VALUES (?, ?, ?)').run(personId, this.encryptJson(value), nowIso())
    this.recordAudit('relationship_norms_updated', { entityType: 'person', entityId: personId, details: { fields: Object.keys(norms) } })
    return value
  }

  getSymbolicMeanings(personId) {
    return this.db.prepare('SELECT * FROM symbolic_meanings WHERE person_id = ? ORDER BY created_at DESC').all(personId).map((row) => ({
      id: row.id, symbol: this.decrypt(row.symbol_cipher), meaning: this.decrypt(row.meaning_cipher),
      appliesFrom: row.applies_from, appliesTo: row.applies_to, createdAt: row.created_at,
    }))
  }

  addSymbolicMeaning(personId, { symbol, meaning, appliesFrom = null, appliesTo = null }) {
    if (!String(symbol || '').trim() || !String(meaning || '').trim()) throw new Error('Add both the symbol and what it means in this relationship.')
    const id = randomUUID()
    this.db.prepare('INSERT INTO symbolic_meanings(id, person_id, symbol_cipher, meaning_cipher, applies_from, applies_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, personId, this.encrypt(String(symbol).trim()), this.encrypt(String(meaning).trim()), appliesFrom || null, appliesTo || null, nowIso(),
    )
    this.recordAudit('symbolic_meaning_added', { entityType: 'person', entityId: personId, details: { symbolicMeaningId: id } })
    return this.getSymbolicMeanings(personId)
  }

  deleteSymbolicMeaning(personId, meaningId) {
    this.db.prepare('DELETE FROM symbolic_meanings WHERE id = ? AND person_id = ?').run(meaningId, personId)
    this.recordAudit('symbolic_meaning_deleted', { entityType: 'person', entityId: personId, details: { symbolicMeaningId: meaningId } })
    return this.getSymbolicMeanings(personId)
  }

  getManualInteractions(personId) {
    return this.db.prepare('SELECT * FROM manual_interactions WHERE person_id = ? ORDER BY occurred_at DESC').all(personId).map((row) => ({
      id: row.id, occurredAt: row.occurred_at, interactionType: row.interaction_type,
      meaningful: Boolean(row.meaningful), title: this.decrypt(row.title_cipher, ''),
      notes: this.decrypt(row.notes_cipher, ''), createdAt: row.created_at,
    }))
  }

  addManualInteraction(personId, { occurredAt, interactionType, meaningful = false, title = '', notes = '' }) {
    const timestamp = new Date(occurredAt)
    if (Number.isNaN(timestamp.getTime())) throw new Error('Choose a valid date for this offline moment.')
    const id = randomUUID()
    this.db.prepare('INSERT INTO manual_interactions(id, person_id, occurred_at, interaction_type, meaningful, title_cipher, notes_cipher, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, personId, timestamp.toISOString(), interactionType, meaningful ? 1 : 0,
      title ? this.encrypt(String(title).trim()) : null, notes ? this.encrypt(String(notes).trim()) : null, nowIso(),
    )
    this.recordAudit('manual_interaction_added', { entityType: 'person', entityId: personId, details: { manualInteractionId: id, interactionType, meaningful: Boolean(meaningful) } })
    return this.getManualInteractions(personId)
  }

  deleteManualInteraction(personId, interactionId) {
    this.db.prepare('DELETE FROM manual_interactions WHERE id = ? AND person_id = ?').run(interactionId, personId)
    this.recordAudit('manual_interaction_deleted', { entityType: 'person', entityId: personId, details: { manualInteractionId: interactionId } })
    return this.getManualInteractions(personId)
  }

  replaceInteractionEpisodes(personId, episodes = []) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM interaction_episodes WHERE person_id = ?').run(personId)
      const statement = this.db.prepare(`
        INSERT INTO interaction_episodes(id, person_id, conversation_id, structure, start_at, end_at, event_ids_json, initiated_by, modality_mix_json, substantive, algorithm_version, derived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const episode of episodes) statement.run(
        randomUUID(), personId, episode.conversationId || null, episode.structure, episode.startAt, episode.endAt,
        JSON.stringify(episode.eventIds || []), episode.initiatedBy || null, JSON.stringify(episode.modalities || {}),
        episode.substantive ? 1 : 0, episode.algorithmVersion, nowIso(),
      )
    })
    return episodes
  }

  rebuildInteractionEpisodes(personId) {
    const ecology = summarizeCommunicationEcology(this.getMessagesForPerson(personId), this.getManualInteractions(personId))
    this.replaceInteractionEpisodes(personId, ecology.episodes)
    return ecology
  }

  getMediaItemsForPerson(personId) {
    return this.db.prepare(`
      SELECT mi.*, m.sent_at, c.is_group
      FROM person_identities pi
      JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      JOIN messages m ON m.conversation_id = ci.conversation_id
      JOIN conversations c ON c.id = m.conversation_id
      JOIN media_items mi ON mi.message_id = m.id
      WHERE pi.person_id = ? AND (c.is_group = 0 OR m.sender_identity_id = pi.identity_id)
      ORDER BY m.sent_at
    `).all(personId).map((row) => ({
      id: row.id, messageId: row.message_id, occurredAt: row.sent_at, mediaFamily: row.media_family,
      mimeType: row.mime_type, sizeBytes: row.size_bytes, durationMs: row.duration_ms,
      availabilityState: row.availability_state, storageMode: row.storage_mode,
      sourceReference: this.decrypt(row.source_reference_cipher, ''), isGroup: Boolean(row.is_group),
    }))
  }

  saveAssessmentSnapshot(personId, kind, snapshot, { inputs = {}, algorithmVersion = 'user-report-1.0.0' } = {}) {
    const id = randomUUID()
    const createdAt = nowIso()
    this.transaction(() => {
      this.db.prepare('UPDATE assessment_snapshots SET superseded_at = ? WHERE person_id = ? AND kind = ? AND superseded_at IS NULL').run(createdAt, personId, kind)
      this.db.prepare('INSERT INTO assessment_snapshots(id, person_id, kind, snapshot_cipher, inputs_json, algorithm_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, personId, kind, this.encryptJson(snapshot), JSON.stringify(inputs), algorithmVersion, createdAt,
      )
    })
    this.recordAudit('assessment_snapshot_saved', { entityType: 'person', entityId: personId, details: { assessmentId: id, kind, algorithmVersion } })
    return this.getLatestAssessment(personId, kind)
  }

  getLatestAssessment(personId, kind) {
    const row = this.db.prepare('SELECT * FROM assessment_snapshots WHERE person_id = ? AND kind = ? AND superseded_at IS NULL ORDER BY created_at DESC LIMIT 1').get(personId, kind)
    return row ? {
      id: row.id, kind: row.kind, snapshot: this.decryptJson(row.snapshot_cipher, {}),
      inputs: parseJson(row.inputs_json, {}), algorithmVersion: row.algorithm_version, createdAt: row.created_at,
    } : null
  }

  createConsentReceipt({ personId, operation, payloadHash, provider, model, endpoint, retentionDisclosureVersion }) {
    const id = randomUUID()
    this.db.prepare(`
      INSERT INTO consent_receipts(id, person_id, operation, payload_hash, provider, model, endpoint, response_storage_disabled, retention_disclosure_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, personId || null, operation, payloadHash, provider, model, endpoint, retentionDisclosureVersion, nowIso())
    this.recordAudit('consent_recorded', { entityType: personId ? 'person' : null, entityId: personId || null, details: { consentReceiptId: id, operation, payloadHash, provider, model, endpoint, retentionDisclosureVersion } })
    return id
  }

  createProcessingRun({ personId, operation, consentReceiptId = null, model = null, inputCount = 0 }) {
    const id = randomUUID()
    this.db.prepare('INSERT INTO processing_runs(id, person_id, operation, status, consent_receipt_id, model, input_count, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, personId || null, operation, 'running', consentReceiptId, model, Number(inputCount || 0), nowIso(),
    )
    return id
  }

  completeProcessingRun(runId, { status = 'completed', outputCount = 0, error = null } = {}) {
    this.db.prepare('UPDATE processing_runs SET status=?, output_count=?, error_cipher=?, completed_at=? WHERE id=?').run(
      status, Number(outputCount || 0), error ? this.encrypt(error) : null, nowIso(), runId,
    )
  }

  getProcessingHistory({ limit = 100 } = {}) {
    return this.db.prepare(`
      SELECT pr.*, cr.payload_hash, cr.provider, cr.endpoint, cr.response_storage_disabled, cr.retention_disclosure_version
      FROM processing_runs pr LEFT JOIN consent_receipts cr ON cr.id = pr.consent_receipt_id
      ORDER BY pr.started_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(Number(limit) || 100, 500))).map((row) => ({
      id: row.id, personId: row.person_id, operation: row.operation, status: row.status,
      model: row.model, inputCount: Number(row.input_count), outputCount: Number(row.output_count),
      error: this.decrypt(row.error_cipher, null), startedAt: row.started_at, completedAt: row.completed_at,
      consent: row.consent_receipt_id ? {
        receiptId: row.consent_receipt_id, payloadHash: row.payload_hash, provider: row.provider,
        endpoint: row.endpoint, responseStorageDisabled: Boolean(row.response_storage_disabled),
        retentionDisclosureVersion: row.retention_disclosure_version,
      } : null,
    }))
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
      analysisDisabled: changes.analysisDisabled ?? Boolean(existing.analysis_disabled),
      careDisabled: changes.careDisabled ?? Boolean(existing.care_disabled),
      hiddenFromAtlas: changes.hiddenFromAtlas ?? Boolean(existing.hidden_from_atlas),
      relationshipStage: changes.relationshipStage ?? existing.relationship_stage,
      householdStatus: changes.householdStatus ?? existing.household_status,
      coparentingStatus: changes.coparentingStatus ?? existing.coparenting_status,
      notes: changes.notes ?? this.decrypt(existing.notes_cipher, ''),
    }
    this.db.prepare(`
      UPDATE people SET display_name_cipher=?, primary_class=?, specific_relationship=?, social_worlds_json=?, forms_json=?, closeness=?, trajectory=?, intention=?, cadence_days=?, intentionally_quiet=?, analysis_disabled=?, care_disabled=?, hidden_from_atlas=?, relationship_stage=?, household_status=?, coparenting_status=?, notes_cipher=?, updated_at=? WHERE id=?
    `).run(this.encrypt(value.displayName), value.primaryClass, value.specificRelationship, JSON.stringify(value.socialWorlds), JSON.stringify(value.forms), value.closeness, value.trajectory, value.intention, value.cadenceDays, value.intentionallyQuiet ? 1 : 0, value.analysisDisabled ? 1 : 0, value.careDisabled ? 1 : 0, value.hiddenFromAtlas ? 1 : 0, value.relationshipStage || null, value.householdStatus || null, value.coparentingStatus || null, value.notes ? this.encrypt(value.notes) : null, nowIso(), personId)
    if (Array.isArray(changes.roles)) this.replaceRelationshipRoles(personId, changes.roles, changes.primaryRole || changes.roles[0] || null)
    if (changes.norms && typeof changes.norms === 'object') this.saveRelationshipNorms(personId, changes.norms)
    this.recordAudit('relationship_context_updated', { entityType: 'person', entityId: personId, details: { fields: Object.keys(changes) } })
    return this.getPerson(personId)
  }

  getPeople() {
    const rows = this.db.prepare(`
      SELECT p.*, COUNT(DISTINCT pi.identity_id) AS identity_count,
        COUNT(DISTINCT ci.conversation_id) AS conversation_count,
        MAX(CASE WHEN c.is_group = 0 THEN m.sent_at END) AS last_message_at,
        MAX(CASE WHEN c.is_group = 0 OR m.sender_identity_id = pi.identity_id THEN m.sent_at END) AS last_visible_at,
        COUNT(DISTINCT CASE WHEN c.is_group = 0 OR m.sender_identity_id = pi.identity_id THEN m.id END) AS message_count
      FROM people p
      LEFT JOIN person_identities pi ON pi.person_id = p.id
      LEFT JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      LEFT JOIN conversations c ON c.id = ci.conversation_id
      LEFT JOIN messages m ON m.conversation_id = ci.conversation_id
      GROUP BY p.id
      ORDER BY p.closeness, last_message_at DESC
    `).all()
    return rows.map((row) => this.personRow(row))
  }

  personRow(row) {
    const roles = this.getRelationshipRoles(row.id)
    const meaningful = this.db.prepare('SELECT MAX(occurred_at) AS value FROM manual_interactions WHERE person_id = ? AND meaningful = 1').get(row.id)?.value || null
    const recency = meaningful
      ? { occurredAt: meaningful, authority: 'user_confirmed_meaningful' }
      : row.last_message_at
        ? { occurredAt: row.last_message_at, authority: 'interaction_episode' }
        : row.last_visible_at
          ? { occurredAt: row.last_visible_at, authority: 'visible_touch_only' }
          : { occurredAt: null, authority: 'needs_context' }
    const alignment = calculateCareAlignment({
      intention: row.intention, cadenceDays: row.cadence_days, lastContactAt: recency.occurredAt,
      recencyAuthority: recency.authority, coverage: row.message_count ? 'partial' : 'none',
      intentionallyQuiet: Boolean(row.intentionally_quiet), careDisabled: Boolean(row.care_disabled),
    })
    return {
      id: row.id, displayName: this.decrypt(row.display_name_cipher), primaryClass: row.primary_class,
      specificRelationship: row.specific_relationship, socialWorlds: parseJson(row.social_worlds_json, []),
      forms: parseJson(row.forms_json, []), closeness: row.closeness, trajectory: row.trajectory,
      intention: row.intention, cadenceDays: row.cadence_days, intentionallyQuiet: Boolean(row.intentionally_quiet),
      analysisDisabled: Boolean(row.analysis_disabled), careDisabled: Boolean(row.care_disabled),
      hiddenFromAtlas: Boolean(row.hidden_from_atlas), relationshipStage: row.relationship_stage,
      householdStatus: row.household_status, coparentingStatus: row.coparenting_status,
      roles: roles.map((item) => item.role), primaryRole: roles.find((item) => item.isPrimary)?.role || roles[0]?.role || null,
      norms: this.getRelationshipNorms(row.id),
      notes: this.decrypt(row.notes_cipher, ''), identityCount: Number(row.identity_count || 0),
      conversationCount: Number(row.conversation_count || 0), messageCount: Number(row.message_count || 0),
      lastMessageAt: row.last_message_at, lastVisibleAt: row.last_visible_at, recency, alignment,
    }
  }

  getPerson(personId) {
    const row = this.db.prepare(`
      SELECT p.*, COUNT(DISTINCT pi.identity_id) AS identity_count,
        COUNT(DISTINCT ci.conversation_id) AS conversation_count,
        MAX(CASE WHEN c.is_group = 0 THEN m.sent_at END) AS last_message_at,
        MAX(CASE WHEN c.is_group = 0 OR m.sender_identity_id = pi.identity_id THEN m.sent_at END) AS last_visible_at,
        COUNT(DISTINCT CASE WHEN c.is_group = 0 OR m.sender_identity_id = pi.identity_id THEN m.id END) AS message_count
      FROM people p
      LEFT JOIN person_identities pi ON pi.person_id = p.id
      LEFT JOIN conversation_identities ci ON ci.identity_id = pi.identity_id
      LEFT JOIN conversations c ON c.id = ci.conversation_id
      LEFT JOIN messages m ON m.conversation_id = ci.conversation_id
      WHERE p.id = ? GROUP BY p.id
    `).get(personId)
    if (!row) return null
    const person = this.personRow(row)
    const messages = this.getMessagesForPerson(personId)
    const directMessages = messages.filter((message) => !message.isGroup)
    const manualInteractions = this.getManualInteractions(personId)
    const communicationEcology = summarizeCommunicationEcology(messages, manualInteractions)
    const recency = careRecency(communicationEcology)
    const alignment = calculateCareAlignment({
      intention: person.intention, cadenceDays: person.cadenceDays, lastContactAt: recency.occurredAt,
      recencyAuthority: recency.authority, coverage: messages.length ? 'partial' : manualInteractions.length ? 'offline_only' : 'none',
      intentionallyQuiet: person.intentionallyQuiet, careDisabled: person.careDisabled,
    })
    const observations = this.db.prepare('SELECT * FROM observations WHERE person_id = ? AND superseded_at IS NULL ORDER BY created_at DESC').all(personId).map((item) => ({
      id: item.id, statement: this.decrypt(item.statement_cipher), construct: item.construct,
      evidenceType: item.evidence_type, evidenceRefs: parseJson(item.evidence_refs_json, []),
      timeStart: item.time_start, timeEnd: item.time_end, missing: parseJson(item.missing_json, []),
      confidence: item.confidence, alternatives: this.decryptJson(item.alternatives_cipher, []),
      userStatus: item.user_status, modelVersion: item.model_version, createdAt: item.created_at,
    }))
    const latestAnalysis = this.db.prepare(`SELECT * FROM analyses WHERE person_id=? AND status='completed' AND superseded_at IS NULL ORDER BY completed_at DESC LIMIT 1`).get(personId)
    return {
      ...person,
      recency,
      alignment,
      signals: { ...deriveLocalRelationshipSignals(directMessages), groupAuthoredMessageCount: messages.length - directMessages.length },
      communicationEcology,
      manualInteractions,
      symbolicMeanings: this.getSymbolicMeanings(personId),
      reflectionPrompts: reflectionPromptsFor(person),
      experienceProfile: this.getLatestAssessment(personId, 'relationship_experience_profile'),
      expressionMatch: this.getLatestAssessment(personId, 'expression_match'),
      mediaItems: this.getMediaItemsForPerson(personId),
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
        AND (c.is_group = 0 OR m.sender_identity_id = pi.identity_id)
      ORDER BY m.sent_at ASC LIMIT ?
    `).all(personId, limit).map((row) => ({
      id: row.id, externalId: row.external_id, sentAt: row.sent_at, isFromMe: Boolean(row.is_from_me),
      sender: row.is_from_me ? 'Me' : this.decrypt(row.sender_name_cipher, 'Unknown'),
      body: this.decrypt(row.body_cipher, ''), attachmentCount: row.attachment_count,
      conversationId: row.conversation_id, conversationTitle: this.decrypt(row.title_cipher), isGroup: Boolean(row.is_group),
      evidenceScope: row.is_group ? 'person_in_group' : 'direct_dyadic',
      modality: row.modality || (row.attachment_count ? 'unknown' : 'text'), forwardedStatus: row.forwarded_status,
      quoteStatus: row.quote_status, editStatus: row.edit_status, parserVersion: row.parser_version,
      parseWarnings: parseJson(row.parse_warnings_json, []),
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

  saveAnalysis({ personId, model, inputCount, usage = {}, portrait, observations = [], consentReceiptId = null, payloadHash = null }) {
    const id = randomUUID()
    const completedAt = nowIso()
    this.transaction(() => {
      this.db.prepare(`UPDATE analyses SET superseded_at=? WHERE person_id=? AND status='completed' AND superseded_at IS NULL`).run(completedAt, personId)
      this.db.prepare(`UPDATE observations SET superseded_at=? WHERE person_id=? AND evidence_type='model_inference' AND superseded_at IS NULL`).run(completedAt, personId)
      this.db.prepare(`INSERT INTO analyses(id, person_id, status, model, input_count, usage_json, portrait_cipher, consent_receipt_id, payload_hash, created_at, completed_at) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, personId, model, inputCount, JSON.stringify(usage), this.encryptJson(portrait), consentReceiptId, payloadHash, completedAt, completedAt,
      )
      const rejected = this.db.prepare(`SELECT statement_cipher, construct FROM observations WHERE person_id=? AND user_status='rejected'`).all(personId).map((row) => `${row.construct}|${this.decrypt(row.statement_cipher).toLowerCase().replace(/\s+/g, ' ').trim()}`)
      const rejectedKeys = new Set(rejected)
      for (const observation of observations) {
        const key = `${observation.construct}|${String(observation.statement || '').toLowerCase().replace(/\s+/g, ' ').trim()}`
        if (rejectedKeys.has(key)) continue
        this.db.prepare(`
          INSERT INTO observations(id, analysis_id, person_id, statement_cipher, construct, evidence_type, evidence_refs_json, time_start, time_end, missing_json, confidence, alternatives_cipher, user_status, model_version, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?, ?)
        `).run(randomUUID(), id, personId, this.encrypt(observation.statement), observation.construct, observation.evidenceType, JSON.stringify(observation.evidenceRefs || []), observation.timeStart || null, observation.timeEnd || null, JSON.stringify(observation.missing || []), observation.confidence || 'medium', this.encryptJson(observation.alternatives || []), model, completedAt)
      }
    })
    this.recordAudit('analysis_saved', { entityType: 'person', entityId: personId, details: { analysisId: id, consentReceiptId, payloadHash, model, inputCount } })
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
      // A contacts file is supporting identity data, not a relationship history.
      // Keep onboarding in the empty state until there is something the atlas can show.
      hasData: messageCount > 0 || peopleCount > 0,
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
      schemaVersion: 3,
      relationalSelf: this.getRelationalSelf(),
      sources: this.getSources(),
      people: this.getPeople().map((person) => this.getPerson(person.id)),
      groups: this.getGroups(),
      careActions: this.getCareActions(),
      processingHistory: this.getProcessingHistory({ limit: 1000 }),
      auditHistory: this.getAuditEvents({ limit: 1000 }),
    }
  }
}

export function newMasterKey() {
  return randomBytes(32)
}
