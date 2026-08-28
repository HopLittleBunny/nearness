import { cp, mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const APPLE_EPOCH_MS = 978307200000
export const IMESSAGE_PARSER_VERSION = 'apple-messages-2.0.0'

export function appleDateToIso(value) {
  if (!value) return null
  const raw = Number(value)
  const milliseconds = raw > 1e15 ? raw / 1e6 : raw > 1e12 ? raw / 1e3 : raw * 1000
  return new Date(APPLE_EPOCH_MS + milliseconds).toISOString()
}

function plausibleText(value) {
  if (!value || value.length < 1) return false
  const control = [...value].filter((character) => character.charCodeAt(0) < 9 || (character.charCodeAt(0) > 13 && character.charCodeAt(0) < 32)).length
  return control / value.length < 0.03 && !/^(NSString|NSDictionary|NSAttributedString|__kIM)/.test(value)
}

function readTypedLength(buffer, offset) {
  const marker = buffer[offset]
  if (marker < 0x80) return { length: marker, next: offset + 1 }
  if (marker === 0x81 && offset + 2 < buffer.length) return { length: buffer.readUInt16LE(offset + 1), next: offset + 3 }
  if (marker === 0x82 && offset + 4 < buffer.length) return { length: buffer.readUInt32LE(offset + 1), next: offset + 5 }
  return null
}

export function parseAttributedBody(value) {
  if (!value) return ''
  const buffer = Buffer.from(value)
  const nsString = Buffer.from('NSString')
  let markerIndex = buffer.indexOf(nsString)
  const candidates = []

  while (markerIndex >= 0) {
    const searchEnd = Math.min(buffer.length - 2, markerIndex + 96)
    for (let index = markerIndex + nsString.length; index < searchEnd; index += 1) {
      if (![0x2a, 0x2b, 0x49, 0x4f].includes(buffer[index])) continue
      const decoded = readTypedLength(buffer, index + 1)
      if (!decoded || decoded.length < 1 || decoded.length > 200000 || decoded.next + decoded.length > buffer.length) continue
      const text = buffer.subarray(decoded.next, decoded.next + decoded.length).toString('utf8').replace(/\uFFFC/g, '').trim()
      if (plausibleText(text)) candidates.push(text)
    }
    markerIndex = buffer.indexOf(nsString, markerIndex + nsString.length)
  }

  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0]

  const readable = buffer.toString('utf8').match(/[\p{L}\p{N}\p{P}\p{Zs}\p{Extended_Pictographic}\n\r\t]{3,}/gu) || []
  return readable.filter(plausibleText).filter((item) => !/NS[A-Z]|streamtyped|iMessage/i.test(item)).sort((a, b) => b.length - a.length)[0]?.trim() || ''
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

export async function createReadableMessagesCopy(sourcePath) {
  const folder = await mkdtemp(join(tmpdir(), 'nearness-messages-'))
  const target = join(folder, basename(sourcePath))
  await cp(sourcePath, target)
  for (const suffix of ['-wal', '-shm']) {
    const adjacent = `${sourcePath}${suffix}`
    if (await exists(adjacent)) await cp(adjacent, `${target}${suffix}`)
  }
  return { folder, databasePath: target }
}

export function openMessagesDatabase(databasePath) {
  return new DatabaseSync(databasePath, { readOnly: true })
}

function allWithBigInts(db, sql, ...params) {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  return statement.all(...params)
}

export function listIMessageChats(db, { limit = 250 } = {}) {
  const rows = allWithBigInts(db, `
    SELECT
      c.ROWID AS id,
      c.guid,
      COALESCE(NULLIF(c.display_name, ''), NULLIF(c.chat_identifier, ''), 'Conversation') AS title,
      c.chat_identifier AS identifier,
      c.service_name AS service,
      COALESCE(c.is_archived, 0) AS is_archived,
      CASE WHEN c.style = 43 OR COUNT(DISTINCT chj.handle_id) > 1 THEN 1 ELSE 0 END AS is_group,
      COUNT(DISTINCT cmj.message_id) AS message_count,
      MIN(m.date) AS first_date,
      MAX(m.date) AS last_date,
      GROUP_CONCAT(DISTINCT h.id) AS handles
    FROM chat c
    JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
    JOIN message m ON m.ROWID = cmj.message_id
    LEFT JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
    LEFT JOIN handle h ON h.ROWID = chj.handle_id
    WHERE COALESCE(m.item_type, 0) = 0
    GROUP BY c.ROWID
    ORDER BY last_date DESC
    LIMIT ?
  `, limit)
  return rows.map((row) => ({
    id: String(row.id),
    externalId: row.guid,
    title: row.title,
    identifier: row.identifier,
    service: row.service || 'iMessage',
    isGroup: Boolean(row.is_group),
    isArchived: Boolean(row.is_archived),
    messageCount: Number(row.message_count),
    startAt: appleDateToIso(row.first_date),
    endAt: appleDateToIso(row.last_date),
    handles: String(row.handles || '').split(',').filter(Boolean),
  }))
}

export function readIMessageChat(db, chatId) {
  const chat = db.prepare(`
    SELECT c.ROWID AS id, c.guid, COALESCE(NULLIF(c.display_name,''), NULLIF(c.chat_identifier,''), 'Conversation') AS title,
      c.chat_identifier AS identifier, c.service_name AS service, c.style
    FROM chat c WHERE c.ROWID = ?
  `).get(Number(chatId))
  if (!chat) throw new Error('Messages conversation not found.')
  const handles = db.prepare(`
    SELECT h.ROWID AS id, h.id AS handle, h.service
    FROM chat_handle_join chj JOIN handle h ON h.ROWID = chj.handle_id
    WHERE chj.chat_id = ? ORDER BY h.ROWID
  `).all(Number(chatId))
  const rows = allWithBigInts(db, `
    SELECT m.ROWID AS id, m.guid, m.text, m.attributedBody, m.date, m.is_from_me,
      m.handle_id, h.id AS sender, m.service, m.cache_has_attachments, m.associated_message_type,
      m.reply_to_guid, m.item_type
    FROM chat_message_join cmj
    JOIN message m ON m.ROWID = cmj.message_id
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE cmj.chat_id = ? AND COALESCE(m.item_type, 0) = 0 AND COALESCE(m.associated_message_type, 0) = 0
    ORDER BY m.date ASC, m.ROWID ASC
  `, Number(chatId))
  const messages = rows.map((row) => ({
    id: String(row.guid || row.id),
    sentAt: appleDateToIso(row.date),
    sender: row.is_from_me ? 'Me' : (row.sender || chat.identifier || 'Unknown'),
    senderHandle: row.is_from_me ? 'self' : (row.sender || chat.identifier || 'unknown'),
    isFromMe: Boolean(row.is_from_me),
    body: row.text || parseAttributedBody(row.attributedBody),
    attachmentCount: Number(row.cache_has_attachments || 0),
    replyToExternalId: row.reply_to_guid || null,
    service: row.service || chat.service || 'iMessage',
    modality: row.cache_has_attachments ? 'unknown' : 'text',
    mediaItems: row.cache_has_attachments ? [{ mediaFamily: 'unknown', availabilityState: 'source_reported_only', storageMode: 'metadata_only' }] : [],
    forwardedStatus: 'metadata_unavailable',
    quoteStatus: row.reply_to_guid ? 'platform_marked_quote' : 'unavailable',
    editStatus: 'unavailable',
    parserVersion: IMESSAGE_PARSER_VERSION,
    parseWarnings: row.cache_has_attachments ? ['Messages reported an attachment; type and bytes were not copied.'] : [],
  })).filter((message) => message.sentAt && (message.body || message.attachmentCount))
  return {
    id: String(chat.id),
    externalId: chat.guid,
    title: chat.title,
    identifier: chat.identifier,
    service: chat.service || 'iMessage',
    isGroup: chat.style === 43 || handles.length > 1,
    participants: handles.map((handle) => ({ id: String(handle.id), displayName: handle.handle, handle: handle.handle, service: handle.service })),
    messages,
  }
}

export function defaultMessagesPath(homeDirectory) {
  return join(homeDirectory, 'Library', 'Messages', 'chat.db')
}
