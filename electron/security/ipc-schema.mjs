import { isTrustedApplicationUrl } from './navigation.mjs'

const MAX_TEXT = 20_000
const MAX_ID = 160

function fail(channel, detail) {
  throw new Error(`Invalid request for ${channel}: ${detail}`)
}

function plainObject(value, channel, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(channel, `${label} must be an object`)
  return value
}

function closed(value, allowed, channel, label = 'input') {
  const object = plainObject(value, channel, label)
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unknown.length) fail(channel, `unknown ${label} field ${unknown[0]}`)
  return object
}

function text(value, channel, label, { required = true, max = MAX_TEXT } = {}) {
  if (value == null && !required) return
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) fail(channel, `${label} is invalid`)
}

function bool(value, channel, label, { optional = true } = {}) {
  if (value == null && optional) return
  if (typeof value !== 'boolean') fail(channel, `${label} must be true or false`)
}

function number(value, channel, label, { optional = true, min = 0, max = 1_000_000 } = {}) {
  if (value == null && optional) return
  if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) fail(channel, `${label} is out of range`)
}

function stringArray(value, channel, label, { optional = true, max = 500 } = {}) {
  if (value == null && optional) return
  if (!Array.isArray(value) || value.length > max) fail(channel, `${label} is invalid`)
  for (const item of value) text(item, channel, label, { max: MAX_ID })
}

function exactArgs(args, count, channel) {
  if (args.length !== count) fail(channel, `expected ${count} argument${count === 1 ? '' : 's'}`)
}

const NO_ARGS = new Set([
  'app:bootstrap', 'app:finishOnboarding', 'import:previewWhatsApp', 'import:previewVCard',
  'import:previewIMessage', 'sources:list', 'people:list', 'groups:list',
  'identity:listProposals', 'profile:get', 'analysis:keyStatus', 'analysis:testKey',
  'care:list', 'care:rebuild', 'privacy:export', 'privacy:openFullDiskAccess',
  'privacy:processingHistory', 'privacy:auditHistory', 'privacy:deleteOpenAiKey',
])

