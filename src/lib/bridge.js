const now = new Date()
const daysAgo = (days) => new Date(now.getTime() - days * 86400000).toISOString()

const demoPeople = [
  { id: 'rohan', displayName: 'Rohan', primaryClass: 'friendship', specificRelationship: 'old friend', socialWorlds: ['school', 'sports'], forms: ['activity_led', 'long_distance'], closeness: 'inner', trajectory: 'quiet_but_intact', intention: 'preserve', cadenceDays: 120, intentionallyQuiet: false, identityCount: 2, conversationCount: 3, messageCount: 1824, lastMessageAt: daysAgo(71), alignment: { state: 'aligned', reason: 'Visible care broadly matches the rhythm you chose.' } },
  { id: 'maya', displayName: 'Maya', primaryClass: 'kin_family', specificRelationship: 'sibling', socialWorlds: ['family'], forms: ['practical_support_led'], closeness: 'essential', trajectory: 'steady', intention: 'preserve', cadenceDays: 14, intentionallyQuiet: false, identityCount: 2, conversationCount: 2, messageCount: 2810, lastMessageAt: daysAgo(2), alignment: { state: 'aligned', reason: 'Visible care broadly matches the rhythm you chose.' } },
  { id: 'aisha', displayName: 'Aisha', primaryClass: 'chosen_family', specificRelationship: 'chosen family', socialWorlds: ['university', 'personal'], forms: ['disclosure_led', 'bridge'], closeness: 'essential', trajectory: 'deepening', intention: 'deepen', cadenceDays: 21, intentionallyQuiet: false, identityCount: 1, conversationCount: 2, messageCount: 1620, lastMessageAt: daysAgo(9), alignment: { state: 'aligned', reason: 'Visible care broadly matches the rhythm you chose.' } },
  { id: 'dev', displayName: 'Dev', primaryClass: 'friendship', specificRelationship: 'work friend', socialWorlds: ['professional', 'personal'], forms: ['mentor'], closeness: 'active', trajectory: 'changing_form', intention: 'deepen', cadenceDays: 45, intentionallyQuiet: false, identityCount: 2, conversationCount: 1, messageCount: 734, lastMessageAt: daysAgo(64), alignment: { state: 'mostly_aligned', reason: 'There is minor drift from the rhythm you chose.' } },
  { id: 'neha', displayName: 'Neha', primaryClass: 'friendship', specificRelationship: 'university friend', socialWorlds: ['university'], forms: ['group_carried', 'long_distance'], closeness: 'inner', trajectory: 'cyclical', intention: 'revive', cadenceDays: 90, intentionallyQuiet: false, identityCount: 1, conversationCount: 2, messageCount: 906, lastMessageAt: daysAgo(142), alignment: { state: 'under_invested', reason: 'Visible care is below the rhythm you chose; check missing channels before acting.' } },
  { id: 'elena', displayName: 'Elena', primaryClass: 'friendship', specificRelationship: 'former colleague', socialWorlds: ['professional'], forms: ['bridge'], closeness: 'wider_world', trajectory: 'resting', intention: 'rest', cadenceDays: null, intentionallyQuiet: true, identityCount: 1, conversationCount: 1, messageCount: 388, lastMessageAt: daysAgo(221), alignment: { state: 'intentionally_quiet', reason: 'The current intention does not ask for more contact.' } },
]

const demoProfile = {
  displayName: 'Amit', currentChapter: 'Building a life in Perth', weeklyMinutes: 75, energy: 'moderate',
  closenessLanguage: { showing_up: 5, practical_help: 5, continuity_despite_silence: 5, humour: 4, shared_activity: 3, emotional_disclosure: 3, frequent_contact: 2, family_inclusion: 3, honest_challenge: 3, celebration: 3 },
  communication: { text: true, voice_note: true, phone: true, video: false, in_person: true, groups: true, planned: true, spontaneous: false },
  norms: { silenceCanBeComfortable: true, practicalHelpSignalsCare: true, groupInclusionSignalsCare: true, directConflictStyle: null, notes: '' },
  networkIntentions: ['protect_old_friendships', 'build_local_community', 'reduce_guilt'],
}

const detail = (person) => ({
  ...person,
  notes: '',
  signals: { coverage: 'longitudinal', messageCount: person.messageCount, activeMonths: 74, firstAt: daysAgo(2200), lastAt: person.lastMessageAt, medianGapDays: 2.8, longestGapDays: 119, recentEpisodeCount: 4, initiatedByUserShare: .48, attachmentShare: .08, openLoopCandidates: [] },
  portrait: { headline: 'A relationship with its own rhythm.', essence: 'The visible messages show recurring contact, with some periods carrying more conversation than others. Add what happens in calls and in person before treating the pattern as the whole relationship.', story: 'This synthetic preview demonstrates the shape of a Nearness portrait. In a real vault, every observation is derived from the selected person’s imported history and kept separate from what you tell Nearness.', relationshipForms: person.forms || [], socialWorlds: person.socialWorlds || [], trajectory: person.trajectory, coverageCaveat: 'This is synthetic preview data; no personal history was analysed.' },
  observations: [{ id: `preview-${person.id}`, statement: 'This observation is synthetic preview copy, included only to demonstrate evidence review.', construct: 'coverage', evidenceType: 'synthetic_preview', evidenceRefs: ['preview-message'], confidence: 'low', missing: ['real imported history'], alternatives: ['Import a conversation to replace this preview.'], userStatus: 'unreviewed' }],
})

