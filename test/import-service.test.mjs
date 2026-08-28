import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IdentityService } from '../electron/services/identity-service.mjs'
import { ImportService } from '../electron/services/import-service.mjs'
import { Vault, newMasterKey } from '../electron/services/vault.mjs'

const folders = []
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }) })

describe('WhatsApp import service', () => {
  it('previews and commits a real TXT export into the encrypted vault', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-test-'))
    folders.push(folder)
    const exportPath = join(folder, 'WhatsApp Chat with Rohan.txt')
    await writeFile(exportPath, [
      '23/08/2026, 9:04 pm - Amit: Are you free this weekend?',
      '23/08/2026, 9:07 pm - Rohan: Sunday works.',
      '24/08/2026, 8:15 am - Amit: Great, I will call tomorrow.',
    ].join('\n'))

    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const identityService = new IdentityService({ vault })
      const importer = new ImportService({ vault, identityService })
      const preview = await importer.previewWhatsApp(exportPath)

      expect(preview.messageCount).toBe(3)
      expect(preview.participants).toEqual(['Amit', 'Rohan'])
      expect(preview.duplicate).toBe(false)

      await importer.commitWhatsApp({ previewId: preview.previewId, selfName: 'Amit' })
      const bootstrap = vault.getBootstrap()
      expect(bootstrap.messageCount).toBe(3)
      expect(bootstrap.peopleCount).toBe(1)
      expect(vault.getPeople()[0].displayName).toBe('Rohan')
      expect(vault.getMessagesForPerson(vault.getPeople()[0].id)).toHaveLength(3)
    } finally {
      vault.close()
    }
  })

  it('previews renderer-supplied WhatsApp bytes without a native dialog path', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-bytes-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const preview = await importer.previewWhatsAppBytes({
        name: 'WhatsApp Chat with Rohan.txt',
        bytes: Buffer.from('23/08/2026, 9:04 pm - Amit: Hello\n23/08/2026, 9:07 pm - Rohan: Hello back'),
        timeZone: 'Australia/Perth',
        locale: 'en-AU',
      })
      expect(preview.messageCount).toBe(2)
      expect(preview.participants).toEqual(['Amit', 'Rohan'])
      expect(preview.timeZone).toBe('Australia/Perth')
      expect(preview.parserVersion).toMatch(/^whatsapp-text-/)
    } finally {
      vault.close()
    }
  })

  it('lets the user correct an ambiguous date order before committing', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-date-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const preview = await importer.previewWhatsAppBytes({
        name: 'WhatsApp Chat with Maya.txt',
        bytes: Buffer.from('03/04/2026, 9:04 pm - Amit: Hello\n03/05/2026, 9:07 pm - Maya: Hello back'),
      })
      expect(preview.dateOrderAmbiguous).toBe(true)
      const corrected = importer.updateWhatsAppDateOrder({ previewId: preview.previewId, dateOrder: 'mdy' })
      expect(corrected.dateOrderAmbiguous).toBe(false)
      expect(new Date(corrected.startAt).getMonth()).toBe(2)
      await importer.commitWhatsApp({ previewId: preview.previewId, selfName: 'Amit' })
      expect(new Date(vault.getSources()[0].startAt).getMonth()).toBe(2)
    } finally {
      vault.close()
    }
  })

  it('merges a newer export of the same chat without double-counting old messages', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-update-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const first = await importer.previewWhatsAppBytes({
        name: 'WhatsApp Chat with Rohan.txt',
        bytes: Buffer.from('23/08/2026, 9:04 pm - Amit: Hello\n23/08/2026, 9:07 pm - Rohan: Hello back'),
      })
      await importer.commitWhatsApp({ previewId: first.previewId, selfName: 'Amit' })

      const updatedBytes = Buffer.from('23/08/2026, 9:04 pm - Amit: Hello\n23/08/2026, 9:07 pm - Rohan: Hello back\n24/08/2026, 8:00 am - Amit: New message')
      const updated = await importer.previewWhatsAppBytes({ name: 'Renamed export.txt', bytes: updatedBytes })
      expect(updated.updatesExisting).toBe(true)
      expect(updated.duplicate).toBe(false)
      await importer.commitWhatsApp({ previewId: updated.previewId, selfName: 'Amit' })

      expect(vault.getSources()).toHaveLength(1)
      expect(vault.getBootstrap().messageCount).toBe(3)
      expect(vault.getSources()[0].conversationCount).toBe(1)

      const duplicate = await importer.previewWhatsAppBytes({ name: 'Another renamed export.txt', bytes: updatedBytes })
      expect(duplicate.duplicate).toBe(true)
    } finally {
      vault.close()
    }
  })

  it('allows a two-sender export to be confirmed as a group', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-group-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const preview = await importer.previewWhatsAppBytes({
        name: 'Weekend group.txt',
        bytes: Buffer.from('23/08/2026, 9:04 pm - Amit: Hello\n23/08/2026, 9:07 pm - Rohan: Hello back'),
      })
      expect(preview.isGroup).toBe(false)
      await importer.commitWhatsApp({ previewId: preview.previewId, selfName: 'Amit', isGroup: true })
      expect(vault.getGroups()).toHaveLength(1)
      expect(vault.getGroups()[0].title).toBe('Weekend group')
    } finally {
      vault.close()
    }
  })

  it('keeps imported contacts as identity references instead of flooding the atlas', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-vcard-test-'))
    folders.push(folder)
    const contactPath = join(folder, 'Contacts.vcf')
    await writeFile(contactPath, [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Rohan Mehta', 'TEL;TYPE=CELL:+61 400 111 222', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Maya Rao', 'EMAIL;TYPE=HOME:maya@example.com', 'END:VCARD',
    ].join('\n'))
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const preview = await importer.previewVCard(contactPath)
      expect(preview.contactCount).toBe(2)
      await importer.commitVCard({ previewId: preview.previewId })
      expect(vault.listIdentities()).toHaveLength(2)
      expect(vault.getPeople()).toHaveLength(0)
      expect(vault.getBootstrap().hasData).toBe(false)
    } finally {
      vault.close()
    }
  })

  it('rolls back every event when a durable import is cancelled', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'nearness-import-cancel-test-'))
    folders.push(folder)
    const vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
    try {
      const importer = new ImportService({ vault, identityService: new IdentityService({ vault }) })
      const preview = await importer.previewWhatsAppBytes({
        name: 'Cancel me.txt',
        bytes: Buffer.from('23/08/2026, 9:04 pm - Amit: Hello\n23/08/2026, 9:07 pm - Rohan: Hello back'),
      })
      importer.cancelImport(preview.previewId)
      await expect(importer.commitWhatsApp({ previewId: preview.previewId, selfName: 'Amit' })).rejects.toThrow(/cancelled/i)
      expect(vault.getBootstrap().messageCount).toBe(0)
      expect(vault.getSources()).toHaveLength(0)
      expect(vault.getPeople()).toHaveLength(0)
    } finally {
      vault.close()
    }
  })
})
