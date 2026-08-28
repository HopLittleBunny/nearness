export const PRODUCT_DOCTRINE = [
  'A relationship is not its message count.',
  'A quiet relationship is not necessarily a dying relationship.',
  'A frequent relationship is not necessarily a close relationship.',
  'Family is not friendship with a different label.',
  'Reciprocity is not a ledger.',
  'Conflict is not automatically failure.',
  'Gender and culture are context, not destiny.',
  'The user’s lived meaning outranks the model’s inference.',
  'Maintenance is judged against intention and capacity, not a universal cadence.',
]

export const BOND_SYSTEMS = [
  'household_intimate',
  'kin_family',
  'chosen_family',
  'friendship',
  'role_community',
  'acquaintance_contextual',
]

export const SOCIAL_WORLDS = [
  'childhood', 'school', 'university', 'professional', 'sports', 'parenting',
  'neighbourhood', 'faith_community', 'migration_diaspora', 'online', 'creative',
  'volunteering', 'health_caregiving', 'personal', 'family', 'custom',
]

export const RELATIONSHIP_FORMS = [
  'dyadic', 'group_carried', 'mixed', 'activity_led', 'disclosure_led',
  'practical_support_led', 'long_distance', 'seasonal_ritual', 'role_bound',
  'mentor', 'caregiving', 'bridge', 'household_interdependent', 'unclear',
]

export const CLOSENESS_LEVELS = [
  'essential', 'inner', 'active', 'wider_world', 'historical_dormant', 'intentionally_distant',
]

export const TRAJECTORIES = [
  'new', 'deepening', 'steady', 'cyclical', 'quiet_but_intact', 'changing_form',
  'drifting', 'strained', 'repairing', 'dormant_meaningful', 'resting', 'concluded', 'ambiguous', 'unknown',
]

export const INTENTIONS = [
  'understand', 'preserve', 'deepen', 'revive', 'repair', 'reframe', 'boundary', 'rest', 'conclude',
]

export const EXPERIENCE_DIMENSIONS = [
  'felt_closeness', 'satisfaction', 'companionship_joy', 'mutual_knowing',
  'responsiveness', 'reliability_alliance', 'support_fit', 'practical_help',
  'emotional_security', 'mutuality', 'conflict_ambivalence', 'repair_boundaries', 'identity_belonging',
]

export const PROHIBITED_INFERENCES = [
  'mental health diagnosis', 'attachment style', 'narcissism', 'toxicity', 'abuse',
  'romantic or sexual intent', 'whether another person cares', 'deception', 'personality type',
  'cultural style from nationality or name', 'emotional ability from gender',
  'relationship quality from sentiment alone', 'closeness from volume alone',
  'safety of reconnecting', 'mutual consent to analysis or sharing',
]

export const EVIDENCE_TYPES = [
  'observed_history', 'user_narration', 'user_rating', 'manual_interaction', 'model_inference',
]

export function defaultRelationalSelf() {
  return {
    displayName: '',
    currentChapter: '',
    weeklyMinutes: 75,
    energy: 'moderate',
    preferredActiveTies: null,
    closenessLanguage: {
      showing_up: 5,
      practical_help: 5,
      continuity_despite_silence: 5,
      humour: 4,
      shared_activity: 3,
      emotional_disclosure: 3,
      frequent_contact: 2,
      family_inclusion: 3,
      honest_challenge: 3,
      celebration: 3,
    },
    communication: {
      text: true,
      voice_note: true,
      phone: true,
      video: false,
      in_person: true,
      groups: true,
      planned: true,
      spontaneous: false,
    },
    norms: {
      silenceCanBeComfortable: true,
      practicalHelpSignalsCare: true,
      groupInclusionSignalsCare: true,
      directConflictStyle: null,
      explicitAffection: null,
      hierarchyAndAgeRolesMatter: null,
      familyCommunityIntegrationMatters: null,
      humourAndTeasingCarryCare: null,
      privacyAroundAffection: null,
      apologyAndRepairStyle: null,
      languageAndCodeSwitching: '',
      ritualsThatMatter: '',
      notes: '',
    },
    networkIntentions: ['protect_old_friendships', 'build_local_community', 'reduce_guilt'],
    updatedAt: new Date().toISOString(),
  }
}