export function createDemoBridge() {
  const previewMode = new URLSearchParams(window.location.search).has('demo')
  let onboardingComplete = previewMode
  let people = demoPeople.map((person) => ({ ...person }))
  let profile = structuredClone(demoProfile)
  const sources = [
    { id: 's1', type: 'whatsapp', label: 'WhatsApp exports', messageCount: 6217, conversationCount: 7, participantCount: 12, startAt: daysAgo(2500), endAt: daysAgo(2), status: 'imported', importedAt: daysAgo(1) },
    { id: 's2', type: 'imessage', label: 'Messages on this Mac', messageCount: 249, conversationCount: 28, participantCount: 30, startAt: daysAgo(420), endAt: daysAgo(3), status: 'linked', importedAt: daysAgo(1) },
  ]
  let care = [{ id: 'c1', personId: 'neha', personName: 'Neha', actionType: 'message', title: 'Write to Neha', reason: 'Visible care is below the rhythm you chose; check missing channels before acting. This follows your revive intention.', minutes: 4, energy: 'low', dueAt: daysAgo(-4), status: 'suggested' }]
  const bootstrap = () => previewMode
    ? { hasData: true, onboardingComplete, sourceCount: sources.length, peopleCount: people.length, messageCount: 6466, analysisCount: 1, sources, people, groups: [{ id: 'g1', title: 'Sunday cricket', service: 'WhatsApp', messageCount: 1180, participantCount: 9, startAt: daysAgo(900), endAt: daysAgo(2) }], proposals: [], care, relationalSelf: profile, keyConfigured: true, platform: 'darwin', interfacePreview: true }
    : { hasData: false, onboardingComplete, sourceCount: 0, peopleCount: 0, messageCount: 0, analysisCount: 0, sources: [], people: [], groups: [], proposals: [], care: [], relationalSelf: profile, keyConfigured: false, platform: 'darwin', interfacePreview: true }
  return {
    bootstrap: async () => bootstrap(), finishOnboarding: async () => { onboardingComplete = true; return bootstrap() },
    import: { previewWhatsApp: async () => { throw new Error('File import is available in the Nearness desktop app.') }, previewWhatsAppBytes: async () => { throw new Error('File import is available in the Nearness desktop app.') }, updateWhatsAppDateOrder: async () => { throw new Error('File import is available in the Nearness desktop app.') }, previewVCard: async () => { throw new Error('File import is available in the Nearness desktop app.') }, previewIMessage: async () => { throw new Error('Messages linking is available in the Nearness desktop app.') } },
    sources: { list: async () => sources, delete: async () => bootstrap() },
    people: { list: async () => people, get: async (id) => detail(people.find((person) => person.id === id)), update: async (id, changes) => { people = people.map((person) => person.id === id ? { ...person, ...changes } : person); return detail(people.find((person) => person.id === id)) } },
    groups: { list: async () => bootstrap().groups },
    identity: { listProposals: async () => [], decide: async () => null },
    profile: { get: async () => profile, save: async (value) => { profile = { ...profile, ...value }; return profile } },
    analysis: { keyStatus: async () => ({ configured: previewMode, model: 'gpt-5.6-luna' }), saveKey: async () => ({ configured: true }), testKey: async () => ({ configured: true, model: 'gpt-5.6-luna' }), inspect: async () => ({ model: 'gpt-5.6-luna', store: false, redactions: ['names', 'phone numbers', 'email addresses', 'web links', 'street-like addresses'], coverage: { totalVisibleMessages: 1824, selectedExcerpts: 220, firstVisibleAt: daysAgo(2200), lastVisibleAt: daysAgo(71), missingChannels: ['phone calls', 'in-person time'] }, excerptSample: [{ id: 'preview-message', date: daysAgo(90), direction: 'from_user', context: 'group', body: 'Synthetic preview message', attachmentCount: 0 }], payloadBytes: 84002 }), run: async ({ personId }) => detail(people.find((person) => person.id === personId)), ask: async () => ({ answer: 'This answer is synthetic preview copy. Import history to receive an evidence-bounded response.', caveat: 'No real messages were analysed.', evidenceRefs: ['preview-message'], model: 'gpt-5.6-luna' }), evidence: async () => [{ id: 'preview-message', sentAt: daysAgo(90), direction: 'from_you', context: 'group', body: 'Synthetic preview message', attachmentCount: 0 }], observationStatus: async () => true },
    care: { list: async () => care, rebuild: async () => ({ actions: care, allocated: 4, unallocated: 71 }), update: async (id, status) => { care = care.map((item) => item.id === id ? { ...item, status } : item); return care.find((item) => item.id === id) } },
    privacy: { export: async () => ({ saved: false }), deleteAll: async () => ({ deleted: true }), openFullDiskAccess: async () => true },
  }
}

export const bridge = window.nearness || createDemoBridge()
