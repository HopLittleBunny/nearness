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
    expect(parsed.dateOrderAmbiguous).toBe(false)
  })

  it('infers MDY from an unambiguous date', () => {
    const parsed = parseWhatsAppText(`12/31/24, 9:04 PM - Amit: hello\n01/13/25, 7:10 AM - Maya: hi`)
    expect(parsed.dateOrder).toBe('mdy')
    expect(parsed.dateOrderAmbiguous).toBe(false)
    expect(new Date(parsed.messages[1].sentAt).getDate()).toBe(13)
  })

  it('flags dates that need the user to choose day-first or month-first', () => {
    const text = '03/04/2026, 9:04 pm - Amit: hello\n03/05/2026, 9:07 pm - Maya: hi'
    const automatic = parseWhatsAppText(text)
    expect(automatic.dateOrder).toBe('dmy')
    expect(automatic.dateOrderAmbiguous).toBe(true)
    expect(new Date(automatic.messages[0].sentAt).getMonth()).toBe(3)

    const monthFirst = parseWhatsAppText(text, { dateOrder: 'mdy' })
    expect(monthFirst.dateOrderAmbiguous).toBe(false)
    expect(new Date(monthFirst.messages[0].sentAt).getMonth()).toBe(2)
  })

  it('binds source-local timestamps to an explicit timezone', () => {
    const text = '31/12/2025, 11:30 pm - Amit: New year soon\n31/12/2025, 11:31 pm - Maya: Yes'
    const perth = parseWhatsAppText(text, { timeZone: 'Australia/Perth' })
    const london = parseWhatsAppText(text, { timeZone: 'Europe/London' })
    expect(perth.timeZone).toBe('Australia/Perth')
    expect(perth.messages[0].sentAt).toBe('2025-12-31T15:30:00.000Z')
    expect(london.messages[0].sentAt).toBe('2025-12-31T23:30:00.000Z')
  })

  it('keeps only media provenance metadata and never invents authorship fields', () => {
    const parsed = parseWhatsAppText('31/12/2025, 9:04 pm - Amit: IMG-2025.jpg (file attached)', { timeZone: 'UTC' })
    expect(parsed.mediaItemCount).toBe(1)
    expect(parsed.messages[0].modality).toBe('image')
    expect(parsed.messages[0].mediaItems[0]).toMatchObject({ mediaFamily: 'image', sourceReference: 'IMG-2025.jpg', storageMode: 'metadata_only' })
    expect(parsed.messages[0].forwardedStatus).toBe('metadata_unavailable')
    expect(parsed.messages[0].quoteStatus).toBe('unavailable')
    expect(parsed.messages[0].editStatus).toBe('unavailable')
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
