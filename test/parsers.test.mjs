import { describe, expect, it } from 'vitest'
import { appleDateToIso, parseAttributedBody } from '../electron/parsers/imessage.mjs'
import { parseVCard } from '../electron/parsers/vcard.mjs'
import { parseWhatsAppText } from '../electron/parsers/whatsapp.mjs'

describe('WhatsApp parser', () => {
  it('parses DMY, multiline messages, media and ignores system lines', () => {
    const parsed = parseWhatsAppText(`31/12/2024, 9:04 pm - Amit: End of year\ncontinued thought\n31/12/2024, 9:06 pm - Rohan: <Media omitted>\n01/01/2025, 8:00 am - Messages are end-to-end encrypted.`)
    expect(parsed.dateOrder).toBe('dmy')
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0].body).toContain('continued thought')
    expect(parsed.messages[1].attachmentCount).toBe(1)
    expect(parsed.systemMessages).toBe(1)
    expect(parsed.participants).toEqual(['Amit', 'Rohan'])
  })

  it('infers MDY from an unambiguous date', () => {
    const parsed = parseWhatsAppText(`12/31/24, 9:04 PM - Amit: hello\n01/13/25, 7:10 AM - Maya: hi`)
    expect(parsed.dateOrder).toBe('mdy')
    expect(new Date(parsed.messages[1].sentAt).getDate()).toBe(13)
  })
})

describe('Messages parser helpers', () => {
  it('converts Apple epoch timestamps in seconds and nanoseconds', () => {
    expect(appleDateToIso(0)).toBeNull()
    expect(appleDateToIso(1)).toBe('2001-01-01T00:00:01.000Z')
    expect(appleDateToIso(1_000_000_000)).toBe('2032-09-09T01:46:40.000Z')
    expect(appleDateToIso(1_000_000_000_000_000_000)).toBe('2032-09-09T01:46:40.000Z')
  })

  it('extracts NSString payloads from attributedBody blobs', () => {
    const text = Buffer.from('A real attributed iMessage with punctuation!')
    const prefix = Buffer.concat([Buffer.from('streamtyped NSString'), Buffer.from([0x2a, text.length])])
    expect(parseAttributedBody(Buffer.concat([prefix, text]))).toBe(text.toString())
  })
})

describe('vCard parser', () => {
  it('unfolds cards and returns names, phones and emails', () => {
    const [contact] = parseVCard(`BEGIN:VCARD\nVERSION:3.0\nFN:Rohan Mehta\nTEL;TYPE=CELL:+61 400 111 222\nEMAIL;TYPE=HOME:Rohan@Example.com\nNOTE:Old school friend\nEND:VCARD`)
    expect(contact.displayName).toBe('Rohan Mehta')
    expect(contact.phones).toEqual(['+61 400 111 222'])
    expect(contact.emails).toEqual(['rohan@example.com'])
    expect(contact.note).toBe('Old school friend')
  })
})
