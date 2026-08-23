function unfold(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '')
}

function decodeValue(value) {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

export function parseVCard(text) {
  const cards = unfold(text).split(/END:VCARD/i).map((card) => card.trim()).filter(Boolean)
  return cards.map((card, index) => {
    const lines = card.split('\n')
    const fields = {}
    for (const line of lines) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const head = line.slice(0, colon)
      const value = decodeValue(line.slice(colon + 1))
      const key = head.split(';')[0].toUpperCase()
      if (!fields[key]) fields[key] = []
      fields[key].push({ value, metadata: head.slice(key.length) })
    }
    const structured = fields.N?.[0]?.value.split(';') || []
    const displayName = fields.FN?.[0]?.value || [structured[1], structured[0]].filter(Boolean).join(' ') || `Contact ${index + 1}`
    return {
      id: fields.UID?.[0]?.value || `vcard-${index + 1}`,
      displayName,
      phones: (fields.TEL || []).map((entry) => entry.value.replace(/^tel:/i, '')),
      emails: (fields.EMAIL || []).map((entry) => entry.value.toLowerCase()),
      organization: fields.ORG?.[0]?.value || null,
      note: fields.NOTE?.[0]?.value || null,
    }
  })
}
