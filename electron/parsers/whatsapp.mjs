import { createHash } from 'node:crypto'

const DATE_PREFIX = /^\s*[\u200e\u200f]?[\[]?(\d{1,4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)[\]]?\s*(?:-\s*)?(.*)$/i

function stripMarks(value) {
  return String(value || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim()
}

function inferDateOrder(dateParts) {
  let dmy = 0
  let mdy = 0
  let ymd = 0
  for (const raw of dateParts) {
    const [a, b, c] = raw.split(/[\/\.\-]/).map(Number)
    if (a > 31) ymd += 4
    else if (a > 12) dmy += 3
    else if (b > 12) mdy += 3
    if (c > 31) { dmy += 1; mdy += 1 }
  }
  if (ymd > dmy && ymd > mdy) return { order: 'ymd', ambiguous: false }
  if (mdy > dmy) return { order: 'mdy', ambiguous: false }
  if (dmy > mdy) return { order: 'dmy', ambiguous: false }
  return { order: 'dmy', ambiguous: true }
}

function parseDate(dateText, timeText, order) {
  const [a, b, c] = dateText.split(/[\/\.\-]/).map(Number)
  let year
  let month
  let day
  if (order === 'ymd') [year, month, day] = [a, b, c]
  else if (order === 'mdy') [month, day, year] = [a, b, c]
  else [day, month, year] = [a, b, c]
  if (year < 100) year += year >= 70 ? 1900 : 2000

  const normalizedTime = timeText.toLowerCase().replace(/\./g, '')
  const match = normalizedTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] || 0)
  if (match[4] === 'pm' && hour < 12) hour += 12
  if (match[4] === 'am' && hour === 12) hour = 0
  const value = new Date(year, month - 1, day, hour, minute, second)
  if (Number.isNaN(value.getTime()) || value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null
  return value.toISOString()
}

function splitSender(payload) {
  const separator = payload.indexOf(': ')
  if (separator < 1) return { sender: null, body: payload, system: true }
  const sender = stripMarks(payload.slice(0, separator))
  if (!sender || sender.length > 160) return { sender: null, body: payload, system: true }
  return { sender, body: payload.slice(separator + 2), system: false }
}

export function parseWhatsAppText(text, { dateOrder = 'auto', sourceName = 'WhatsApp export' } = {}) {
  const cleanText = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = cleanText.split('\n')
  const candidateDates = lines.slice(0, 2500).map((line) => line.match(DATE_PREFIX)?.[1]).filter(Boolean)
  const inferred = dateOrder === 'auto' ? inferDateOrder(candidateDates) : { order: dateOrder, ambiguous: false }
  const resolvedOrder = inferred.order
  const messages = []
  let current = null
  let rejected = 0

  for (const line of lines) {
    const match = stripMarks(line).match(DATE_PREFIX)
    if (match) {
      const sentAt = parseDate(match[1], match[2], resolvedOrder)
      if (!sentAt) { rejected += 1; continue }
      const parsed = splitSender(match[3])
      current = {
        id: createHash('sha256').update(`${sourceName}|${messages.length}|${sentAt}|${parsed.sender || 'system'}|${parsed.body}`).digest('hex').slice(0, 24),
        sentAt,
        sender: parsed.sender,
        body: parsed.body,
        system: parsed.system,
        attachmentCount: /<attached:|<media omitted>|image omitted|video omitted|audio omitted|document omitted/i.test(parsed.body) ? 1 : 0,
      }
      messages.push(current)
    } else if (current) {
      current.body += `\n${line}`
    } else if (line.trim()) {
      rejected += 1
    }
  }

  const humanMessages = messages.filter((message) => !message.system && message.sender)
  const participants = [...new Set(humanMessages.map((message) => message.sender))].sort((a, b) => a.localeCompare(b))
  const dates = humanMessages.map((message) => message.sentAt).sort()
  return {
    sourceName,
    dateOrder: resolvedOrder,
    dateOrderAmbiguous: inferred.ambiguous,
    dateFormatLabel: resolvedOrder === 'mdy' ? '12/31/2025' : resolvedOrder === 'ymd' ? '2025/12/31' : '31/12/2025',
    messages: humanMessages,
    systemMessages: messages.length - humanMessages.length,
    rejectedLines: rejected,
    participants,
    isGroup: participants.length > 2,
    startAt: dates[0] || null,
    endAt: dates.at(-1) || null,
    preview: humanMessages.slice(0, 5).map((message) => ({ sentAt: message.sentAt, sender: message.sender, bodyLength: message.body.length, attachmentCount: message.attachmentCount })),
  }
}
