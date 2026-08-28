export const INTERACTION_ALGORITHM_VERSION = 'episodes-1.0.0'

export const RELATIONSHIP_ROLES = [
  'friend', 'close_friend', 'best_friend', 'chosen_family', 'parent', 'child',
  'sibling', 'extended_family', 'romantic_partner', 'spouse', 'co_parent',
  'household_partner', 'former_partner', 'mentor', 'mentee', 'colleague',
  'former_colleague', 'professional_collaborator', 'community_peer', 'teammate',
  'neighbour', 'caregiver', 'care_recipient',
]

export const ROMANTIC_STAGES = [
  'exploring', 'early_dating', 'established_dating', 'long_distance', 'cohabiting',
  'engaged', 'married_or_long_term', 'parenting_partnership', 'living_apart_together',
  'separating', 'former_partner', 'co_parent', 'concluded_or_no_contact',
]

export const MANUAL_INTERACTION_TYPES = [
  'phone_call', 'video_call', 'in_person', 'shared_activity', 'caregiving',
  'letter_or_card', 'other',
]

export const MEDIA_FAMILIES = [
  'image', 'gif', 'sticker', 'video', 'voice_note', 'audio', 'document', 'link', 'unknown',
]

export const DEFAULT_RELATIONSHIP_NORMS = {
  silenceMeaning: '',
  preferredChannels: [],
  explicitAffectionNorm: '',
  practicalCareSignificance: '',
  hierarchyOrRoleEffect: '',
  conflictDirectness: '',
  humourAndTeasingNorm: '',
  groupInclusionSignificance: '',
  languageAndCodeSwitching: '',
  recurringRituals: '',
  careExpressedAs: [],
  careWantedAs: [],
  expressionMatchState: 'needs_context',
  expressionMatchNote: '',
  reconnectionFeelsSafe: null,
}

export const GRAMMAR_REGISTRY = {
  friendship: ['companionship', 'mutual knowing', 'reliability', 'support fit', 'shared activity', 'continuity and change'],
  family: ['affection', 'family identity', 'obligation', 'practical interdependence', 'autonomy and boundaries', 'conflict and ambivalence', 'ritual and continuity'],
  romantic_intimate: ['responsiveness', 'affection and intimacy', 'commitment', 'shared tasks', 'autonomy', 'boundaries', 'conflict and repair', 'power and decision-making'],
  professional: ['role clarity', 'trust', 'reliability', 'mutual support', 'boundaries', 'how the relationship has changed beyond work'],
  group: ['shared rituals', 'participation', 'group-carried continuity', 'belonging', 'role shifts', 'collective history'],
  caregiving: ['dependency', 'practical care', 'capacity', 'role expectations', 'autonomy', 'boundaries'],
}

function sortedMessages(messages) {
  return [...(messages || [])].filter((item) => item?.sentAt).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
}

export function deriveInteractionEpisodes(messages, { gapHours = 36 } = {}) {
  const byConversation = new Map()
  for (const message of sortedMessages(messages)) {
    const key = message.conversationId || 'unknown'
    if (!byConversation.has(key)) byConversation.set(key, [])
    byConversation.get(key).push(message)
  }
  const episodes = []
  const gapMs = gapHours * 60 * 60 * 1000
  for (const [conversationId, items] of byConversation) {
    let current = null
    for (const message of items) {
      const occurredAt = new Date(message.sentAt)
      if (!current || occurredAt - new Date(current.endAt) > gapMs) {
        if (current) episodes.push(current)
        current = {
          conversationId,
          structure: message.evidenceScope || (message.isGroup ? 'person_in_group' : 'direct_dyadic'),
          startAt: message.sentAt,
          endAt: message.sentAt,
          eventIds: [],
          fromUser: 0,
          fromOther: 0,
          modalities: {},
        }
      }
      current.endAt = message.sentAt
      current.eventIds.push(message.id)
      message.isFromMe ? current.fromUser += 1 : current.fromOther += 1
      const modality = message.modality || (message.attachmentCount ? 'unknown' : 'text')
      current.modalities[modality] = (current.modalities[modality] || 0) + 1
    }
    if (current) episodes.push(current)
  }
  return episodes.sort((a, b) => new Date(a.startAt) - new Date(b.startAt)).map((episode) => {
    const mutual = episode.fromUser > 0 && episode.fromOther > 0
    const durationMinutes = Math.max(0, (new Date(episode.endAt) - new Date(episode.startAt)) / 60000)
    return {
      ...episode,
      initiatedBy: episode.fromUser ? 'user' : 'other',
      mutual,
      substantive: mutual || episode.eventIds.length >= 3 || durationMinutes >= 10,
      durationMinutes: Math.round(durationMinutes),
      algorithmVersion: INTERACTION_ALGORITHM_VERSION,
    }
  })
}

