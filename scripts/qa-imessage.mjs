import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultMessagesPath } from '../electron/parsers/imessage.mjs'
import { IdentityService } from '../electron/services/identity-service.mjs'
import { ImportService } from '../electron/services/import-service.mjs'
import { Vault, newMasterKey } from '../electron/services/vault.mjs'

const folder = await mkdtemp(join(tmpdir(), 'nearness-imessage-qa-'))
const databasePath = join(folder, 'vault.sqlite')
let vault
try {
  vault = await new Vault({ databasePath, masterKey: newMasterKey() }).open()
  const identityService = new IdentityService({ vault })
  const importer = new ImportService({ vault, identityService })
  const preview = await importer.previewIMessage(defaultMessagesPath(process.env.HOME))
  const selected = preview.chats.map((chat) => chat.id)
  await importer.commitIMessage({ previewId: preview.previewId, chatIds: selected })
  const bootstrap = vault.getBootstrap()
  const identities = vault.listIdentities()
  vault.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const raw = await readFile(databasePath)
  const secrets = identities.flatMap((identity) => [identity.displayName, identity.handle]).filter((value) => value && value.length > 4)
  const plaintextLeaks = secrets.filter((secret) => raw.includes(Buffer.from(secret))).length
  process.stdout.write(JSON.stringify({
    discoveredChats: preview.chatCount,
    importedPeople: bootstrap.peopleCount,
    importedMessages: bootstrap.messageCount,
    plaintextIdentityLeaks: plaintextLeaks,
  }))
} finally {
  vault?.close()
  await rm(folder, { recursive: true, force: true })
}