export function validateIpcArgs(channel, args) {
  if (NO_ARGS.has(channel)) return exactArgs(args, 0, channel)
  if (channel === 'import:previewWhatsAppBytes') {
    exactArgs(args, 1, channel)
    const input = closed(args[0], ['name', 'bytes', 'timeZone', 'locale'], channel)
    text(input.name, channel, 'name', { max: 260 })
    if (!(input.bytes instanceof Uint8Array) && !ArrayBuffer.isView(input.bytes) && !(input.bytes instanceof ArrayBuffer)) fail(channel, 'bytes are invalid')
    if (Number(input.bytes.byteLength || input.bytes.length || 0) > 250 * 1024 * 1024) fail(channel, 'file exceeds 250 MB')
    text(input.timeZone, channel, 'timeZone', { required: false, max: 100 })
    text(input.locale, channel, 'locale', { required: false, max: 50 })
    return
  }
  if (['import:updateWhatsAppDateOrder', 'import:updateWhatsAppSettings'].includes(channel)) {
    exactArgs(args, 1, channel)
    const input = closed(args[0], ['previewId', 'dateOrder', 'timeZone'], channel)
    text(input.previewId, channel, 'previewId', { max: MAX_ID })
    if (!['dmy', 'mdy', 'ymd'].includes(input.dateOrder)) fail(channel, 'dateOrder is invalid')
    text(input.timeZone, channel, 'timeZone', { required: channel === 'import:updateWhatsAppSettings', max: 100 })
    return
  }
  if (['import:progress', 'import:cancel', 'import:discard'].includes(channel)) {
    exactArgs(args, 1, channel); text(args[0], channel, 'previewId', { max: MAX_ID }); return
  }
  if (channel === 'import:commitWhatsApp') {
    exactArgs(args, 1, channel)
    const input = closed(args[0], ['previewId', 'selfName', 'conversationTitle', 'isGroup'], channel)
    text(input.previewId, channel, 'previewId', { max: MAX_ID }); text(input.selfName, channel, 'selfName', { max: 200 })
    text(input.conversationTitle, channel, 'conversationTitle', { required: false, max: 300 }); bool(input.isGroup, channel, 'isGroup'); return
  }
  if (channel === 'import:commitVCard') {
    exactArgs(args, 1, channel); const input = closed(args[0], ['previewId', 'defaultCountry'], channel)
    text(input.previewId, channel, 'previewId', { max: MAX_ID }); text(input.defaultCountry, channel, 'defaultCountry', { required: false, max: 3 }); return
  }
  if (channel === 'import:commitIMessage') {
    exactArgs(args, 1, channel); const input = closed(args[0], ['previewId', 'chatIds'], channel)
    text(input.previewId, channel, 'previewId', { max: MAX_ID }); stringArray(input.chatIds, channel, 'chatIds', { optional: false, max: 500 }); return
  }
  if (['sources:delete', 'people:get', 'analysis:inspect'].includes(channel)) {
    exactArgs(args, 1, channel)
    if (channel === 'analysis:inspect' && typeof args[0] === 'object') {
      const input = closed(args[0], ['personId', 'selection'], channel); text(input.personId, channel, 'personId', { max: MAX_ID }); validateSelection(input.selection || {}, channel); return
    }
    text(args[0], channel, channel === 'sources:delete' ? 'sourceId' : 'personId', { max: MAX_ID }); return
  }
  if (channel === 'people:update') {
    exactArgs(args, 2, channel); text(args[0], channel, 'personId', { max: MAX_ID })
    const changes = closed(args[1], ['displayName', 'primaryClass', 'specificRelationship', 'socialWorlds', 'forms', 'closeness', 'trajectory', 'intention', 'cadenceDays', 'intentionallyQuiet', 'analysisDisabled', 'careDisabled', 'hiddenFromAtlas', 'relationshipStage', 'householdStatus', 'coparentingStatus', 'notes', 'roles', 'primaryRole', 'norms'], channel, 'changes')
    for (const field of ['displayName', 'primaryClass', 'specificRelationship', 'closeness', 'trajectory', 'intention', 'relationshipStage', 'householdStatus', 'coparentingStatus', 'notes', 'primaryRole']) text(changes[field], channel, field, { required: false })
    for (const field of ['socialWorlds', 'forms', 'roles']) stringArray(changes[field], channel, field)
    for (const field of ['intentionallyQuiet', 'analysisDisabled', 'careDisabled', 'hiddenFromAtlas']) bool(changes[field], channel, field)
    number(changes.cadenceDays, channel, 'cadenceDays', { min: 1, max: 3650 })
    if (changes.norms != null) closed(changes.norms, ['silenceMeaning', 'preferredChannels', 'explicitAffectionNorm', 'practicalCareSignificance', 'hierarchyOrRoleEffect', 'conflictDirectness', 'humourAndTeasingNorm', 'groupInclusionSignificance', 'languageAndCodeSwitching', 'recurringRituals', 'careExpressedAs', 'careWantedAs', 'expressionMatchState', 'expressionMatchNote', 'reconnectionFeelsSafe'], channel, 'norms')
    return
  }
  if (channel === 'people:addManualInteraction') {
    exactArgs(args, 2, channel); text(args[0], channel, 'personId', { max: MAX_ID })
    const input = closed(args[1], ['occurredAt', 'interactionType', 'meaningful', 'title', 'notes'], channel)
    text(input.occurredAt, channel, 'occurredAt', { max: 50 }); text(input.interactionType, channel, 'interactionType', { max: 60 }); bool(input.meaningful, channel, 'meaningful')
    text(input.title, channel, 'title', { required: false, max: 300 }); text(input.notes, channel, 'notes', { required: false }); return
  }
  if (['people:deleteManualInteraction', 'people:deleteSymbolicMeaning'].includes(channel)) {
    exactArgs(args, 2, channel); text(args[0], channel, 'personId', { max: MAX_ID }); text(args[1], channel, 'itemId', { max: MAX_ID }); return
  }
  if (channel === 'people:addSymbolicMeaning') {
    exactArgs(args, 2, channel); text(args[0], channel, 'personId', { max: MAX_ID })
    const input = closed(args[1], ['symbol', 'meaning', 'appliesFrom', 'appliesTo'], channel)
    text(input.symbol, channel, 'symbol', { max: 300 }); text(input.meaning, channel, 'meaning'); text(input.appliesFrom, channel, 'appliesFrom', { required: false, max: 50 }); text(input.appliesTo, channel, 'appliesTo', { required: false, max: 50 }); return
  }
  if (channel === 'people:saveAssessment') {
    exactArgs(args, 3, channel); text(args[0], channel, 'personId', { max: MAX_ID })
    if (!['relationship_experience_profile', 'expression_match'].includes(args[1])) fail(channel, 'kind is invalid')
    const allowed = args[1] === 'relationship_experience_profile'
      ? ['authority', 'dimensions', 'reflection', 'noCompositeScore']
      : ['authority', 'state', 'careExpressedAs', 'careWantedAs', 'note', 'noCompositeScore']
    const snapshot = closed(args[2], allowed, channel, 'snapshot')
    if (snapshot.authority !== 'user_report') fail(channel, 'authority must be user_report')
    bool(snapshot.noCompositeScore, channel, 'noCompositeScore', { optional: false })
    if (args[1] === 'relationship_experience_profile') {
      const dimensions = closed(snapshot.dimensions || {}, ['felt_closeness', 'satisfaction', 'companionship_joy', 'mutual_knowing', 'responsiveness', 'reliability_alliance', 'support_fit', 'practical_help', 'emotional_security', 'mutuality', 'conflict_ambivalence', 'repair_boundaries', 'identity_belonging'], channel, 'dimensions')
      for (const [key, value] of Object.entries(dimensions)) if (value != null) number(value, channel, key, { optional: false, min: 1, max: 5 })
      text(snapshot.reflection, channel, 'reflection', { required: false })
    } else {
      text(snapshot.state, channel, 'state', { max: 80 }); stringArray(snapshot.careExpressedAs, channel, 'careExpressedAs'); stringArray(snapshot.careWantedAs, channel, 'careWantedAs'); text(snapshot.note, channel, 'note', { required: false })
    }
    return
  }
  if (channel === 'identity:decide') {
    exactArgs(args, 2, channel); text(args[0], channel, 'proposalId', { max: MAX_ID }); if (!['merge', 'separate'].includes(args[1])) fail(channel, 'decision is invalid'); return
  }
  if (channel === 'profile:save') {
    exactArgs(args, 1, channel)
    const profile = closed(args[0], ['displayName', 'currentChapter', 'weeklyMinutes', 'energy', 'preferredActiveTies', 'closenessLanguage', 'communication', 'norms', 'networkIntentions', 'updatedAt'], channel, 'profile')
    text(profile.displayName, channel, 'displayName', { required: false, max: 200 }); text(profile.currentChapter, channel, 'currentChapter', { required: false }); number(profile.weeklyMinutes, channel, 'weeklyMinutes', { min: 0, max: 10080 }); text(profile.energy, channel, 'energy', { required: false, max: 40 }); number(profile.preferredActiveTies, channel, 'preferredActiveTies', { min: 0, max: 1000 }); text(profile.updatedAt, channel, 'updatedAt', { required: false, max: 50 }); stringArray(profile.networkIntentions, channel, 'networkIntentions')
    const closeness = closed(profile.closenessLanguage || {}, ['showing_up', 'practical_help', 'continuity_despite_silence', 'humour', 'shared_activity', 'emotional_disclosure', 'frequent_contact', 'family_inclusion', 'honest_challenge', 'celebration'], channel, 'closenessLanguage')
    for (const [key, value] of Object.entries(closeness)) number(value, channel, key, { optional: false, min: 0, max: 5 })
    const communication = closed(profile.communication || {}, ['text', 'voice_note', 'phone', 'video', 'in_person', 'groups', 'planned', 'spontaneous'], channel, 'communication')
    for (const [key, value] of Object.entries(communication)) bool(value, channel, key, { optional: false })
    const norms = closed(profile.norms || {}, ['silenceCanBeComfortable', 'practicalHelpSignalsCare', 'groupInclusionSignalsCare', 'directConflictStyle', 'explicitAffection', 'explicitAffectionNorm', 'conflictDirectness', 'hierarchyAndAgeRolesMatter', 'familyCommunityIntegrationMatters', 'familyIntegration', 'humourAndTeasingCarryCare', 'privacyAroundAffection', 'apologyAndRepairStyle', 'languageAndCodeSwitching', 'ritualsThatMatter', 'notes'], channel, 'norms')
    for (const [key, value] of Object.entries(norms)) if (value != null && typeof value !== 'boolean') text(value, channel, key, { required: false })
    return
  }
  if (channel === 'analysis:saveKey') { exactArgs(args, 1, channel); text(args[0], channel, 'key', { max: 500 }); return }
  if (channel === 'analysis:run') {
    exactArgs(args, 1, channel); const input = closed(args[0], ['personId', 'consent', 'consentHash', 'selection'], channel)
    text(input.personId, channel, 'personId', { max: MAX_ID }); bool(input.consent, channel, 'consent', { optional: false }); text(input.consentHash, channel, 'consentHash', { max: 64 }); validateSelection(input.selection || {}, channel); return
  }
  if (channel === 'analysis:observationStatus') {
    exactArgs(args, 3, channel); text(args[0], channel, 'observationId', { max: MAX_ID }); if (!['confirmed', 'rejected', 'corrected'].includes(args[1])) fail(channel, 'status is invalid'); text(args[2], channel, 'correction', { required: false }); return
  }
  if (channel === 'analysis:evidence') { exactArgs(args, 2, channel); text(args[0], channel, 'personId', { max: MAX_ID }); stringArray(args[1], channel, 'messageIds', { optional: false, max: 100 }); return }
  if (channel === 'care:update') { exactArgs(args, 2, channel); text(args[0], channel, 'actionId', { max: MAX_ID }); if (!['suggested', 'completed', 'dismissed'].includes(args[1])) fail(channel, 'status is invalid'); return }
  if (channel === 'privacy:deleteAll') { exactArgs(args, 1, channel); text(args[0], channel, 'confirmation', { max: 80 }); return }
  fail(channel, 'channel has no schema')
}

function validateSelection(selection, channel) {
  const value = closed(selection, ['excludedExcerptIds', 'includeRelationalSelf', 'includeUserContext', 'includeLocalSignals'], channel, 'selection')
  stringArray(value.excludedExcerptIds, channel, 'excludedExcerptIds', { max: 220 })
  for (const field of ['includeRelationalSelf', 'includeUserContext', 'includeLocalSignals']) bool(value[field], channel, field)
}

export function assertTrustedIpcSender(event, devUrl = null) {
  const url = event?.senderFrame?.url || ''
  if (!isTrustedApplicationUrl(url, devUrl)) throw new Error('Blocked a privileged request from an untrusted application frame.')
}
