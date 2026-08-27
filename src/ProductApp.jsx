import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, ContactRound,
  Download, Eye, Heart, KeyRound, Layers3, LoaderCircle, LockKeyhole,
  MessageSquareText, Phone, RefreshCw, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, UserRound, X,
} from 'lucide-react'
import { bridge } from './lib/bridge'
import treeArt from './assets/relationship-tree.png'
import './product.css'

const BOND_SYSTEMS = ['household_intimate', 'kin_family', 'chosen_family', 'friendship', 'role_community', 'acquaintance_contextual']
const CLOSENESS = ['essential', 'inner', 'active', 'wider_world', 'historical_dormant', 'intentionally_distant']
const TRAJECTORIES = ['new', 'deepening', 'steady', 'cyclical', 'quiet_but_intact', 'changing_form', 'drifting', 'strained', 'repairing', 'dormant_meaningful', 'resting', 'concluded', 'ambiguous', 'unknown']
const INTENTIONS = ['understand', 'preserve', 'deepen', 'revive', 'repair', 'reframe', 'boundary', 'rest', 'conclude']
const FORMS = ['dyadic', 'group_carried', 'mixed', 'activity_led', 'disclosure_led', 'practical_support_led', 'long_distance', 'seasonal_ritual', 'role_bound', 'mentor', 'caregiving', 'bridge', 'household_interdependent', 'unclear']
const WORLDS = ['childhood', 'school', 'university', 'professional', 'sports', 'parenting', 'neighbourhood', 'faith_community', 'migration_diaspora', 'online', 'creative', 'volunteering', 'health_caregiving', 'personal', 'family']
const CADENCES = [['', 'No recurring rhythm'], ['7', 'About weekly'], ['14', 'Every two weeks'], ['30', 'Monthly'], ['60', 'Every two months'], ['90', 'Quarterly'], ['180', 'Twice a year'], ['365', 'Yearly ritual']]
const WORLD_COLORS = ['#dce8df', '#f5ded5', '#dbe6ed', '#ece4d5', '#e6dfeb', '#dce9e5']

const friendly = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not visible'
const fullDate = (value) => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not visible'
const number = (value) => new Intl.NumberFormat().format(Number(value || 0))
const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
const errorMessage = (error) => String(error?.message || error || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': Error: /, '')

function LoadingScreen() {
  return <div className="v4-loading"><span>N</span><p>Opening your private world…</p></div>
}

function Notice({ children, onClose }) {
  return <div className="v4-notice" role="status"><span>{children}</span>{onClose ? <button aria-label="Dismiss" onClick={onClose}><X /></button> : null}</div>
}

function Sheet({ title, detail, onClose, children, className = '' }) {
  return <div className="v4-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`v4-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="v4-sheet-head"><div><h2 id="sheet-title">{title}</h2>{detail ? <p>{detail}</p> : null}</div><button aria-label="Close" onClick={onClose}><X /></button></div>
      {children}
    </section>
  </div>
}

function AppHeader({ view, onView, onAddChats, onManage }) {
  return <header className="v4-header">
    <button className="v4-wordmark" onClick={() => onView('world')}>Nearness</button>
    <nav aria-label="Primary navigation">
      <button className={view === 'world' ? 'active' : ''} onClick={() => onView('world')}>My world</button>
      <button className={view === 'care' ? 'active' : ''} onClick={() => onView('care')}>Care</button>
    </nav>
    <div className="v4-header-actions"><button className="v4-manage" onClick={onManage}><Settings2 />Manage</button><button className="v4-add" onClick={onAddChats}><span>+</span>Add chats</button></div>
  </header>
}

function SourceChoice({ icon: Icon, title, detail, onClick, busy, disabled }) {
  return <button className="v4-source-choice" onClick={onClick} disabled={disabled}>
    {busy ? <LoaderCircle className="spin" /> : <Icon />}<span><strong>{title}</strong><small>{busy ? 'Reading the selected file locally…' : detail}</small></span><ChevronRight />
  </button>
}

function AddChatsSheet({ data, onClose, onImport }) {
  const [busyKind, setBusyKind] = useState('')
  const [error, setError] = useState('')
  const whatsappInput = useRef(null)

  async function choose(kind) {
    if (kind === 'whatsapp') return whatsappInput.current?.click()
    if (kind === 'imessage') return onImport(kind, null)
    setBusyKind(kind); setError('')
    try {
      const preview = await bridge.import.previewVCard()
      if (preview) onImport(kind, preview)
    } catch (err) { setError(errorMessage(err)) } finally { setBusyKind('') }
  }

  async function readWhatsAppFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusyKind('whatsapp'); setError('')
    try {
      const bytes = await file.arrayBuffer()
      const preview = await bridge.import.previewWhatsAppBytes({ name: file.name, bytes })
      if (preview) onImport('whatsapp', preview)
    } catch (err) { setError(errorMessage(err)) } finally { setBusyKind('') }
  }

  return <Sheet title="Bring in your history" detail="Read locally. Additive and reversible." onClose={onClose} className="v4-add-sheet">
    <div className="v4-local-note"><LockKeyhole /><p><strong>Your chats stay on this Mac.</strong> Import never uses AI. Personal text is encrypted before it enters your Nearness vault.</p></div>
    {error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}
    <input ref={whatsappInput} className="v4-file-input" type="file" accept=".zip,.txt,text/plain,application/zip" onChange={readWhatsAppFile} />
    <div className="v4-source-list">
      <SourceChoice icon={MessageSquareText} title="WhatsApp export" detail="Choose a ZIP or TXT export" onClick={() => choose('whatsapp')} busy={busyKind === 'whatsapp'} disabled={Boolean(busyKind)} />
      <SourceChoice icon={Phone} title="Messages on this Mac" detail="Select conversations · read-only" onClick={() => choose('imessage')} disabled={Boolean(busyKind)} />
      <SourceChoice icon={ContactRound} title="Contacts" detail="Add a vCard to recognise imported people" onClick={() => choose('vcard')} busy={busyKind === 'vcard'} disabled={Boolean(busyKind)} />
    </div>
    {data.sources?.length ? <div className="v4-connected"><span>Already in your world</span>{data.sources.map((source) => <div key={source.id}><strong>{source.label}</strong><small>{number(source.messageCount)} messages · {source.conversationCount} conversations</small></div>)}</div> : null}
  </Sheet>
}

