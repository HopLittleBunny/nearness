import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, extname } from 'node:path'
import { readFile, rm, stat } from 'node:fs/promises'
import JSZip from 'jszip'
import { createReadableMessagesCopy, defaultMessagesPath, listIMessageChats, openMessagesDatabase, readIMessageChat } from '../parsers/imessage.mjs'
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

  async previewWhatsAppBytes({ name, bytes }) {
    const sourceBytes = Buffer.from(bytes)
    if (!sourceBytes.length) throw new Error('That WhatsApp export is empty.')
    if (sourceBytes.length > 250 * 1024 * 1024) throw new Error('That export is over 250 MB. Export the chat without media and try again.')
    const fileName = basename(String(name || 'WhatsApp export.txt'))
    if (!['.zip', '.txt'].includes(extname(fileName).toLowerCase())) throw new Error('Choose a WhatsApp ZIP or TXT export.')
    const payload = await this.readWhatsAppBytes(sourceBytes, fileName)
    const label = safeLabel(fileName, safeLabel(payload.innerName, 'WhatsApp conversation'))
    return this.buildWhatsAppPreview({ text: payload.text, sourceBytes: payload.sourceBytes, label })
  }

  buildWhatsAppPreview({ text, sourceBytes, label }) {
    const sourceHash = sha256(sourceBytes)
    const parsed = parseWhatsAppText(text, { sourceName: label })
    if (!parsed.messages.length) throw new Error('No readable WhatsApp messages were found. Export the chat “without media” or as a ZIP/TXT and try again.')
    const firstMessage = parsed.messages[0]
    const sourceKey = sha256(`whatsapp|${firstMessage.sentAt}|${normalizeName(firstMessage.sender).toLowerCase()}|${firstMessage.body}|${firstMessage.attachmentCount}`)
    const existingSource = this.vault.findSourceByKey('whatsapp', sourceKey)
      || this.vault.findWhatsAppSourceByFirstMessage(firstMessage)
      || this.vault.findSourceByHash(sourceHash)
    const previousArchiveHashes = importedArchiveHashes(existingSource)
    const duplicate = existingSource?.source_hash === sourceHash || previousArchiveHashes.includes(sourceHash)
    const previewId = this.remember('whatsapp', { label, sourceHash, sourceKey, text, parsed })
    return {
      previewId,
      label,
      duplicate: Boolean(duplicate),
      updatesExisting: Boolean(existingSource && !duplicate),
      dateOrder: parsed.dateOrder,
      dateOrderAmbiguous: parsed.dateOrderAmbiguous,
      dateFormatLabel: parsed.dateFormatLabel,
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

  updateWhatsAppDateOrder({ previewId, dateOrder }) {
    if (!['dmy', 'mdy', 'ymd'].includes(dateOrder)) throw new Error('Choose day/month, month/day, or year/month date order.')
    const preview = this.take(previewId, 'whatsapp')
    preview.parsed = parseWhatsAppText(preview.text, { sourceName: preview.label, dateOrder })
    if (!preview.parsed.messages.length) throw new Error('No readable messages were found with that date order.')
    return {
      dateOrder: preview.parsed.dateOrder,
      dateOrderAmbiguous: false,
      dateFormatLabel: preview.parsed.dateFormatLabel,
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
    try {
      const setup = this.vault.transaction(() => {
        const sourceId = existingSource?.id || this.vault.createSource({
          type: 'whatsapp', label: preview.label, sourceHash: preview.sourceHash, sourceKey: preview.sourceKey,
          status: existingSource ? 'imported' : 'importing', startAt: preview.parsed.startAt, endAt: preview.parsed.endAt,
          config: { dateOrder: preview.parsed.dateOrder, ignoredSystemMessages: preview.parsed.systemMessages, importedArchiveHashes: [] },
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
          isGroup: typeof isGroup === 'boolean' ? isGroup : preview.parsed.isGroup, service: 'WhatsApp', startAt: preview.parsed.startAt,
          endAt: preview.parsed.endAt, messageCount: preview.parsed.messages.length,
          participantCount: preview.parsed.participants.length,
        })
        for (const identityId of identities.values()) this.vault.linkConversationIdentity(conversationId, identityId)
        return { sourceId, conversationId, identities }
      })
      sourceId = setup.sourceId
      conversationId = setup.conversationId
      const batchSize = 750
      for (let offset = 0; offset < preview.parsed.messages.length; offset += batchSize) {
        const batch = preview.parsed.messages.slice(offset, offset + batchSize).map((message) => {
          const senderIdentityId = setup.identities.get(message.sender) || null
          return {
            sourceId, conversationId, externalId: message.id,
            eventFingerprint: sha256(`${message.sentAt}|${normalizeName(message.sender).toLowerCase()}|${message.body}|${message.attachmentCount}`), senderIdentityId,
            sentAt: message.sentAt, isFromMe: normalizeName(message.sender).toLowerCase() === me.toLowerCase(),
            body: message.body, attachmentCount: message.attachmentCount,
          }
        })
        this.vault.transaction(() => this.vault.insertMessages(batch))
        await new Promise((resolve) => setImmediate(resolve))
      }
      this.vault.transaction(() => {
        this.vault.updateConversationCounts(conversationId)
        this.vault.recordSourceImport(sourceId, preview.sourceHash, { dateOrder: preview.parsed.dateOrder, ignoredSystemMessages: preview.parsed.systemMessages }, preview.sourceKey)
        this.vault.updateSourceCounts(sourceId)
      })
      this.previews.delete(previewId)
      const proposals = this.identityService.rebuildProposals()
      return { sourceId, conversationId, proposals, bootstrap: this.vault.getBootstrap() }
    } catch (error) {
      if (createdNewSource && sourceId) this.vault.deleteSource(sourceId)
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
        sourceHash: sha256(`imessage:${path}`), chats,
      })
      return {
        previewId,
        path,
        chatCount: chats.length,
        chats: chats.map((chat) => ({
          id: chat.id, title: chat.title, service: chat.service, isGroup: chat.isGroup,
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
    try {
      db = openMessagesDatabase(preview.databasePath)
      const sourceId = this.vault.transaction(() => {
        let id = this.vault.getSourceIdByHash(preview.sourceHash)
        if (!id) id = this.vault.createSource({ type: 'imessage', label: 'Messages on this Mac', sourceHash: preview.sourceHash, status: 'linked', config: { readOnlyLink: true } })
        const selfIdentityId = this.vault.upsertIdentity({ sourceId: id, externalId: 'self', kind: 'imessage_self', displayName: 'Me', isSelf: true })
        for (const chatId of selected) {
          const chat = readIMessageChat(db, chatId)
          const identityMap = new Map([['self', selfIdentityId]])
          for (const participant of chat.participants) {
            const normalized = normalizeHandle(participant.handle) || participant.handle
            const identityId = this.vault.upsertIdentity({
              sourceId: id, externalId: `handle:${normalized}`, kind: normalized.includes('@') ? 'email' : 'phone',
              displayName: participant.displayName, handle: normalized, metadata: { service: participant.service },
            })
            identityMap.set(participant.handle, identityId)
            this.vault.ensurePersonForIdentity(identityId)
          }
          if (!chat.participants.length && chat.identifier) {
            const normalized = normalizeHandle(chat.identifier) || chat.identifier
            const identityId = this.vault.upsertIdentity({
              sourceId: id, externalId: `handle:${normalized}`, kind: normalized.includes('@') ? 'email' : 'phone',
              displayName: chat.title, handle: normalized, metadata: { service: chat.service },
            })
            identityMap.set(chat.identifier, identityId)
            this.vault.ensurePersonForIdentity(identityId)
          }
          const conversationId = this.vault.upsertConversation({
            sourceId: id, externalId: chat.externalId || `chat:${chat.id}`, title: chat.title,
            isGroup: chat.isGroup, service: chat.service, participantCount: chat.participants.length,
            startAt: chat.messages[0]?.sentAt || null, endAt: chat.messages.at(-1)?.sentAt || null,
            messageCount: chat.messages.length,
          })
          this.vault.linkConversationIdentity(conversationId, selfIdentityId)
          for (const identityId of identityMap.values()) this.vault.linkConversationIdentity(conversationId, identityId)
          const messageRows = chat.messages.map((message) => {
            const senderIdentityId = message.isFromMe ? selfIdentityId : (identityMap.get(message.senderHandle) || identityMap.get(chat.identifier) || null)
            return {
              sourceId: id, conversationId, externalId: message.id, senderIdentityId,
              sentAt: message.sentAt, isFromMe: message.isFromMe, body: message.body,
              attachmentCount: message.attachmentCount, replyToExternalId: message.replyToExternalId,
              metadata: { service: message.service },
            }
          })
          this.vault.insertMessages(messageRows)
        }
        this.vault.updateSourceCounts(id)
        return id
      })
      this.previews.delete(previewId)
      return { sourceId, proposals: this.identityService.rebuildProposals(), bootstrap: this.vault.getBootstrap() }
    } finally {
      db?.close()
      await rm(preview.tempFolder, { recursive: true, force: true })
    }
  }
}
