import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnalysisService } from '../electron/services/analysis-service.mjs'
import { Vault, newMasterKey } from '../electron/services/vault.mjs'

const keyFile = process.env.NEARNESS_QA_KEY_FILE
if (!keyFile) throw new Error('Set NEARNESS_QA_KEY_FILE to an env file containing OPENAI_API_KEY.')
const envText = await readFile(keyFile, 'utf8')
const keyLine = envText.split(/\r?\n/).find((line) => /^\s*(?:export\s+)?OPENAI_API_KEY\s*=/.test(line))
const apiKey = keyLine?.replace(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*/, '').replace(/^['"]|['"]$/g, '').trim()
if (!apiKey?.startsWith('sk-')) throw new Error('No usable OpenAI key was found in the founder key file.')

const folder = await mkdtemp(join(tmpdir(), 'nearness-openai-qa-'))
let vault
try {
  vault = await new Vault({ databasePath: join(folder, 'vault.sqlite'), masterKey: newMasterKey() }).open()
  const sourceId = vault.createSource({ type: 'whatsapp', label: 'Synthetic QA', sourceHash: 'openai-qa' })
  const me = vault.upsertIdentity({ sourceId, externalId: 'me', kind: 'qa', displayName: 'Me', isSelf: true })
  const other = vault.upsertIdentity({ sourceId, externalId: 'friend', kind: 'qa', displayName: 'Friend' })
  const personId = vault.ensurePersonForIdentity(other)
  vault.updatePerson(personId, { intention: 'preserve', cadenceDays: 90, forms: ['activity_led'], socialWorlds: ['school'], notes: 'Calls and cricket are important but missing.' })
  const conversationId = vault.upsertConversation({ sourceId, externalId: 'qa-chat', title: 'QA conversation', service: 'Synthetic QA' })
  vault.linkConversationIdentity(conversationId, me)
  vault.linkConversationIdentity(conversationId, other)
  const messages = [
    [other, false, '2024-01-10T08:00:00Z', 'Cricket on Sunday?'],
    [me, true, '2024-01-10T08:10:00Z', 'Yes. Same ground. Good to be back.'],
    [other, false, '2025-04-14T08:00:00Z', 'Long time. Playing when you visit?'],
    [me, true, '2025-04-14T09:00:00Z', 'Absolutely. I will call next week too.'],
    [other, false, '2026-06-20T08:00:00Z', 'Great game yesterday. Felt like old times.'],
  ]
  messages.forEach(([senderIdentityId, isFromMe, sentAt, body], index) => vault.insertMessage({ sourceId, conversationId, externalId: `qa-${index}`, senderIdentityId, sentAt, isFromMe, body }))
  const keyStore = { getOpenAiKey: async () => apiKey }
  const analysis = new AnalysisService({ vault, keyStore })
  const inspected = analysis.inspectPayload(personId)
  const result = await analysis.analyzePerson({ personId, consent: true, consentHash: inspected.payloadHash })
  process.stdout.write(JSON.stringify({ model: result.analysis?.model, portraitCreated: Boolean(result.portrait), evidenceBoundObservations: result.observations?.length || 0 }))
} finally {
  vault?.close()
  await rm(folder, { recursive: true, force: true })
}