function ImportFlow({ kind, initialPreview, onClose, onChanged }) {
  const [preview, setPreview] = useState(initialPreview || null)
  const [busy, setBusy] = useState(!initialPreview)
  const [error, setError] = useState('')
  const [selfName, setSelfName] = useState(initialPreview?.participants?.[0] || '')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [isGroup, setIsGroup] = useState(Boolean(initialPreview?.isGroup))

  useEffect(() => {
    if (initialPreview) return undefined
    let live = true
    async function load() {
      try {
        const value = await bridge.import.previewIMessage()
        if (!live) return
        if (!value) return onClose()
        setPreview(value)
      } catch (err) { if (live) setError(errorMessage(err)) } finally { if (live) setBusy(false) }
    }
    load()
    return () => { live = false }
  }, [initialPreview, onClose])

  async function commit() {
    setBusy(true); setError('')
    try {
      if (kind === 'whatsapp') await bridge.import.commitWhatsApp({ previewId: preview.previewId, selfName, conversationTitle: title, isGroup })
      if (kind === 'vcard') await bridge.import.commitVCard({ previewId: preview.previewId, defaultCountry: 'AU' })
      if (kind === 'imessage') await bridge.import.commitIMessage({ previewId: preview.previewId, chatIds: [...selected] })
      await onChanged(); onClose()
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  async function changeDateOrder(dateOrder) {
    if (!dateOrder) return
    setBusy(true); setError('')
    try {
      const updated = await bridge.import.updateWhatsAppDateOrder({ previewId: preview.previewId, dateOrder })
      setPreview((current) => ({ ...current, ...updated }))
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }

  const chats = preview?.chats?.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())) || []
  const titleText = kind === 'whatsapp' ? 'Add a WhatsApp conversation' : kind === 'imessage' ? 'Choose Messages conversations' : 'Add names from Contacts'
  return <Sheet title={titleText} detail="Nothing leaves this Mac during import." onClose={onClose} className="v4-import">
    {error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}
    {busy && !preview ? <div className="v4-reading"><LoaderCircle className="spin" /><span>{kind === 'imessage' ? 'Reading Messages on this Mac…' : 'Reading the selected source…'}</span></div> : null}
    {kind === 'imessage' && error.includes('Full Disk Access') ? <button className="v4-outline wide" onClick={() => bridge.privacy.openFullDiskAccess()}>Open Full Disk Access</button> : null}
    {preview && kind === 'whatsapp' ? <div className="v4-import-body">
      <div className="v4-import-summary"><span><strong>{number(preview.messageCount)}</strong> messages</span><span><strong>{preview.participantCount}</strong> people</span><span><strong>{dateLabel(preview.startAt)}–{dateLabel(preview.endAt)}</strong> visible history</span></div>
      {preview.duplicate ? <Notice>This exact export is already in your vault.</Notice> : null}
      {preview.updatesExisting ? <Notice>Nearness found an earlier version of this conversation. Only new messages will be added.</Notice> : null}
      {preview.dateOrderAmbiguous ? <Notice>The dates in this export are ambiguous. Choose the order before importing.</Notice> : null}
      <div className="v4-form-pair"><label><span>Which name is you?</span><select value={selfName} onChange={(event) => setSelfName(event.target.value)}>{preview.participants.map((name) => <option key={name}>{name}</option>)}</select><small>Nearness never guesses who sent which messages.</small></label><label><span>Conversation name <em>optional</em></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={preview.label} /></label></div>
      <label className="v4-checkline"><input type="checkbox" checked={isGroup} disabled={preview.participantCount > 2} onChange={(event) => setIsGroup(event.target.checked)} /><span><strong>This is a group conversation</strong><small>{preview.participantCount > 2 ? 'Confirmed by the number of visible participants.' : 'Exports with only two visible senders cannot prove this automatically.'}</small></span></label>
      <div className="v4-parse-note"><strong>Date interpretation</strong><select aria-label="WhatsApp date order" value={preview.dateOrderAmbiguous ? '' : preview.dateOrder} onChange={(event) => changeDateOrder(event.target.value)}><option value="" disabled>Choose date order</option><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option><option value="ymd">Year / month / day</option></select><span>{preview.dateFormatLabel}</span></div>
      <details><summary><Eye />Inspect the parsed sample</summary>{preview.sample.map((item, index) => <blockquote key={index}><time>{fullDate(item.sentAt)}</time><strong>{item.sender}</strong><p>{item.body}</p></blockquote>)}</details>
    </div> : null}
    {preview && kind === 'vcard' ? <div className="v4-import-body"><p className="v4-explain">Contacts stay as reference identities. They do not appear in your atlas unless they match someone from an imported conversation.</p><div className="v4-contact-grid">{preview.contacts.slice(0, 12).map((contact) => <span key={`${contact.displayName}-${contact.phoneCount}`}><strong>{contact.displayName}</strong><small>{contact.phoneCount} phone · {contact.emailCount} email</small></span>)}</div></div> : null}
    {preview && kind === 'imessage' ? <div className="v4-import-body">
      <div className="v4-chat-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a conversation" /></label><button onClick={() => setSelected(new Set(preview.chats.slice(0, 20).map((chat) => chat.id)))}>Select 20 recent</button><span>{selected.size} chosen</span></div>
      <div className="v4-chat-list">{chats.map((chat) => <label key={chat.id} className={selected.has(chat.id) ? 'selected' : ''}><input type="checkbox" checked={selected.has(chat.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(chat.id) ? next.delete(chat.id) : next.add(chat.id); return next })} /><span><strong>{chat.title}</strong><small>{number(chat.messageCount)} messages · {chat.isGroup ? `${chat.participantCount} people` : chat.service}</small></span><time>{dateLabel(chat.endAt)}</time></label>)}</div>
    </div> : null}
    {preview ? <div className="v4-sheet-actions"><button className="v4-primary" disabled={busy || preview.duplicate || (kind === 'whatsapp' && preview.dateOrderAmbiguous) || (kind === 'imessage' && !selected.size)} onClick={commit}>{busy ? <LoaderCircle className="spin" /> : <Upload />}{kind === 'imessage' ? `Add ${selected.size || ''} conversations` : preview.updatesExisting ? 'Add new messages' : 'Encrypt and add'}</button><button className="v4-outline" onClick={onClose} disabled={busy}>Cancel</button></div> : null}
  </Sheet>
}

