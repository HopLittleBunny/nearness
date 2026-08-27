import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { writeFile } from 'node:fs/promises'

function presentError(error) {
  const message = String(error?.message || error || 'Something went wrong.')
  if (/operation not permitted|SQLITE_CANTOPEN|authorization denied/i.test(message)) {
    return new Error('Nearness cannot read Messages yet. In System Settings → Privacy & Security → Full Disk Access, allow Nearness, then reopen the app.')
  }
  if (/insufficient_quota|billing|quota/i.test(message)) return new Error('The OpenAI account for this key has no available API credit. Add billing or use another key.')
  if (/invalid_api_key|incorrect api key|401/i.test(message)) return new Error('That OpenAI API key was rejected. Replace it in Privacy & AI.')
  if (/model.*not found|does not exist/i.test(message)) return new Error('The configured analysis model is not available to this OpenAI project yet.')
  return new Error(message)
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await fn(event, ...args) } catch (error) { throw presentError(error) }
  })
}

async function chooseFile(event, options) {
  const parent = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions = { properties: ['openFile'], ...options }
  const result = parent
    ? await dialog.showOpenDialog(parent, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  return result.canceled ? null : result.filePaths[0]
}

export function registerIpc(runtime) {
  handle('app:bootstrap', async () => ({
    ...runtime.vault.getBootstrap(),
    sources: runtime.vault.getSources(),
    people: runtime.vault.getPeople(),
    groups: runtime.vault.getGroups(),
    proposals: runtime.vault.getIdentityProposals(),
    care: runtime.vault.getCareActions(),
    keyConfigured: await runtime.keyStore.hasOpenAiKey(),
    platform: process.platform,
  }))
  handle('app:finishOnboarding', () => runtime.vault.finishOnboarding())

  handle('import:previewWhatsApp', async (event) => {
    const path = await chooseFile(event, { title: 'Choose a WhatsApp export', filters: [{ name: 'WhatsApp export', extensions: ['zip', 'txt'] }] })
    return path ? runtime.importService.previewWhatsApp(path) : null
  })
  handle('import:previewWhatsAppBytes', (_, input) => runtime.importService.previewWhatsAppBytes(input))
  handle('import:updateWhatsAppDateOrder', (_, input) => runtime.importService.updateWhatsAppDateOrder(input))
  handle('import:commitWhatsApp', (_, input) => runtime.importService.commitWhatsApp(input))
  handle('import:previewVCard', async (event) => {
    const path = await chooseFile(event, { title: 'Choose a contacts export', filters: [{ name: 'vCard contacts', extensions: ['vcf', 'vcard'] }] })
    return path ? runtime.importService.previewVCard(path) : null
  })
  handle('import:commitVCard', (_, input) => runtime.importService.commitVCard(input))
  handle('import:previewIMessage', (_, path) => runtime.importService.previewIMessage(path || undefined))
  handle('import:commitIMessage', (_, input) => runtime.importService.commitIMessage(input))

  handle('sources:list', () => runtime.vault.getSources())
  handle('sources:delete', (_, sourceId) => runtime.vault.deleteSource(sourceId))
  handle('people:list', () => runtime.vault.getPeople())
  handle('people:get', (_, personId) => runtime.vault.getPerson(personId))
  handle('people:update', (_, personId, changes) => {
    const person = runtime.vault.updatePerson(personId, changes)
    runtime.careEngine.rebuild()
    return person
  })
  handle('groups:list', () => runtime.vault.getGroups())
  handle('identity:listProposals', () => runtime.vault.getIdentityProposals())
  handle('identity:decide', (_, proposalId, decision) => runtime.vault.decideIdentityProposal(proposalId, decision))
  handle('profile:get', () => runtime.vault.getRelationalSelf())
  handle('profile:save', (_, profile) => {
    const saved = runtime.vault.saveRelationalSelf(profile)
    runtime.careEngine.rebuild()
    return saved
  })

  handle('analysis:keyStatus', async () => ({ configured: await runtime.keyStore.hasOpenAiKey(), model: runtime.analysisService.model }))
  handle('analysis:saveKey', (_, key) => runtime.keyStore.saveOpenAiKey(key))
  handle('analysis:testKey', () => runtime.analysisService.testKey())
  handle('analysis:inspect', (_, personId) => runtime.analysisService.inspectPayload(personId))
  handle('analysis:run', (_, input) => runtime.analysisService.analyzePerson(input))
  handle('analysis:ask', (_, input) => runtime.analysisService.askPerson(input))
  handle('analysis:observationStatus', (_, observationId, status, correction) => runtime.vault.updateObservationStatus(observationId, status, correction))
  handle('analysis:evidence', (_, personId, messageIds) => runtime.vault.getMessageExcerpts(personId, messageIds))

  handle('care:list', () => runtime.vault.getCareActions())
  handle('care:rebuild', () => runtime.careEngine.rebuild())
  handle('care:update', (_, actionId, status) => runtime.vault.updateCareAction(actionId, status))

  handle('privacy:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export your Nearness archive',
      defaultPath: `Nearness archive ${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON archive', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, JSON.stringify(runtime.vault.exportData(), null, 2), { mode: 0o600 })
    return { saved: true, path: result.filePath }
  })
  handle('privacy:deleteAll', async (_, confirmation) => {
    if (confirmation !== 'DELETE MY NEARNESS VAULT') throw new Error('The confirmation phrase did not match.')
    await runtime.resetVault()
    return { deleted: true }
  })
  handle('privacy:openFullDiskAccess', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'))
}