export function summarizeCommunicationEcology(messages, manualInteractions = []) {
  const items = sortedMessages(messages)
  const episodes = deriveInteractionEpisodes(items)
  const modalityCounts = {}
  const scopeCounts = { direct_dyadic: 0, person_in_group: 0, group_system: 0 }
  let attachments = 0
  for (const message of items) {
    const modality = message.modality || (message.attachmentCount ? 'unknown' : 'text')
    modalityCounts[modality] = (modalityCounts[modality] || 0) + 1
    const scope = message.evidenceScope || (message.isGroup ? 'person_in_group' : 'direct_dyadic')
    scopeCounts[scope] = (scopeCounts[scope] || 0) + 1
    attachments += Number(message.attachmentCount || 0)
  }
  const meaningfulManual = [...manualInteractions].filter((item) => item.meaningful).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
  const substantiveEpisodes = episodes.filter((item) => item.substantive)
  return {
    visibleEventCount: items.length,
    attachmentCount: attachments,
    modalityCounts,
    scopeCounts,
    episodeCount: episodes.length,
    substantiveEpisodeCount: substantiveEpisodes.length,
    manualInteractionCount: manualInteractions.length,
    lastVisibleTouch: items.at(-1)?.sentAt || null,
    lastInteractionEpisode: substantiveEpisodes.at(-1)?.endAt || episodes.at(-1)?.endAt || null,
    lastMeaningfulContact: meaningfulManual.at(-1)?.occurredAt || null,
    coverage: {
      text: Boolean(modalityCounts.text),
      mediaAware: attachments > 0 || Object.keys(modalityCounts).some((key) => key !== 'text'),
      callsOrInPerson: manualInteractions.length > 0,
      caveat: manualInteractions.length
        ? 'Visible history and the offline moments you recorded are both represented.'
        : 'Calls, meetings and in-person time remain outside the visible archive until you add them.',
    },
    episodes,
  }
}

export function grammarKeysFor({ primaryClass, roles = [], forms = [] } = {}) {
  const keys = new Set()
  if (primaryClass === 'kin_family' || primaryClass === 'chosen_family') keys.add('family')
  if (primaryClass === 'friendship' || roles.some((role) => ['friend', 'close_friend', 'best_friend', 'chosen_family'].includes(role))) keys.add('friendship')
  if (primaryClass === 'household_intimate' || roles.some((role) => ['romantic_partner', 'spouse', 'former_partner'].includes(role))) keys.add('romantic_intimate')
  if (primaryClass === 'role_community' || roles.some((role) => ['mentor', 'mentee', 'colleague', 'former_colleague', 'professional_collaborator'].includes(role))) keys.add('professional')
  if (forms.includes('group_carried') || forms.includes('mixed')) keys.add('group')
  if (forms.includes('caregiving') || roles.some((role) => ['caregiver', 'care_recipient'].includes(role))) keys.add('caregiving')
  if (!keys.size) keys.add('friendship')
  return [...keys]
}

export function reflectionPromptsFor(person) {
  return grammarKeysFor(person).flatMap((key) => (GRAMMAR_REGISTRY[key] || []).map((dimension) => ({ grammar: key, dimension })))
}

export function careRecency(ecology) {
  if (ecology.lastMeaningfulContact) return { occurredAt: ecology.lastMeaningfulContact, authority: 'user_confirmed_meaningful' }
  if (ecology.lastInteractionEpisode) return { occurredAt: ecology.lastInteractionEpisode, authority: 'interaction_episode' }
  if (ecology.lastVisibleTouch) return { occurredAt: ecology.lastVisibleTouch, authority: 'visible_touch_only' }
  return { occurredAt: null, authority: 'needs_context' }
}