function usePerson(personId, version) {
  const [person, setPerson] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    if (!personId) { setPerson(null); setError(''); return () => { live = false } }
    setLoading(true); setError('')
    bridge.people.get(personId).then((value) => { if (live) setPerson(value) }).catch((err) => { if (live) { setPerson(null); setError(errorMessage(err)) } }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [personId, version])
  return { person, loading, error }
}

function MultiChoice({ options, value = [], onChange }) {
  return <div className="v4-choice-grid">{options.map((option) => <button type="button" key={option} className={value.includes(option) ? 'selected' : ''} onClick={() => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])}>{value.includes(option) ? <Check /> : null}{friendly(option)}</button>)}</div>
}

function AnalysisBoundary({ person, onClose, onComplete }) {
  const [inspect, setInspect] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    bridge.analysis.inspect(person.id).then((value) => { if (live) setInspect(value) }).catch((err) => { if (live) setError(errorMessage(err)) }).finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [person.id])
  async function run() {
    setBusy(true); setError('')
    try { await bridge.analysis.run({ personId: person.id, consent, consentHash: inspect.payloadHash }); await onComplete(); onClose() } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }
  return <Sheet title="Before Nearness reads for meaning" detail="You see the exact boundary before anything leaves this Mac." onClose={onClose} className="v4-analysis-sheet">
    {error ? <Notice>{error}</Notice> : null}
    {busy && !inspect ? <div className="v4-reading"><LoaderCircle className="spin" /><span>Preparing a redacted selection…</span></div> : null}
    {inspect ? <><div className="v4-analysis-summary"><span><strong>{number(inspect.coverage.selectedExcerpts)}</strong> selected of {number(inspect.coverage.totalVisibleMessages)}</span><span><strong>{Math.ceil(inspect.payloadBytes / 1024)} KB</strong> redacted payload</span><span><strong>{inspect.model}</strong> · store: false</span></div><div className="v4-redaction-list"><strong>Removed before sending</strong>{inspect.redactions.map((item) => <span key={item}><Check />{item}</span>)}</div><details><summary><Eye />Inspect the selected excerpts</summary>{inspect.excerptSample.slice(0, 20).map((item) => <blockquote key={item.id}><time>{fullDate(item.date)} · {friendly(item.direction)} · {friendly(item.context)}</time><p>{item.body || `${item.attachmentCount} attachment`}</p></blockquote>)}</details><div className="v4-coverage"><CircleHelp /><span><strong>Still outside this analysis</strong>{inspect.coverage.missingChannels.join(', ')}</span></div><label className="v4-checkline"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Send this exact redacted selection for this analysis.</strong><small>This uses your configured OpenAI account for one evidence-bound portrait.</small></span></label><div className="v4-sheet-actions"><button className="v4-primary" disabled={!consent || busy} onClick={run}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}Build the portrait</button><button className="v4-outline" onClick={onClose}>Keep it local</button></div></> : null}
  </Sheet>
}

