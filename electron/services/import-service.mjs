import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, extname } from 'node:path'
import { readFile, rm, stat } from 'node:fs/promises'
import JSZip from 'jszip'
import { createReadableMessagesCopy, defaultMessagesPath, IMESSAGE_PARSER_VERSION, listIMessageChats, openMessagesDatabase, readIMessageChat } from '../parsers/imessage.mjs'
import { parseVCard } from '../parsers/vcard.mjs'
import { parseWhatsAppText } from '../parsers/whatsapp.mjs'
import { normalizeHandle } from './identity-service.mjs'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ')
}

function safeLabel(path, fallback) {
  const label = basename(path || '', extname(path || '')).replace(/^WhatsApp Chat with /i, '').replace(/^_chat$/i, '')
  return label || fallback
}

function redactPreviewBody(value) {
  return String(value || '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)/g, '[phone]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .slice(0, 120)
}

function importedArchiveHashes(source) {
  if (!source) return []
  try { return JSON.parse(source.config_json || '{}').importedArchiveHashes || [] } catch { return [] }
}

function whatsappSourceKey(parsed) {
  const participants = [...(parsed.participants || [])].map((name) => normalizeName(name).toLowerCase()).sort().join('|')
  // An extended export must retain the same source identity. The first attributable
  // event plus the participant set is stable when later messages are appended.
  const opening = (parsed.messages || []).slice(0, 1).map((message) => `${normalizeName(message.sender).toLowerCase()}|${message.body}|${message.attachmentCount}`).join('|')
  return sha256(`whatsapp|${participants}|${opening}`)
}

export class ImportService {
  constructor({ vault, identityService }) {
    this.vault = vault
    this.identityService = identityService
    this.previews = new Map()
  }

  remember(kind, payload) {
    const id = randomUUID()
    this.previews.set(id, { kind, createdAt: Date.now(), ...payload })
    this.prune()
    return id
  }

  take(id, kind) {
    const preview = this.previews.get(id)
    if (!preview || preview.kind !== kind) throw new Error('That import preview expired. Please choose the source again.')
    return preview
  }

  prune() {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const [id, preview] of this.previews) {
      if (preview.createdAt < cutoff) {
        if (preview.tempFolder) rm(preview.tempFolder, { recursive: true, force: true }).catch(() => {})
        this.previews.delete(id)
      }
    }
  }

  async dispose() {
    const folders = [...this.previews.values()].map((preview) => preview.tempFolder).filter(Boolean)
    this.previews.clear()
    await Promise.allSettled(folders.map((folder) => rm(folder, { recursive: true, force: true })))
  }

  async readWhatsAppPayload(path) {
    const raw = await readFile(path)
    return this.readWhatsAppBytes(raw, basename(path))
  }

  async readWhatsAppBytes(raw, fileName) {
    if (extname(fileName).toLowerCase() !== '.zip') return { text: raw.toString('utf8'), sourceBytes: raw, innerName: fileName }
    const zip = await JSZip.loadAsync(raw)
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.txt'))
      .sort((a, b) => Number(/_chat\.txt$/i.test(b.name)) - Number(/_chat\.txt$/i.test(a.name)) || a.name.length - b.name.length)
    if (!entries.length) throw new Error('No WhatsApp .txt export was found inside this ZIP.')
    const text = await entries[0].async('string')
    return { text, sourceBytes: raw, innerName: entries[0].name }
  }

  async previewWhatsApp(path) {
    const { text, sourceBytes, innerName } = await this.readWhatsAppPayload(path)
    const label = safeLabel(path, safeLabel(innerName, 'WhatsApp conversation'))
    return this.buildWhatsAppPreview({ text, sourceBytes, label })
  }

  async previewWhatsAppBytes({ name, bytes, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', locale = Intl.DateTimeFormat().resolvedOptions().locale || 'und' }) {
    const sourceBytes = Buffer.from(bytes)
    if (!sourceBytes.length) throw new Error('That WhatsApp export is empty.')
    if (sourceBytes.length > 250 * 1024 * 1024) throw new Error('That export is over 250 MB. Export the chat without media and try again.')
    const fileName = basename(String(name || 'WhatsApp export.txt'))
    if (!['.zip', '.txt'].includes(extname(fileName).toLowerCase())) throw new Error('Choose a WhatsApp ZIP or TXT export.')
    const payload = await this.readWhatsAppBytes(sourceBytes, fileName)
    const label = safeLabel(fileName, safeLabel(payload.innerName, 'WhatsApp conversation'))
    return this.buildWhatsAppPreview({ text: payload.text, sourceBytes: payload.sourceBytes, label, timeZone, locale })
  }

  buildWhatsAppPreview({ text, sourceBytes, label, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', locale = Intl.DateTimeFormat().resolvedOptions().locale || 'und' }) {
    const sourceHash = sha256(sourceBytes)
    const parsed = parseWhatsAppText(text, { sourceName: label, timeZone })
    if (!parsed.messages.length) throw new Error('No readable WhatsApp messages were found. Export the chat “without media” or as a ZIP/TXT and try again.')
    const firstMessage = parsed.messages[0]
    const sourceKey = whatsappSourceKey(parsed)
    const existingSource = this.vault.findSourceByKey('whatsapp', sourceKey)
      || this.vault.findWhatsAppSourceByFirstMessage(firstMessage)
      || this.vault.findSourceByHash(sourceHash)
    const previousArchiveHashes = importedArchiveHashes(existingSource)
    const duplicate = existingSource?.source_hash === sourceHash || previousArchiveHashes.includes(sourceHash)
    const previewId = this.remember('whatsapp', { label, sourceHash, sourceKey, text, parsed, locale, cancelled: false, progress: { stage: 'preview_ready', importedEvents: 0, totalEvents: parsed.messages.length } })
    return {
      previewId,
      label,
      duplicate: Boolean(duplicate),
      updatesExisting: Boolean(existingSource && !duplicate),
      dateOrder: parsed.dateOrder,
      dateOrderAmbiguous: parsed.dateOrderAmbiguous,
      dateFormatLabel: parsed.dateFormatLabel,
      timeZone: parsed.timeZone,
      locale,
      parserVersion: parsed.parserVersion,
      mediaItemCount: parsed.mediaItemCount,
      modalityCounts: parsed.modalityCounts,
      messageCount: parsed.messages.length,
      participantCount: parsed.participants.length,
      participants: parsed.participants,
      isGroup: parsed.isGroup,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      systemMessagesIgnored: parsed.systemMessages,
      rejectedLines: parsed.rejectedLines,
      sample: parsed.messages.slice(0, 3).map((message) => ({
        sentAt: message.sentAt,
        sender: message.sender,
        body: redactPreviewBody(message.body),
      })),
    }
  }

  updateWhatsAppSettings({ previewId, dateOrder, timeZone }) {
    if (!['dmy', 'mdy', 'ymd'].includes(dateOrder)) throw new Error('Choose day/month, month/day, or year/month date order.')
    if (!String(timeZone || '').trim()) throw new Error('Choose the timezone used when this export was created.')
    const preview = this.take(previewId, 'whatsapp')
    preview.parsed = parseWhatsAppText(preview.text, { sourceName: preview.label, dateOrder, timeZone })
    if (!preview.parsed.messages.length) throw new Error('No readable messages were found with that date order.')
    preview.sourceKey = whatsappSourceKey(preview.parsed)
    return {
      dateOrder: preview.parsed.dateOrder,
      dateOrderAmbiguous: false,
      dateFormatLabel: preview.parsed.dateFormatLabel,
      timeZone: preview.parsed.timeZone,
      startAt: preview.parsed.startAt,
      endAt: preview.parsed.endAt,
      rejectedLines: preview.parsed.rejectedLines,
      sample: preview.parsed.messages.slice(0, 3).map((message) => ({
        sentAt: message.sentAt,
        sender: message.sender,
        body: redactPreviewBody(message.body),
      })),
    }
  }

  updateWhatsAppDateOrder({ previewId, dateOrder, timeZone = null }) {
    const preview = this.take(previewId, 'whatsapp')
    return this.updateWhatsAppSettings({ previewId, dateOrder, timeZone: timeZone || preview.parsed.timeZone })
  }

  getImportProgress(previewId) {
    const preview = this.previews.get(previewId)
    if (!preview) throw new Error('That import preview expired. Please choose the source again.')
    return { ...preview.progress, cancelled: Boolean(preview.cancelled) }
  }

  cancelImport(previewId) {
    const preview = this.previews.get(previewId)
    if (!preview) throw new Error('That import preview expired. Please choose the source again.')
    preview.cancelled = true
    preview.progress = { ...preview.progress, stage: 'cancelling' }
    return { cancelling: true }
  }

  async discardPreview(previewId) {
    const preview = this.previews.get(previewId)
    if (!preview) return { discarded: false }
    if (preview.tempFolder) await rm(preview.tempFolder, { recursive: true, force: true })
    this.previews.delete(previewId)
    return { discarded: true }
  }

  async commitWhatsApp({ previewId, selfName, conversationTitle = null, isGroup = null }) {
    const preview = this.take(previewId, 'whatsapp')
    const existingSource = this.vault.findSourceByKey('whatsapp', preview.sourceKey)
      || this.vault.findWhatsAppSourceByFirstMessage(preview.parsed.messages[0])
      || this.vault.findSourceByHash(preview.sourceHash)
    const previousArchiveHashes = importedArchiveHashes(existingSource)
    if (existingSource?.source_hash === preview.sourceHash || previousArchiveHashes.includes(preview.sourceHash)) throw new Error('This exact WhatsApp export is already in your vault.')
    const me = normalizeName(selfName)
    if (!me || !preview.parsed.participants.some((name) => normalizeName(name).toLowerCase() === me.toLowerCase())) {
      throw new Error('Choose your own name exactly as it appears in this export.')
    }

    let createdNewSource = false
    let sourceId = null
    let conversationId = null
    let importJobId = null
    try {
      const setup = this.vault.transaction(() => {
        const sourceId = existingSource?.id || this.vault.createSource({
          type: 'whatsapp', label: preview.label, sourceHash: preview.sourceHash, sourceKey: preview.sourceKey,
          status: existingSource ? 'imported' : 'importing', startAt: preview.parsed.startAt, endAt: preview.parsed.endAt,
          config: {
            sourceFormat: 'whatsapp_export', parserVersion: preview.parsed.parserVersion,
            dateOrder: preview.parsed.dateOrder, timeZone: preview.parsed.timeZone, locale: preview.locale,
            mediaStorageMode: 'metadata_only', ignoredSystemMessages: preview.parsed.systemMessages,
            rejectedLines: preview.parsed.rejectedLines, importedArchiveHashes: [],
          },
        })
        createdNewSource = !existingSource
        const identities = new Map()
        for (const name of preview.parsed.participants) {
          const isSelf = normalizeName(name).toLowerCase() === me.toLowerCase()
          const identityId = this.vault.upsertIdentity({
            sourceId, externalId: `name:${normalizeName(name).toLowerCase()}`, kind: 'whatsapp_name',
            displayName: name, isSelf,
          })
          identities.set(name, identityId)
          if (!isSelf) this.vault.ensurePersonForIdentity(identityId)
        }
        const title = normalizeName(conversationTitle) || preview.label || preview.parsed.participants.filter((name) => name !== selfName).join(', ')
        const conversationId = this.vault.upsertConversation({
          sourceId, externalId: `whatsapp:${preview.sourceKey.slice(0, 20)}`, stableKey: `whatsapp:${preview.sourceKey}`, title,
          existingConversationId: existingSource ? this.vault.getSingleConversationIdForSource(existingSource.id, 'WhatsApp') : null,
          isGroup: typeof isGroup === 'boolean' ? isGroup : preview.parsed.isGroup, service: 'WhatsApp', startAt: preview.parsed.startAt,
          endAt: preview.parsed.endAt, messageCount: preview.parsed.messages.length,
          participantCount: preview.parsed.participants.length,
        })
        for (const identityId of identities.values()) this.vault.linkConversationIdentity(conversationId, identityId)
        const importJobId = this.vault.createImportJob({ sourceId, kind: 'whatsapp', totalEvents: preview.parsed.messages.length, stage: 'writing_encrypted_events' })
        return { sourceId, conversationId, identities, importJobId }
      })
      sourceId = setup.sourceId
      conversationId = setup.conversationId
      importJobId = setup.importJobId
      preview.progress = { stage: 'writing_encrypted_events', importedEvents: 0, totalEvents: preview.parsed.messages.length }
      const batchSize = 750
      for (let offset = 0; offset < preview.parsed.messages.length; offset += batchSize) {
        if (preview.cancelled) throw new Error('Import cancelled. No partial relationship history was kept.')
        const batch = preview.parsed.messages.slice(offset, offset + batchSize).map((message) => {
          const senderIdentityId = setup.identities.get(message.sender) || null
          return {
            sourceId, conversationId, externalId: message.id,
            eventFingerprint: sha256(`${message.sentAt}|${normalizeName(message.sender).toLowerCase()}|${message.body}|${message.attachmentCount}`), senderIdentityId,
            sentAt: message.sentAt, isFromMe: normalizeName(message.sender).toLowerCase() === me.toLowerCase(),
            body: message.body, attachmentCount: message.attachmentCount,
            modality: message.modality, mediaItems: message.mediaItems,
            forwardedStatus: message.forwardedStatus, quoteStatus: message.quoteStatus, editStatus: message.editStatus,
            parserVersion: message.parserVersion, parseWarnings: message.parseWarnings, importJobId,
          }
        })
        this.vault.transaction(() => this.vault.insertMessages(batch))
        const importedEvents = Math.min(offset + batch.length, preview.parsed.messages.length)
        preview.progress = { stage: 'writing_encrypted_events', importedEvents, totalEvents: preview.parsed.messages.length }
        this.vault.updateImportJob(importJobId, { importedEvents, stage: 'writing_encrypted_events' })
        await new Promise((resolve) => setImmediate(resolve))
      }
      if (preview.cancelled) throw new Error('Import cancelled. No partial relationship history was kept.')
      preview.progress = { ...preview.progress, stage: 'building_relationships' }
      this.vault.transaction(() => {
        this.vault.updateConversationCounts(conversationId)
        this.vault.recordSourceImport(sourceId, preview.sourceHash, {
          sourceFormat: 'whatsapp_export', parserVersion: preview.parsed.parserVersion,
          dateOrder: preview.parsed.dateOrder, timeZone: preview.parsed.timeZone, locale: preview.locale,
          mediaStorageMode: 'metadata_only', ignoredSystemMessages: preview.parsed.systemMessages,
          rejectedLines: preview.parsed.rejectedLines,
        }, preview.sourceKey)
        this.vault.updateSourceCounts(sourceId)
        this.vault.updateImportJob(importJobId, { status: 'completed', importedEvents: preview.parsed.messages.length, stage: 'completed' })
      })
      this.previews.delete(previewId)
      const proposals = this.identityService.rebuildProposals()
      return { sourceId, conversationId, proposals, bootstrap: this.vault.getBootstrap() }
    } catch (error) {
      if (createdNewSource && sourceId) this.vault.deleteSource(sourceId)
      else if (importJobId) {
        this.vault.rollbackImportJob(importJobId)
        if (conversationId) this.vault.updateConversationCounts(conversationId)
        if (sourceId) this.vault.updateSourceCounts(sourceId)
      }
      throw error
    }
  }

  async previewVCard(path) {
    const raw = await readFile(path)
    const contacts = parseVCard(raw.toString('utf8')).filter((contact) => contact.phones.length || contact.emails.length)
    if (!contacts.length) throw new Error('No contacts with a phone number or email were found in this vCard.')
    const sourceHash = sha256(raw)
    const previewId = this.remember('vcard', { path, contacts, sourceHash, label: safeLabel(path, 'Contacts') })
    return {
      previewId,
      duplicate: Boolean(this.vault.getSourceIdByHash(sourceHash)),
      contactCount: contacts.length,
      contacts: contacts.slice(0, 24).map((contact) => ({
        displayName: contact.displayName,
        phoneCount: contact.phones.length,
        emailCount: contact.emails.length,
        organization: contact.organization,
      })),
    }
  }

  commitVCard({ previewId, defaultCountry = 'AU' }) {
    const preview = this.take(previewId, 'vcard')
    if (this.vault.getSourceIdByHash(preview.sourceHash)) throw new Error('This exact contacts export is already in your vault.')
    const sourceId = this.vault.transaction(() => {
      const id = this.vault.createSource({
        type: 'contacts', label: preview.label, sourceHash: preview.sourceHash,
        status: 'imported', participantCount: preview.contacts.length,
      })
      for (const contact of preview.contacts) {
        const handles = [
          ...contact.phones.map((handle) => ({ handle: normalizeHandle(handle, defaultCountry), kind: 'phone' })),
          ...contact.emails.map((handle) => ({ handle: normalizeHandle(handle, defaultCountry), kind: 'email' })),
        ].filter((entry) => entry.handle)
        for (const [index, entry] of handles.entries()) {
          this.vault.upsertIdentity({
            sourceId: id, externalId: `${contact.id}:${entry.kind}:${index}`,
            kind: entry.kind, displayName: contact.displayName, handle: entry.handle,
            metadata: { importedFromContactCard: true },
          })
        }
      }
      this.vault.updateSourceCounts(id)
      return id
    })
    this.previews.delete(previewId)
    return { sourceId, proposals: this.identityService.rebuildProposals(), bootstrap: this.vault.getBootstrap() }
  }

  async previewIMessage(path = defaultMessagesPath(homedir())) {
    await stat(path)
    const copy = await createReadableMessagesCopy(path)
    let db
    try {
      db = openMessagesDatabase(copy.databasePath)
      const chats = listIMessageChats(db, { limit: 500 })
      const previewId = this.remember('imessage', {
        path, tempFolder: copy.folder, databasePath: copy.databasePath,
        sourceHash: sha256(`imessage:${path}`), chats, cancelled: false,
        progress: { stage: 'preview_ready', importedEvents: 0, totalEvents: 0 },
      })
      return {
        previewId,
        chatCount: chats.length,
        archivedChatCount: chats.filter((chat) => chat.isArchived).length,
        parserVersion: IMESSAGE_PARSER_VERSION,
        chats: chats.map((chat) => ({
          id: chat.id, title: chat.title, service: chat.service, isGroup: chat.isGroup,
          isArchived: chat.isArchived,
          messageCount: chat.messageCount, startAt: chat.startAt, endAt: chat.endAt,
          participantCount: chat.handles.length,
        })),
      }
    } catch (error) {
      await rm(copy.folder, { recursive: true, force: true })
      throw error
    } finally {
      db?.close()
    }
  }

  async commitIMessage({ previewId, chatIds }) {
    const preview = this.take(previewId, 'imessage')
    const selected = new Set((chatIds || []).map(String))
    if (!selected.size) throw new Error('Choose at least one Messages conversation to import.')
    let db
    let sourceId = null
    let importJobId = null
    let createdNewSource = false
    const touchedConversations = []
    try {
      db = openMessagesDatabase(preview.databasePath)
      const totalEvents = preview.chats.filter((chat) => selected.has(chat.id)).reduce((sum, chat) => sum + chat.messageCount, 0)
      const setup = this.vault.transaction(() => {
        let id = this.vault.getSourceIdByHash(preview.sourceHash)
        if (!id) {
          id = this.vault.createSource({ type: 'imessage', label: 'Messages on this Mac', sourceHash: preview.sourceHash, status: 'importing', config: { readOnlyLink: true, sourceFormat: 'apple_messages_database', parserVersion: IMESSAGE_PARSER_VERSION, mediaStorageMode: 'metadata_only', includesArchived: true } })
          createdNewSource = true
        }
        const selfIdentityId = this.vault.upsertIdentity({ sourceId: id, externalId: 'self', kind: 'imessage_self', displayName: 'Me', isSelf: true })
        const jobId = this.vault.createImportJob({ sourceId: id, kind: 'imessage', totalEvents, stage: 'reading_selected_conversations' })
        return { sourceId: id, selfIdentityId, importJobId: jobId }
      })
      sourceId = setup.sourceId
      importJobId = setup.importJobId
      preview.progress = { stage: 'reading_selected_conversations', importedEvents: 0, totalEvents }
      let importedEvents = 0
      for (const chatId of selected) {
        if (preview.cancelled) throw new Error('Import cancelled. No partial relationship history was kept.')
        const chat = readIMessageChat(db, chatId)
        const chatSetup = this.vault.transaction(() => {
          const identityMap = new Map([['self', setup.selfIdentityId]])
          for (const participant of chat.participants) {
            const normalized = normalizeHandle(participant.handle) || participant.handle
            const identityId = this.vault.upsertIdentity({
              sourceId, externalId: `handle:${normalized}`, kind: normalized.includes('@') ? 'email' : 'phone',
              displayName: participant.displayName, handle: normalized, metadata: { service: participant.service },
            })
            identityMap.set(participant.handle, identityId)
            this.vault.ensurePersonForIdentity(identityId)
          }
          if (!chat.participants.length && chat.identifier) {
            const normalized = normalizeHandle(chat.identifier) || chat.identifier
            const identityId = this.vault.upsertIdentity({
              sourceId, externalId: `handle:${normalized}`, kind: normalized.includes('@') ? 'email' : 'phone',
              displayName: chat.title, handle: normalized, metadata: { service: chat.service },
            })
            identityMap.set(chat.identifier, identityId)
            this.vault.ensurePersonForIdentity(identityId)
          }
          const conversationId = this.vault.upsertConversation({
            sourceId, externalId: chat.externalId || `chat:${chat.id}`, title: chat.title,
            isGroup: chat.isGroup, service: chat.service, participantCount: chat.participants.length,
            startAt: chat.messages[0]?.sentAt || null, endAt: chat.messages.at(-1)?.sentAt || null,
            messageCount: chat.messages.length,
          })
          touchedConversations.push(conversationId)
          this.vault.linkConversationIdentity(conversationId, setup.selfIdentityId)
          for (const identityId of identityMap.values()) this.vault.linkConversationIdentity(conversationId, identityId)
          return { identityMap, conversationId }
        })
        const batchSize = 750
        for (let offset = 0; offset < chat.messages.length; offset += batchSize) {
          if (preview.cancelled) throw new Error('Import cancelled. No partial relationship history was kept.')
          const messageRows = chat.messages.slice(offset, offset + batchSize).map((message) => {
            const senderIdentityId = message.isFromMe ? setup.selfIdentityId : (chatSetup.identityMap.get(message.senderHandle) || chatSetup.identityMap.get(chat.identifier) || null)
            return {
              sourceId, conversationId: chatSetup.conversationId, externalId: message.id, senderIdentityId,
              sentAt: message.sentAt, isFromMe: message.isFromMe, body: message.body,
              attachmentCount: message.attachmentCount, replyToExternalId: message.replyToExternalId,
              modality: message.modality, mediaItems: message.mediaItems,
              forwardedStatus: message.forwardedStatus, quoteStatus: message.quoteStatus,
              editStatus: message.editStatus, parserVersion: message.parserVersion,
              parseWarnings: message.parseWarnings, importJobId,
              metadata: { service: message.service },
            }
          })
          this.vault.transaction(() => this.vault.insertMessages(messageRows))
          importedEvents += messageRows.length
          preview.progress = { stage: 'writing_encrypted_events', importedEvents, totalEvents }
          this.vault.updateImportJob(importJobId, { importedEvents, stage: 'writing_encrypted_events' })
          await new Promise((resolve) => setImmediate(resolve))
        }
        this.vault.updateConversationCounts(chatSetup.conversationId)
      }
      this.vault.transaction(() => {
        this.vault.updateSourceCounts(sourceId)
        this.vault.setSourceStatus(sourceId, 'linked')
        this.vault.updateImportJob(importJobId, { status: 'completed', importedEvents, stage: 'completed' })
      })
      this.previews.delete(previewId)
      return { sourceId, proposals: this.identityService.rebuildProposals(), bootstrap: this.vault.getBootstrap() }
    } catch (error) {
      if (createdNewSource && sourceId) this.vault.deleteSource(sourceId)
      else if (importJobId) {
        this.vault.rollbackImportJob(importJobId)
        for (const conversationId of touchedConversations) this.vault.updateConversationCounts(conversationId)
        if (sourceId) this.vault.updateSourceCounts(sourceId)
      }
      throw error
    } finally {
      db?.close()
      await rm(preview.tempFolder, { recursive: true, force: true })
    }
  }
}
