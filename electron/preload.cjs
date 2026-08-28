const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('nearness', Object.freeze({
  bootstrap: () => invoke('app:bootstrap'),
  finishOnboarding: () => invoke('app:finishOnboarding'),
  import: Object.freeze({
    previewWhatsApp: () => invoke('import:previewWhatsApp'),
    previewWhatsAppBytes: (input) => invoke('import:previewWhatsAppBytes', input),
    updateWhatsAppDateOrder: (input) => invoke('import:updateWhatsAppDateOrder', input),
    updateWhatsAppSettings: (input) => invoke('import:updateWhatsAppSettings', input),
    progress: (previewId) => invoke('import:progress', previewId),
    cancel: (previewId) => invoke('import:cancel', previewId),
    discard: (previewId) => invoke('import:discard', previewId),
    commitWhatsApp: (input) => invoke('import:commitWhatsApp', input),
    previewVCard: () => invoke('import:previewVCard'),
    commitVCard: (input) => invoke('import:commitVCard', input),
    previewIMessage: () => invoke('import:previewIMessage'),
    commitIMessage: (input) => invoke('import:commitIMessage', input),
  }),
  sources: Object.freeze({
    list: () => invoke('sources:list'),
    delete: (sourceId) => invoke('sources:delete', sourceId),
  }),
  people: Object.freeze({
    list: () => invoke('people:list'),
    get: (personId) => invoke('people:get', personId),
    update: (personId, changes) => invoke('people:update', personId, changes),
    addManualInteraction: (personId, input) => invoke('people:addManualInteraction', personId, input),
    deleteManualInteraction: (personId, interactionId) => invoke('people:deleteManualInteraction', personId, interactionId),
    addSymbolicMeaning: (personId, input) => invoke('people:addSymbolicMeaning', personId, input),
    deleteSymbolicMeaning: (personId, meaningId) => invoke('people:deleteSymbolicMeaning', personId, meaningId),
    saveAssessment: (personId, kind, snapshot) => invoke('people:saveAssessment', personId, kind, snapshot),
  }),
  groups: Object.freeze({ list: () => invoke('groups:list') }),
  identity: Object.freeze({
    listProposals: () => invoke('identity:listProposals'),
    decide: (proposalId, decision) => invoke('identity:decide', proposalId, decision),
  }),
  profile: Object.freeze({
    get: () => invoke('profile:get'),
    save: (profile) => invoke('profile:save', profile),
  }),
  analysis: Object.freeze({
    keyStatus: () => invoke('analysis:keyStatus'),
    saveKey: (key) => invoke('analysis:saveKey', key),
    testKey: () => invoke('analysis:testKey'),
    inspect: (personId, selection = {}) => invoke('analysis:inspect', { personId, selection }),
    run: (input) => invoke('analysis:run', input),
    observationStatus: (observationId, status, correction) => invoke('analysis:observationStatus', observationId, status, correction),
    evidence: (personId, messageIds) => invoke('analysis:evidence', personId, messageIds),
  }),
  care: Object.freeze({
    list: () => invoke('care:list'),
    rebuild: () => invoke('care:rebuild'),
    update: (actionId, status) => invoke('care:update', actionId, status),
  }),
  privacy: Object.freeze({
    export: () => invoke('privacy:export'),
    deleteAll: (confirmation) => invoke('privacy:deleteAll', confirmation),
    deleteOpenAiKey: () => invoke('privacy:deleteOpenAiKey'),
    processingHistory: () => invoke('privacy:processingHistory'),
    auditHistory: () => invoke('privacy:auditHistory'),
    openFullDiskAccess: () => invoke('privacy:openFullDiskAccess'),
  }),
}))