function EvidenceObservation({ observation, personId, onChanged }) {
  const [evidence, setEvidence] = useState(null)
  async function toggleEvidence() { setEvidence(evidence ? null : await bridge.analysis.evidence(personId, observation.evidenceRefs)) }
  async function setStatus(status) { await bridge.analysis.observationStatus(observation.id, status); await onChanged() }
  return <article className="v4-observation"><p>{observation.statement}</p><small>{observation.construct} · {observation.confidence} confidence · missing {observation.missing?.join(', ') || 'context'}</small><div><button onClick={toggleEvidence}><Eye />{evidence ? 'Hide evidence' : `${observation.evidenceRefs.length} supporting moments`}</button><button className={observation.userStatus === 'confirmed' ? 'selected' : ''} onClick={() => setStatus('confirmed')}><Check />Fits</button><button onClick={() => setStatus('rejected')}><X />Doesn’t fit</button></div>{evidence ? <section>{evidence.map((item) => <blockquote key={item.id}><time>{fullDate(item.sentAt)} · {friendly(item.direction)}</time><p>{item.body || `${item.attachmentCount} attachment`}</p></blockquote>)}</section> : null}</article>
}

function PersonStory({ personId, version, keyConfigured, onClose, onChanged, onOpenManage }) {
  const { person, loading, error: loadError } = usePerson(personId, version)
  const [editing, setEditing] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (person) setForm(person) }, [person])
  async function save() {
    setBusy(true); setError('')
    try {
      await bridge.people.update(person.id, { ...form, cadenceDays: form.cadenceDays ? Number(form.cadenceDays) : null })
      await onChanged(); setEditing(false)
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <div className="v4-backdrop v4-story-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><article className="v4-story" role={analysisOpen ? undefined : 'dialog'} aria-modal={analysisOpen ? undefined : 'true'} aria-hidden={analysisOpen ? 'true' : undefined} aria-labelledby="story-name">
    {loadError ? <div className="v4-load-failure"><Notice>{loadError}</Notice><button className="v4-outline" onClick={onClose}>Close</button></div> : loading || !person || !form ? <div className="v4-reading"><LoaderCircle className="spin" /><span>Opening this relationship…</span></div> : <>
      <div className="v4-story-top"><button aria-label="Close" onClick={onClose}><X /></button><span>{friendly(person.specificRelationship)} · {friendly(person.closeness)}</span><h2 id="story-name">{person.displayName}</h2></div>
      {error ? <Notice>{error}</Notice> : null}
      {editing ? <div className="v4-relationship-form"><div className="v4-form-pair"><label><span>Relationship system</span><select value={form.primaryClass} onChange={(event) => setForm({ ...form, primaryClass: event.target.value })}>{BOND_SYSTEMS.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label><label><span>Your own description</span><input value={form.specificRelationship || ''} onChange={(event) => setForm({ ...form, specificRelationship: event.target.value })} placeholder="Old school friend, cousin, mentor…" /></label></div><div className="v4-form-pair"><label><span>Felt closeness</span><select value={form.closeness} onChange={(event) => setForm({ ...form, closeness: event.target.value })}>{CLOSENESS.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label><label><span>Current trajectory</span><select value={form.trajectory} onChange={(event) => setForm({ ...form, trajectory: event.target.value })}>{TRAJECTORIES.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label></div><div className="v4-form-pair"><label><span>Your intention</span><select value={form.intention || ''} onChange={(event) => setForm({ ...form, intention: event.target.value || null })}><option value="">No Care intention</option>{INTENTIONS.map((item) => <option key={item} value={item}>{friendly(item)}</option>)}</select></label><label><span>Rhythm that would feel right</span><select value={form.cadenceDays || ''} onChange={(event) => setForm({ ...form, cadenceDays: event.target.value })}>{form.cadenceDays && !CADENCES.some(([value]) => Number(value) === Number(form.cadenceDays)) ? <option value={form.cadenceDays}>Every {form.cadenceDays} days</option> : null}{CADENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><section><strong>Social worlds</strong><MultiChoice options={WORLDS} value={form.socialWorlds} onChange={(socialWorlds) => setForm({ ...form, socialWorlds })} /></section><section><strong>Relationship forms</strong><MultiChoice options={FORMS} value={form.forms} onChange={(forms) => setForm({ ...form, forms })} /></section><label><span>What the archive cannot know</span><textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Calls, shared history, what silence means here, boundaries…" /></label><label className="v4-checkline"><input type="checkbox" checked={Boolean(form.intentionallyQuiet)} onChange={(event) => setForm({ ...form, intentionallyQuiet: event.target.checked })} /><span><strong>Do not suggest contact right now</strong><small>Boundary, rest and conclusion always outrank reminders.</small></span></label><div className="v4-sheet-actions"><button className="v4-primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <Check />}Save relationship</button><button className="v4-outline" onClick={() => setEditing(false)}>Cancel</button></div></div> : <><blockquote>{person.portrait?.headline || `${person.displayName} has a story the archive cannot tell alone.`}</blockquote><p className="v4-story-lede">{person.portrait?.essence || `Nearness can see ${number(person.messageCount)} visible messages and the channels you imported. Add your context before asking it to interpret what the pattern means.`}</p>{person.portrait?.story ? <p>{person.portrait.story}</p> : null}<div className="v4-story-actions"><button className="v4-primary" onClick={() => setEditing(true)}><UserRound />Add your context</button>{keyConfigured ? <button className="v4-outline" onClick={() => setAnalysisOpen(true)}><Sparkles />{person.portrait ? 'Rebuild portrait' : 'Review AI boundary'}</button> : <button className="v4-outline" onClick={onOpenManage}><KeyRound />Set up private analysis</button>}</div>{person.observations?.length ? <section className="v4-observations"><h3>What the visible history suggests</h3>{person.observations.slice(0, 6).map((observation) => <EvidenceObservation key={observation.id} observation={observation} personId={person.id} onChanged={onChanged} />)}</section> : null}<footer><div><strong>{number(person.messageCount)} visible messages</strong><small>{dateLabel(person.signals?.firstAt)}–{dateLabel(person.signals?.lastAt)} · {number(person.signals?.groupAuthoredMessageCount)} attributable group messages</small></div><span>Not a score. Not a verdict.</span></footer></>}
    </>}
  </article>{analysisOpen && person ? <AnalysisBoundary person={person} onClose={() => setAnalysisOpen(false)} onComplete={onChanged} /> : null}</div>
}

function PeopleSheet({ people, selectedId, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const filtered = people.filter((person) => `${person.displayName} ${person.specificRelationship} ${person.socialWorlds?.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  return <Sheet title="Everyone in your world" detail="Search by name, relationship or social world." onClose={onClose} className="v4-people-sheet"><label className="v4-people-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a person" /></label><div className="v4-people-list">{filtered.map((person) => <button key={person.id} className={selectedId === person.id ? 'selected' : ''} onClick={() => { onSelect(person.id); onClose() }}><i>{initials(person.displayName)}</i><span><strong>{person.displayName}</strong><small>{friendly(person.specificRelationship)} · {person.socialWorlds?.map(friendly).join(', ') || 'Needs context'}</small></span><ChevronRight /></button>)}</div></Sheet>
}

function atlasLayout(people) {
  const worldCounts = new Map()
  for (const person of people) {
    const memberships = person.socialWorlds?.length ? person.socialWorlds : [person.primaryClass || 'unplaced']
    for (const world of memberships) worldCounts.set(world, (worldCounts.get(world) || 0) + 1)
  }
  const worlds = [...worldCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([name], index) => ({ name, color: WORLD_COLORS[index] }))
  const worldIndex = new Map(worlds.map((world, index) => [world.name, index]))
  const closenessDistance = { essential: 18, inner: 27, active: 36, wider_world: 44, historical_dormant: 48, intentionally_distant: 51 }
  const occurrences = new Map()
  const closenessRank = new Map(CLOSENESS.map((value, index) => [value, index]))
  const visiblePeople = [...people].sort((a, b) =>
    (closenessRank.get(a.closeness) ?? 99) - (closenessRank.get(b.closeness) ?? 99)
    || new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
    || a.displayName.localeCompare(b.displayName),
  )
  const nodes = visiblePeople.slice(0, 24).map((person, index) => {
    const memberships = (person.socialWorlds?.length ? person.socialWorlds : [person.primaryClass || 'unplaced']).filter((world) => worldIndex.has(world))
    const indices = memberships.length ? memberships.map((world) => worldIndex.get(world)) : [index % Math.max(worlds.length, 1)]
    const signature = indices.slice().sort((a, b) => a - b).join('-')
    const occurrence = occurrences.get(signature) || 0
    occurrences.set(signature, occurrence + 1)
    const spread = [-.32, .32, -.16, .16, 0]
    const membershipAngles = indices.map((wi) => (-Math.PI / 2) + (wi / Math.max(worlds.length, 1)) * Math.PI * 2)
    const angleY = membershipAngles.reduce((sum, value) => sum + Math.sin(value), 0)
    const angleX = membershipAngles.reduce((sum, value) => sum + Math.cos(value), 0)
    const baseAngle = Math.hypot(angleX, angleY) < .2 ? membershipAngles[0] : Math.atan2(angleY, angleX)
    const angle = baseAngle + spread[occurrence % spread.length]
    const distance = (closenessDistance[person.closeness] || 38) + Math.floor(occurrence / spread.length) * 7
    const colors = indices.map((wi) => worlds[wi]?.color || WORLD_COLORS[0])
    const fill = colors.length > 1 ? `linear-gradient(135deg, ${colors[0]} 0 49%, ${colors[1]} 51% 100%)` : colors[0]
    return { person, left: 50 + Math.cos(angle) * distance, top: 50 + Math.sin(angle) * distance * .78, fill }
  })
  return { worlds, nodes }
}

function WorldCanvas({ people, selectedId, onSelect, onMore, selfName }) {
  const layout = useMemo(() => atlasLayout(people), [people])
  const selfLabel = (selfName || 'You').trim().split(/\s+/)[0]
  return <div className="v4-world-canvas" aria-label="Your relationship atlas"><div className="v4-orbit one" /><div className="v4-orbit two" />{layout.worlds.map((world, index) => { const angle = (-Math.PI / 2) + (index / Math.max(layout.worlds.length, 1)) * Math.PI * 2; return <div key={world.name} className="v4-world-area" style={{ '--world-color': world.color, left: `${50 + Math.cos(angle) * 30}%`, top: `${50 + Math.sin(angle) * 25}%` }} /> })}<svg className="v4-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{layout.nodes.map(({ person, left, top }) => <line key={person.id} x1="50" y1="50" x2={left} y2={top} />)}</svg>{layout.worlds.map((world, index) => { const angle = (-Math.PI / 2) + (index / Math.max(layout.worlds.length, 1)) * Math.PI * 2; return <span key={world.name} className="v4-world-label" style={{ left: `${50 + Math.cos(angle) * 48}%`, top: `${50 + Math.sin(angle) * 43}%` }}>{friendly(world.name)}</span> })}<div className="v4-you"><i>{selfLabel.length <= 8 ? selfLabel : initials(selfLabel)}</i><span>You</span></div>{layout.nodes.map(({ person, left, top, fill }) => <button key={person.id} className={`v4-person-node ${selectedId === person.id ? 'selected' : ''}`} style={{ left: `${left}%`, top: `${top}%`, '--node-fill': fill }} onClick={() => onSelect(person.id)} aria-label={`Open ${person.displayName}`}><i>{initials(person.displayName)}</i><strong>{person.displayName}</strong></button>)}{people.length > 24 ? <button className="v4-more-node" onClick={onMore}>+{people.length - 24} more</button> : null}</div>
}

function WorldHome({ data, selectedId, version, onSelect, onStory, onPeople }) {
  const listed = data.people.find((person) => person.id === selectedId) || data.people[0]
  const { person: detail } = usePerson(listed?.id, version)
  const selected = detail || listed
  const hasPortrait = Boolean(selected?.portrait?.headline)
  const headline = selected?.portrait?.headline || `${selected?.displayName || 'This relationship'}, in the parts of life you share.`
  const supporting = selected?.portrait?.essence || `${number(selected?.messageCount)} visible messages offer a partial history. Add what this relationship means to you before Nearness reads the pattern for meaning.`
  return <main className="v4-world"><section className="v4-insight"><h1>{headline}</h1><p>{supporting}</p><img src={treeArt} alt="A hand-drawn tree with two chairs beneath it" /><button className="v4-story-link" onClick={() => onStory(selected.id)}>{hasPortrait ? `See ${selected.displayName}’s story` : `Add context for ${selected.displayName}`} <ArrowRight /></button><button className="v4-all-people" onClick={onPeople}>{data.people.length} people in your world</button></section><WorldCanvas people={data.people} selectedId={selected.id} onSelect={onSelect} onMore={onPeople} selfName={data.relationalSelf?.displayName} /></main>
}

function EmptyWorld({ onAddChats }) {
  return <main className="v4-empty-world"><section><h1>Your world begins with one conversation.</h1><p>Add a WhatsApp export or connect Messages. Nearness reads it locally, then lets you decide what the relationships mean.</p><button className="v4-add large" onClick={onAddChats}><span>+</span>Add your first chats</button><small>ZIP or TXT from WhatsApp · read-only Messages on Mac</small></section><img src={treeArt} alt="Two empty chairs beneath a tree" /></main>
}

function CareView({ data, refresh, onPeople }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function update(id, status) { setBusy(id); setError(''); try { await bridge.care.update(id, status); await refresh() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') } }
  async function rebuild() { setBusy('rebuild'); setError(''); try { await bridge.care.rebuild(); await refresh() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') } }
  const allocated = data.care.reduce((sum, action) => action.status === 'suggested' ? sum + action.minutes : sum, 0)
  return <main className="v4-care"><header><div><h1>Care, without guilt.</h1><p>You offered {data.relationalSelf.weeklyMinutes} minutes this week. Nearness has suggested {allocated} and left the rest protected.</p></div><button className="v4-outline" disabled={busy === 'rebuild'} onClick={rebuild}><RefreshCw className={busy === 'rebuild' ? 'spin' : ''} />Refresh suggestions</button></header>{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}{data.care.length ? <div className="v4-care-list">{data.care.map((action) => <article key={action.id} className={action.status}><button aria-label={action.status === 'completed' ? 'Mark not done' : 'Mark done'} disabled={busy === action.id} onClick={() => update(action.id, action.status === 'completed' ? 'suggested' : 'completed')}>{action.status === 'completed' ? <Check /> : null}</button><div><span>{action.personName}</span><h2>{action.title}</h2><p>{action.reason}</p><small>{action.minutes} minutes · {action.energy} energy</small></div><button className="v4-not-now" onClick={() => update(action.id, 'dismissed')}>Not now</button></article>)}</div> : <div className="v4-care-empty"><Heart /><h2>Nothing needs chasing.</h2><p>Care appears only after you choose an intention for a relationship. Silence alone never creates urgency.</p><button className="v4-outline" onClick={onPeople}>Choose a relationship intention</button></div>}</main>
}

function ProfilePanel({ profile: initialProfile, onSaved }) {
  const [profile, setProfile] = useState(initialProfile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function nested(section, key, value) { setProfile((current) => ({ ...current, [section]: { ...current[section], [key]: value } })) }
  async function save() { setBusy(true); setError(''); try { await bridge.profile.save(profile); await bridge.care.rebuild(); await onSaved() } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }
  return <div className="v4-manage-panel">{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}<div className="v4-form-pair"><label><span>What should Nearness call you?</span><input value={profile.displayName || ''} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} placeholder="Your name" /></label><label><span>Your current life chapter</span><input value={profile.currentChapter || ''} onChange={(event) => setProfile({ ...profile, currentChapter: event.target.value })} placeholder="Settling somewhere new, caring for family…" /></label></div><label><span>Relationship time in a typical week · <strong>{profile.weeklyMinutes} minutes</strong></span><input type="range" min="15" max="240" step="5" value={profile.weeklyMinutes} onChange={(event) => setProfile({ ...profile, weeklyMinutes: Number(event.target.value) })} /><small>Nearness keeps at least 30% unallocated.</small></label><section><h3>What makes a relationship feel close to you?</h3>{Object.entries(profile.closenessLanguage || {}).map(([key, score]) => <label className="v4-range" key={key}><span>{friendly(key)}</span><input type="range" min="0" max="5" value={score} onChange={(event) => nested('closenessLanguage', key, Number(event.target.value))} /><strong>{score}/5</strong></label>)}</section><section><h3>Channels that count in your real life</h3><MultiChoice options={Object.keys(profile.communication || {})} value={Object.entries(profile.communication || {}).filter(([, enabled]) => enabled).map(([key]) => key)} onChange={(selected) => setProfile({ ...profile, communication: Object.fromEntries(Object.keys(profile.communication || {}).map((key) => [key, selected.includes(key)])) })} /></section><label className="v4-checkline"><input type="checkbox" checked={Boolean(profile.norms?.silenceCanBeComfortable)} onChange={(event) => nested('norms', 'silenceCanBeComfortable', event.target.checked)} /><span><strong>Silence can be comfortable.</strong><small>Long gaps will not be treated as decline on their own.</small></span></label><button className="v4-primary" disabled={busy} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <Check />}Save my context</button></div>
}

function IdentityPanel({ proposals, onChanged }) {
  const pending = proposals.filter((proposal) => proposal.status === 'pending')
  const [error, setError] = useState('')
  async function decide(id, decision) { setError(''); try { await bridge.identity.decide(id, decision); await onChanged() } catch (err) { setError(errorMessage(err)) } }
  return <div className="v4-manage-panel">{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}{pending.length ? pending.map((proposal) => <article className="v4-identity" key={proposal.id}><span>{proposal.strength === 'strong' ? 'Strong cross-source match' : 'Needs your judgment'}</span><h3>Are these all {proposal.proposedName}?</h3>{proposal.identities.map((identity) => <p key={identity.id}><b>{friendly(identity.sourceType)}</b><strong>{identity.displayName}</strong><small>{identity.handle || 'Name only'}</small></p>)}<ul>{proposal.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><div><button className="v4-primary" onClick={() => decide(proposal.id, 'merge')}>Yes, one person</button><button className="v4-outline" onClick={() => decide(proposal.id, 'separate')}>Keep separate</button></div></article>) : <div className="v4-empty-panel"><CheckCircle2 /><h3>No identities need review</h3><p>Nearness only joins sources after source evidence or your confirmation.</p></div>}</div>
}

function AnalysisSettings({ keyConfigured, onChanged }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(keyConfigured ? 'A protected key is configured.' : '')
  const [error, setError] = useState('')
  async function save() { setBusy(true); setError(''); try { if (key) await bridge.analysis.saveKey(key); const result = await bridge.analysis.testKey(); setKey(''); setStatus(`${result.model} is ready.`); await onChanged() } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }
  return <div className="v4-manage-panel"><div className="v4-local-note"><ShieldCheck /><p><strong>AI is optional and per relationship.</strong> Nearness shows the redacted payload and asks for consent before every portrait.</p></div>{error ? <Notice>{error}</Notice> : null}{status ? <Notice>{status}</Notice> : null}<label><span>OpenAI API key</span><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={keyConfigured ? 'Enter a replacement key' : 'sk-…'} autoComplete="off" /><small>Stored in macOS Keychain—not in the Nearness vault or exports.</small></label><button className="v4-primary" disabled={busy || (!key && !keyConfigured)} onClick={save}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />}{keyConfigured && !key ? 'Test configured key' : 'Save and test'}</button></div>
}

function SourcesPanel({ sources, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function remove(source) { if (!window.confirm(`Remove ${source.label} and everything imported from it?`)) return; setBusy(source.id); setError(''); try { await bridge.sources.delete(source.id); await onChanged() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') } }
  return <div className="v4-manage-panel">{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}{sources.length ? <div className="v4-source-manage">{sources.map((source) => <article key={source.id}><Layers3 /><div><strong>{source.label}</strong><small>{friendly(source.type)} · {number(source.messageCount)} messages · imported {fullDate(source.importedAt)}</small></div><button aria-label={`Remove ${source.label}`} disabled={busy === source.id} onClick={() => remove(source)}>{busy === source.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button></article>)}</div> : <div className="v4-empty-panel"><Layers3 /><h3>No sources yet</h3><p>Add one conversation to begin.</p></div>}</div>
}

function PrivacyPanel({ onDeleted }) {
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  async function exportArchive() { setError(''); try { const result = await bridge.privacy.export(); if (result.saved) setStatus(`Saved to ${result.path}`) } catch (err) { setError(errorMessage(err)) } }
  async function deleteAll() { setError(''); try { await bridge.privacy.deleteAll(confirmation); await onDeleted() } catch (err) { setError(errorMessage(err)) } }
  return <div className="v4-manage-panel">{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}{status ? <Notice>{status}</Notice> : null}<section className="v4-privacy-action"><Download /><div><h3>Export your Nearness archive</h3><p>Save a readable copy of your relationship context, sources and observations.</p></div><button className="v4-outline" onClick={exportArchive}>Choose location</button></section><section className="v4-privacy-action danger"><Trash2 /><div><h3>Delete the entire local vault</h3><p>This removes imported messages, people, portraits and Care actions from this Mac.</p><label><span>Type DELETE MY NEARNESS VAULT</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label></div><button className="v4-danger" disabled={confirmation !== 'DELETE MY NEARNESS VAULT'} onClick={deleteAll}>Delete everything</button></section></div>
}

function ManageSheet({ data, initialTab = 'you', onClose, onChanged }) {
  const [tab, setTab] = useState(initialTab)
  const tabs = [['you', 'You'], ['identities', `Identity${data.proposals?.some((item) => item.status === 'pending') ? ' •' : ''}`], ['analysis', 'Private AI'], ['sources', 'Sources'], ['privacy', 'Privacy']]
  return <Sheet title="Manage Nearness" detail="One place for context, sources, analysis and privacy." onClose={onClose} className="v4-manage-sheet"><nav className="v4-manage-tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>{tab === 'you' ? <ProfilePanel profile={data.relationalSelf} onSaved={onChanged} /> : null}{tab === 'identities' ? <IdentityPanel proposals={data.proposals || []} onChanged={onChanged} /> : null}{tab === 'analysis' ? <AnalysisSettings keyConfigured={data.keyConfigured} onChanged={onChanged} /> : null}{tab === 'sources' ? <SourcesPanel sources={data.sources || []} onChanged={onChanged} /> : null}{tab === 'privacy' ? <PrivacyPanel onDeleted={onChanged} /> : null}</Sheet>
}

function Welcome({ data, refresh }) {
  const [addOpen, setAddOpen] = useState(false)
  const [importState, setImportState] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)
  async function enter() { await bridge.finishOnboarding(); await bridge.care.rebuild(); await refresh() }
  return <div className="v4-welcome"><header><span>Nearness</span><div><LockKeyhole />Private to you</div></header><main><section><h1>See your life through the people in it.</h1><p>Bring in WhatsApp or Messages history. Nearness keeps it on your Mac and lets you add the context no archive can know—without ranking people.</p>{data.hasData ? <><button className="v4-add large" onClick={() => setManageOpen(true)}><UserRound />Tell Nearness about me</button><button className="v4-outline v4-enter" onClick={enter}>Open my world <ArrowRight /></button></> : <button className="v4-add large" onClick={() => setAddOpen(true)}><span>+</span>Add chats</button>}<small>{data.hasData ? `${number(data.messageCount)} messages are ready. You can refine context later.` : 'Start with one export. You can remove it later.'}</small></section><img src={treeArt} alt="Two chairs waiting beneath a tree" /></main>{addOpen ? <AddChatsSheet data={data} onClose={() => setAddOpen(false)} onImport={(kind, preview) => setImportState({ kind, preview })} /> : null}{importState ? <ImportFlow kind={importState.kind} initialPreview={importState.preview} onClose={() => setImportState(null)} onChanged={async () => { await refresh(); setAddOpen(false) }} /> : null}{manageOpen ? <ManageSheet data={data} onClose={() => setManageOpen(false)} onChanged={refresh} /> : null}</div>
}

export default function ProductApp() {
  const [data, setData] = useState(null)
  const [view, setView] = useState('world')
  const [selectedId, setSelectedId] = useState(null)
  const [storyId, setStoryId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [manageTab, setManageTab] = useState('you')
  const [importState, setImportState] = useState(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const next = await bridge.bootstrap()
      setData(next)
      setSelectedId((current) => current && next.people.some((person) => person.id === current) ? current : next.people[0]?.id || null)
      setVersion((value) => value + 1); setError('')
    } catch (err) { setError(errorMessage(err)) }
  }

  function openManage(tab = 'you') { setManageTab(tab); setManageOpen(true) }
  useEffect(() => { refresh() }, [])
  if (!data) return <LoadingScreen />
  if (!data.onboardingComplete) return <Welcome data={data} refresh={refresh} />
  return <div className="v4-app"><AppHeader view={view} onView={setView} onAddChats={() => setAddOpen(true)} onManage={() => openManage('you')} />{error ? <Notice onClose={() => setError('')}>{error}</Notice> : null}{view === 'care' ? <CareView data={data} refresh={refresh} onPeople={() => setPeopleOpen(true)} /> : data.people.length ? <WorldHome data={data} selectedId={selectedId} version={version} onSelect={setSelectedId} onStory={setStoryId} onPeople={() => setPeopleOpen(true)} /> : <EmptyWorld onAddChats={() => setAddOpen(true)} />}{storyId ? <PersonStory personId={storyId} version={version} keyConfigured={data.keyConfigured} onClose={() => setStoryId(null)} onChanged={refresh} onOpenManage={() => { setStoryId(null); openManage('analysis') }} /> : null}{peopleOpen ? <PeopleSheet people={data.people} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setStoryId(id) }} onClose={() => setPeopleOpen(false)} /> : null}{manageOpen ? <ManageSheet data={data} initialTab={manageTab} onClose={() => setManageOpen(false)} onChanged={refresh} /> : null}{addOpen ? <AddChatsSheet data={data} onClose={() => setAddOpen(false)} onImport={(kind, preview) => setImportState({ kind, preview })} /> : null}{importState ? <ImportFlow kind={importState.kind} initialPreview={importState.preview} onClose={() => setImportState(null)} onChanged={async () => { await refresh(); setAddOpen(false) }} /> : null}</div>
}