export function deriveLocalRelationshipSignals(messages, { now = new Date() } = {}) {
  if (!messages.length) {
    return {
      coverage: 'none', messageCount: 0, activeMonths: 0, firstAt: null, lastAt: null,
      medianGapDays: null, longestGapDays: null, recentEpisodeCount: 0, initiatedByUserShare: null,
      attachmentShare: null, openLoopCandidates: [],
    }
  }

  const sorted = [...messages].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
  const gaps = []
  const months = new Set()
  let initiatedByUser = 0
  let initiatedEpisodes = 0
  let attachmentCount = 0
  let recentEpisodeCount = 0
  const openLoopCandidates = []
  let previous = null

  for (const message of sorted) {
    const date = new Date(message.sentAt)
    months.add(`${date.getUTCFullYear()}-${date.getUTCMonth()}`)
    attachmentCount += Number(message.attachmentCount || 0)
    if (!previous || date - previous.date > 36 * 60 * 60 * 1000) {
      initiatedEpisodes += 1
      if (message.isFromMe) initiatedByUser += 1
      if (now - date <= 90 * 24 * 60 * 60 * 1000) recentEpisodeCount += 1
    } else {
      gaps.push((date - previous.date) / 86400000)
    }
    const body = String(message.body || '')
    if (/\b(i(?:’|')?ll|i will|let me|remind me|we should|shall we|send you|check in)\b/i.test(body) && /\b(tomorrow|next|later|soon|week|month|send|ask|book|call|meet)\b/i.test(body)) {
      openLoopCandidates.push({ messageId: message.id, sentAt: message.sentAt, excerpt: body.slice(0, 180) })
    }
    previous = { date }
  }

  gaps.sort((a, b) => a - b)
  const firstAt = sorted[0].sentAt
  const lastAt = sorted[sorted.length - 1].sentAt
  const spanDays = Math.max(1, (new Date(lastAt) - new Date(firstAt)) / 86400000)

  return {
    coverage: spanDays > 365 * 3 ? 'longitudinal' : spanDays > 180 ? 'partial' : 'recent_only',
    messageCount: sorted.length,
    activeMonths: months.size,
    firstAt,
    lastAt,
    medianGapDays: gaps.length ? Number(gaps[Math.floor(gaps.length / 2)].toFixed(1)) : null,
    longestGapDays: gaps.length ? Number(gaps[gaps.length - 1].toFixed(1)) : null,
    recentEpisodeCount,
    initiatedByUserShare: initiatedEpisodes ? Number((initiatedByUser / initiatedEpisodes).toFixed(2)) : null,
    attachmentShare: Number((attachmentCount / sorted.length).toFixed(3)),
    openLoopCandidates: openLoopCandidates.slice(-12),
  }
}

export function calculateCareAlignment({ intention, cadenceDays, lastMeaningfulAt = null, lastContactAt = null, recencyAuthority = null, coverage, intentionallyQuiet = false, careDisabled = false, now = new Date() }) {
  if (!intention) return { state: 'needs_context', reason: 'No intention has been chosen.' }
  if (careDisabled) return { state: 'intentionally_quiet', reason: 'Care suggestions are switched off for this relationship.' }
  if (intentionallyQuiet || ['rest', 'boundary', 'conclude'].includes(intention)) {
    return { state: 'intentionally_quiet', reason: 'The current intention does not ask for more contact.' }
  }
  const contactAt = lastContactAt || lastMeaningfulAt
  const authority = recencyAuthority || (lastMeaningfulAt ? 'user_confirmed_meaningful' : 'needs_context')
  if (!contactAt || coverage === 'none') {
    return { state: 'needs_context', reason: 'Calls, meetings, or relevant history may be missing.' }
  }
  if (authority === 'visible_touch_only') {
    return { state: 'needs_context', reason: 'A visible touch exists, but Nearness cannot treat it as a mutual or meaningful contact.' }
  }
  if (!cadenceDays) return { state: 'aligned', reason: 'No recurring cadence was chosen.' }
  const days = Math.max(0, Math.floor((now - new Date(contactAt)) / 86400000))
  const basis = authority === 'user_confirmed_meaningful' ? 'your last meaningful contact' : 'the latest substantive visible interaction'
  if (days <= cadenceDays * 1.15) return { state: 'aligned', reason: `Your chosen rhythm broadly matches ${basis}.`, days, authority }
  if (days <= cadenceDays * 1.75) return { state: 'mostly_aligned', reason: `There is minor drift from ${basis}.`, days, authority }
  return { state: 'under_invested', reason: `Your intention is ahead of ${basis}; check missing channels before acting.`, days, authority }
}

export function validateObservation(observation) {
  if (!observation?.statement || !observation?.construct || !observation?.evidenceType) return false
  const lower = observation.statement.toLowerCase()
  return !PROHIBITED_INFERENCES.some((term) => lower.includes(term))
}
