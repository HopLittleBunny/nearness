import { addDays } from './time.mjs'

const MINUTES = { call: 20, voice_note: 5, message: 4, plan: 10, reflection: 3 }

export class CareEngine {
  constructor({ vault }) {
    this.vault = vault
  }

  rebuild() {
    const profile = this.vault.getRelationalSelf()
    const people = this.vault.getPeople().map((person) => this.vault.getPerson(person.id))
    const candidates = []
    for (const person of people) {
      if (!person.intention || person.intentionallyQuiet || ['rest', 'boundary', 'conclude'].includes(person.intention)) continue
      const openLoop = person.signals.openLoopCandidates.at(-1)
      if (openLoop) {
        candidates.push({
          personId: person.id, actionType: 'open_loop', title: `Return to an open loop with ${person.displayName}`,
          reason: 'A visible promise or follow-up may matter more than a generic check-in.', minutes: MINUTES.message,
          energy: 'low', dueAt: addDays(new Date(), 3).toISOString(), sourceRefs: [openLoop.messageId], priority: 0,
        })
      }
      if (['under_invested', 'mostly_aligned'].includes(person.alignment.state)) {
        const activityLed = person.forms.includes('activity_led') || person.forms.includes('group_carried')
        const actionType = activityLed ? 'plan' : profile.communication.phone ? 'call' : 'message'
        candidates.push({
          personId: person.id, actionType, title: actionType === 'call' ? `Call ${person.displayName}` : actionType === 'plan' ? `Make a low-pressure plan with ${person.displayName}` : `Write to ${person.displayName}`,
          reason: `${person.alignment.reason} This suggestion follows your “${person.intention}” intention.`,
          minutes: MINUTES[actionType], energy: actionType === 'call' ? 'moderate' : 'low',
          dueAt: addDays(new Date(), 7).toISOString(), sourceRefs: [], priority: person.alignment.state === 'under_invested' ? 1 : 2,
        })
      }
    }

    candidates.sort((a, b) => a.priority - b.priority || a.minutes - b.minutes)
    const budget = Math.floor(Number(profile.weeklyMinutes || 75) * 0.7)
    const selected = []
    let allocated = 0
    for (const candidate of candidates) {
      if (selected.length >= 3 || allocated + candidate.minutes > budget) continue
      selected.push(candidate)
      allocated += candidate.minutes
    }
    this.vault.replaceCareActions(selected)
    return { actions: this.vault.getCareActions(), allocated, unallocated: Math.max(0, Number(profile.weeklyMinutes || 75) - allocated) }
  }
}
