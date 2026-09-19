import JASSUB from 'jassub'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import { writable } from 'simple-store-svelte'
import { get } from 'svelte/store'

import { loadCustomSubtitleFont } from './custom-subtitle-font'
import { shiftAssDialogue, type SubtitleCue } from './subtitle-alignment'
import { TIMING_LIMITS, dialogueCue, type TimingResult, type ReferenceWindow } from './subtitle-matcher'
import { readSubtitleMemory, writeSubtitleMemory, matchesSubtitlePreference, normalizeSubtitleLanguage, subtitlePairKey, exactSubtitleKey, subtitleFingerprint, safeSubtitleGap, type SubtitlePreference } from './subtitle-preferences'
import { isMixedChineseJapaneseSubtitle, subtitleReleaseProfile, type SubtitleAlignmentStatus } from './subtitle-profiles'
import TimingWorker from './subtitle-timing.worker?worker'

import type { ResolvedFile } from './resolver'
import type { SubtitleSampleEvent, SubtitlePlaybackContext } from './subtitle-sampling-types'
import type { MediaInfo } from './util'
import type { ASSEvent, ASSStyle } from 'jassub/dist/worker/util'
import type { SubtitleTrack, TorrentFile } from 'native'

import { extensions } from '$lib/modules/extensions'
import { createMiningCue, findActiveMiningCues, findMiningCueAt, parseAssMiningCues, sortAndDeduplicateMiningCues, type MiningCue } from '$lib/modules/mining/subtitle'
import native from '$lib/modules/native'
import { type defaults, settings } from '$lib/modules/settings'
import { anitomyscript, fontRx, HashMap, subRx, subtitleExtensions, toTS } from '$lib/utils'

const defaultHeader = `[Script Info]
Title: English (US)
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, Roboto Medium,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2.6,0,2,20,20,46,1
[Events]

`

type SubtitleStyle = typeof defaults.subtitleStyle
type StyleOverride = Pick<ASSStyle, 'FontName' |'Spacing' | 'ScaleX'>

const STYLE_OVERRIDES: Record<Exclude<SubtitleStyle, 'custom'>, StyleOverride> = {
  none: {
    FontName: 'Roboto Medium',
    Spacing: 0,
    ScaleX: 1
  },
  gandhisans: {
    FontName: 'Gandhi Sans',
    Spacing: 0.2,
    ScaleX: 0.98
  },
  notosans: {
    FontName: 'Noto Sans',
    Spacing: 0,
    ScaleX: 0.99
  },
  roboto: {
    FontName: 'Roboto Medium',
    Spacing: 0,
    ScaleX: 1
  }
}

function subtitleStyleOverride (style: SubtitleStyle, customFontName: string): StyleOverride {
  if (style === 'custom') {
    return {
      FontName: customFontName || 'Roboto Medium',
      Spacing: 0,
      ScaleX: 1
    }
  }
  return STYLE_OVERRIDES[style]
}

const AVAILABLE_FONTS = {
  'Roboto Medium': '/Roboto.woff2',
  'Gandhi Sans': '/GandhiSans-Bold.woff2',
  'Noto Sans': '/NotoSans-Bold.woff2',
  'Noto Sans JP Bold': '/NotoSansJP.woff2',
  'Noto Sans KR Bold': '/NotoSansKR.woff2',
  'Noto Sans HK': '/NotoSansHK.woff2'
}

const LANGUAGE_OVERRIDES: Record<string, string> = {
  jpn: 'Noto Sans JP Bold',
  kor: 'Noto Sans KR Bold',
  chi: 'Noto Sans HK',
  ja: 'Noto Sans JP Bold',
  ko: 'Noto Sans KR Bold',
  zh: 'Noto Sans HK'
}

function detectCJKLanguage (str: string) {
  const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/
  const koreanRegex = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]/
  const chineseRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/

  for (let i = 0; i < str.length; i += 10000) {
    const chunk = str.slice(i, i + 10000)

    if (japaneseRegex.test(chunk)) return 'jpn'
    if (koreanRegex.test(chunk)) return 'kor'
    if (chineseRegex.test(chunk)) return 'chi'
  }

  return null
}

function externalSubtitleLanguage (filename: string, header: string) {
  const names: Record<string, string> = { en: 'eng', eng: 'eng', english: 'eng', ja: 'jpn', jp: 'jpn', jpn: 'jpn', japanese: 'jpn', ko: 'kor', kor: 'kor', korean: 'kor', zh: 'chi', chi: 'chi', zho: 'chi', chinese: 'chi', es: 'spa', spa: 'spa', spanish: 'spa', fr: 'fra', fre: 'fra', fra: 'fra', french: 'fra', de: 'deu', ger: 'deu', deu: 'deu', german: 'deu' }
  const tokens = filename.toLowerCase().split(/[^a-z]+/)
  const tag = tokens.map(token => names[token]).find(Boolean)
  if (tag) return tag
  const dialogue = parseAssMiningCues(header, 'language').map(cue => cue.plainText).join('\n')
  return detectCJKLanguage(dialogue) ?? 'und'
}

const stylesRx = /^Style:[^,]*/gm

interface ExternalSubtitleState {
  originalHeader: string
  cues: SubtitleCue[]
  profile?: string
  offset: number
  verifiedOffset?: number
  fingerprint: string
  preference: SubtitlePreference
  rank: number
}

interface SubtitleTrackState {
  events: HashMap<{ text: string, time: number, duration: number, style?: string }, ASSEvent>
  miningEvents: Map<string, MiningCue>
  meta: SubtitleTrack
  styles: Record<string | number, number>
}

export default class Subtitles {
  video?: HTMLVideoElement
  canvas?: HTMLCanvasElement
  selected: ResolvedFile
  fonts: Array<string | Uint8Array>
  customFontReady: Promise<void>
  customFontUrl: string | undefined
  customFontFamily: string | undefined
  jassub: JASSUB | null = null
  current = writable<number | string>(-1)
  alignmentStatus = writable<SubtitleAlignmentStatus>('hidden')
  timingLog: Array<{ time: string, message: string }> = []
  timingResults: Array<TimingResult & { id: string, references?: Array<TimingResult & { referenceIndex: number }> }> = []
  preparedTimingTracks = new Set<string>()
  timingStartedAt: number | undefined
  timingReferenceNames: string[] = []
  timingElapsedMs = 0
  timingError: string | undefined

  logTiming (message: string) {
    if (this.destroyed || this.timingLog.at(-1)?.message === message) return
    this.timingLog.push({ time: new Date().toISOString(), message: message.slice(0, 2000) })
    if (this.timingLog.length > 200) this.timingLog.shift()
  }

  getTimingDiagnostics () {
    const active = String(this.current.value)
    const language = normalizeSubtitleLanguage(this.identities.get(active)?.language ?? this.preference?.language ?? this.set.subtitleLanguage)
    const candidates = [...this.externalTracks.entries()].map(([id, state]) => ({
      id,
      name: this._tracks.value[id]?.meta.name ?? id,
      source: state.preference.source,
      language: state.preference.language,
      profile: state.profile,
      fingerprint: state.fingerprint,
      cues: state.cues.length,
      offset: state.offset,
      verifiedOffset: state.verifiedOffset,
      active: id === active,
      preferred: matchesSubtitlePreference(this.preference, state.preference),
      sameLanguage: state.preference.language === language,
      rank: state.rank,
      result: this.timingResults.find(result => result.id === id)
    }))
    const reason = !this.set.subtitleAutoRetiming
      ? 'Automatic timing is disabled.'
      : Number(active) === -1
        ? 'Subtitles are off.'
        : this.manualLock
          ? 'A manual selection or timing adjustment suspended automatic timing. Use Retry to allow automatic changes again.'
          : this.earlyTiming
            ? 'An early offset is active. Independent windows are still being checked; it is not saved as verified.'
            : this.frozen
              ? 'Timing is verified and frozen for this episode.'
              : this.pending
                ? 'Waiting for a subtitle-free interval to apply the change.'
                : !candidates.some(candidate => candidate.sameLanguage)
                    ? 'No external subtitle candidate matches the selected language. Embedded tracks provide reference timing; they are not retimed against themselves.'
                    : this.alignmentStatus.value === 'unavailable'
                      ? 'No reliable constant offset was verified. Inspect sampling and window results below.'
                      : this.waitingForSampleBuffer
                        ? 'Sampling needs pieces that are not downloaded yet. Downloads will resume with 30 seconds buffered; Retry can recheck downloaded data while paused.'
                        : !this.sampleId && !this.sampleDone && !this.samplingReady()
                            ? 'Checking already-downloaded pieces; new downloads wait for the playback buffer.'
                            : this.sampleDone
                              ? 'Sampling finished; evaluating candidate results.'
                              : this.playback.stalled || (this.playback.buffered ?? 0) < 15
                                ? 'Sampling downloads suspended while playback needs data.'
                                : 'Collecting embedded references and comparing candidates.'
    return {
      revision: 'downloaded-first-v5-early-evidence',
      status: this.alignmentStatus.value,
      reason,
      error: this.timingError,
      video: this.selected.name,
      videoIdentity: this.videoIdentity,
      videoProfile: this.videoProfile,
      language,
      preferred: this.preference,
      active,
      manualDelay: this.manualDelay.value,
      playback: { ...this.playback },
      paused: this.paused,
      seeking: this.seeking,
      candidates,
      candidateLoading: this.candidateLoading,
      candidateDiscoveryDone: this.candidateDiscoveryDone,
      sessionId: this.sampleId ?? this.sample?.sessionId,
      elapsedMs: this.timingStartedAt ? (this.sampleId && !this.sampleDone ? Date.now() - this.timingStartedAt : this.timingElapsedMs) : 0,
      sampleDone: this.sampleDone,
      sample: this.sample,
      results: this.timingResults,
      referenceNames: [...this.timingReferenceNames],
      earlyTiming: this.earlyTiming,
      log: [...this.timingLog]
    }
  }

  set = get(settings)
  embeddedTracks = new Set<string>()
  loadedFiles = new Set<string>()
  fileTracks = new Map<string, string>()
  fileLoads = new Map<string, Promise<void>>()
  externalTracks = new Map<string, ExternalSubtitleState>()
  memory = readSubtitleMemory()
  manualDelay = writable(0)
  videoIdentity: string
  videoProfile: string | undefined
  preference: SubtitlePreference | null
  identities = new Map<string, SubtitlePreference>()
  destroyed = false
  downloads = new AbortController()
  selectionRevision = 0
  manualLock = false
  frozen = false
  writingCurrent = false
  worker: Worker | undefined
  workerSequence = 0
  sampleId: string | undefined
  sample: SubtitleSampleEvent | undefined
  sampleDone = false
  waitingForSampleBuffer = false
  candidateLoading = 0
  candidateDiscoveryDone = false
  earlyTiming: { track: string, offset: number, previousTrack: string, previousOffset: number } | undefined
  earlyTimingAttempted = false
  earlyTimingTimer: ReturnType<typeof setTimeout> | undefined
  pending: { track: string, offset: number, verified?: boolean, early?: 'apply' | 'revert' } | undefined
  applying = false
  playback: SubtitlePlaybackContext = { time: 0, duration: 0, buffered: 0, stalled: true }
  paused = true
  seeking = false
  lastPlaybackUpdate = 0
  lastAnalysedSignature = ''
  alignmentTimer: ReturnType<typeof setTimeout> | undefined
  mediaId: number
  settingsUnsubscribe: () => void
  miningMode = false
  previousCanvasVisibility: string | undefined
  selectionInitialized = false
  initialSubtitleSelection: typeof defaults.playerSubtitleSelection

  _tracks = writable<Record<number | string, SubtitleTrackState>>({})
  miningRevision = writable(0)
  miningCueCache = new Map<string, { revision: number, cues: MiningCue[] }>()

  constructor (video: HTMLVideoElement | undefined, otherFiles: TorrentFile[], mediaInfo: MediaInfo, canvas?: HTMLCanvasElement) {
    this.video = video
    this.canvas = canvas
    this.selected = mediaInfo.file
    this.mediaId = mediaInfo.media.id
    this.videoIdentity = `${this.selected.hash}:${this.selected.id}`
    const parsedVideo = this.selected.metadata.parseObject
    const release = subtitleReleaseProfile(this.selected.name, parsedVideo)
    this.videoProfile = release ? JSON.stringify([release, parsedVideo.source, parsedVideo.video_resolution, parsedVideo.video_term, parsedVideo.audio_term]) : undefined
    this.preference = this.memory.shows[String(this.mediaId)] ?? this.set.playerSubtitleSelection
    this.initialSubtitleSelection = this.preference
    this.fonts = [...otherFiles.filter(file => fontRx.test(file.name)).map(file => file.url)]
    this.customFontReady = loadCustomSubtitleFont().then(font => {
      if (!font || this.destroyed) return
      this.customFontUrl = URL.createObjectURL(new Blob([font.data.buffer as ArrayBuffer], { type: font.type || 'font/ttf' }))
      this.fonts.push(this.customFontUrl)
      const family = font.family
      this.customFontFamily = family
      if (family && this.set.subtitleCustomFontName !== family) {
        settings.update(set => ({ ...set, subtitleCustomFontName: family }))
      }
    })

    this.current.subscribe(value => {
      if (!this.writingCurrent && this.selectionInitialized) this.selectCaptions(value, true).catch(console.error)
    })

    this.settingsUnsubscribe = settings.subscribe(set => {
      const autoRetimingChanged = this.set.subtitleAutoRetiming !== set.subtitleAutoRetiming
      this.set = set
      this._applyStyleOverride(set.subtitleStyle)
      if (autoRetimingChanged) this.resetAutomaticTiming(set.subtitleAutoRetiming).catch(console.error)
    })

    const subFiles = otherFiles.filter(({ name }) => subRx.test(name))

    const cachedFiles = native.subtitleCacheList(this.selected.hash, this.selected.id).catch(error => { console.error('Subtitle cache read failed', error); return [] })
    const restoredFiles = cachedFiles.then(async files => {
      for (const file of files.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))) {
        if (this.destroyed) return
        await this.addSingleSubtitleFile(new File([file.text], file.name), file.source, file.profile, file.rank, false)
      }
    })
    const fetchSubtitleFile = async (file: { url: string, name: string }) => {
      this.logTiming('Downloading candidate: ' + file.name)
      const res = await fetch(file.url, { signal: AbortSignal.any([this.downloads.signal, AbortSignal.timeout(15000)]) })
      if (!res.ok) throw new Error(`Subtitle download failed: ${res.status}`)
      const blob = await res.blob()
      return new File([blob], file.name)
    }

    const fetchAndLoad = async (file: { url: string, name: string, extension?: string }) => {
      await this.addSingleSubtitleFile(await fetchSubtitleFile(file), file.extension)
    }

    extensions.subtitlesQuery(mediaInfo.media, mediaInfo.episode).then(async results => {
      await restoredFiles
      results = results.filter(result => {
        if (!isMixedChineseJapaneseSubtitle(result.language)) return true
        this.logTiming('Excluded mixed Chinese/Japanese subtitle: ' + result.language)
        return false
      })
      const jimaku = results.filter(({ extension, language }) => extension === 'jimaku' && !this.loadedFiles.has(extension + ':' + language))
      const otherResults = results.filter(({ extension, language }) => extension !== 'jimaku' && !this.loadedFiles.has(extension + ':' + language))
      this.candidateLoading += otherResults.length
      const otherDownloads = otherResults.map(async ({ url, language, extension }) => {
        try { await fetchAndLoad({ url, name: language, extension }) } catch (error) { console.error(error); this.logTiming('Candidate download/load failed: ' + String(error)) } finally {
          this.candidateLoading--
          this.scheduleAlignment()
        }
      })

      if (!jimaku.length) { await Promise.allSettled(otherDownloads); return }
      const parsed = await anitomyscript(jimaku.map(({ language }) => language))
      const candidates = jimaku.map((value, index) => ({
        value,
        filename: value.language,
        profile: subtitleReleaseProfile(value.language, parsed[index] ?? {}),
        episodeNumbers: parsed[index]?.episode_number ?? [],
        index
      }))
      const playingMultiEpisode = mediaInfo.file.metadata.parseObject.episode_number.length > 1
      const ranked = candidates.sort((a, b) =>
        Number(!playingMultiEpisode && a.episodeNumbers.length > 1) - Number(!playingMultiEpisode && b.episodeNumbers.length > 1) ||
        Number(b.profile === this.preference?.profile) - Number(a.profile === this.preference?.profile) ||
        Number(this.hasCompatibleHistory(b.profile)) - Number(this.hasCompatibleHistory(a.profile)) || a.index - b.index
      ).slice(0, 5)
      this.candidateLoading += ranked.length
      await Promise.allSettled([...otherDownloads, ...ranked.map(async (candidate, rank) => {
        try {
          const file = await fetchSubtitleFile({ url: candidate.value.url, name: candidate.value.language })
          if (!this.destroyed) await this.addSingleSubtitleFile(file, 'jimaku', candidate.profile, rank)
        } catch (error) { console.error(error); this.logTiming('Candidate download/load failed: ' + String(error)) } finally {
          this.candidateLoading--
          this.scheduleAlignment()
        }
      })])
    }).catch(error => { console.error(error); this.logTiming('Candidate discovery failed: ' + String(error)) }).finally(() => {
      this.logTiming('Candidate discovery finished')
      this.candidateDiscoveryDone = true
      this.scheduleAlignment()
    })

    if (subFiles.length === 1) {
      fetchAndLoad(subFiles[0]!).catch(console.error)
    } else if (subFiles.length > 1) {
      const videoName = mediaInfo.file.name.substring(0, mediaInfo.file.name.lastIndexOf('.')) || mediaInfo.file.name
      for (const file of subFiles) {
        if (file.name.includes(videoName)) {
          fetchAndLoad(file).catch(console.error)
        }
      }
    }

    const tracks = native.tracks(this.selected.hash, this.selected.id).then(async tracklist => {
      for (const track of tracklist) {
        this.embeddedTracks.add(String(track.number))
        const newtrack = this.track(track.number)
        newtrack.styles.Default = 0
        if (track.header?.startsWith('[Script Info]')) track.type = 'ass'
        track.header ??= defaultHeader
        newtrack.meta = track
        const styleMatches = track.header.match(stylesRx)
        if (!styleMatches) continue
        for (let i = 0; i < styleMatches.length; ++i) {
          newtrack.styles[styleMatches[i]!.replace('Style:', '').trim()] = i + 1
        }
      }
      if (this.destroyed) return
      for (const [id, track] of Object.entries(this._tracks.value)) {
        if (this.embeddedTracks.has(id)) this.identities.set(id, { off: false, source: 'embedded', language: normalizeSubtitleLanguage(track.meta.language), profile: track.meta.name?.trim().toLowerCase() || undefined, forced: track.meta.forced, name: track.meta.name, number: String(track.meta.number) })
      }
      await this.initSubtitleRenderer()

      const tracks = Object.entries(this._tracks.value)
      if (!tracks.length) return
      if (this.manualLock || this.frozen) return
      this.selectionInitialized = true
      const previousSelection = this.initialSubtitleSelection
      if (previousSelection?.off) {
        this.initialSubtitleSelection = null
        return await this.selectCaptions(-1)
      }

      const matchesLast = previousSelection && tracks.filter(([_, { meta }]) =>
        matchesSubtitlePreference(this.preference, this.identities.get(String(meta.number)) ?? { off: false, language: meta.language, name: meta.name })
      )
      if (previousSelection && matchesLast?.length) {
        this.initialSubtitleSelection = null
        if (matchesLast.length === 1) return await this.restoreInitialTrack(matchesLast[0]![0])

        const matchesLastNumber = matchesLast.find(([_, { meta }]) => meta.number === previousSelection.number)
        if (matchesLastNumber) return await this.restoreInitialTrack(matchesLastNumber[0])
        return await this.restoreInitialTrack(matchesLast[0]![0])
      }

      if (this.current.value !== -1) return
      if (!this.set.subtitleLanguage) return // if lang set to none dont autoselect
      if (tracks.length === 1) return await this.selectCaptions(tracks[0]![0])

      const audioLanguage = this.set.audioLanguage

      const selectDesired = async (filteredTracks: typeof tracks) => {
        if (filteredTracks.length === 1) return await this.selectCaptions(filteredTracks[0]![0])

        const [desired] =
          // forced for the curent audio lang
          filteredTracks.find(([_, { meta }]) => {
            return meta.language === audioLanguage && meta.forced
          }) ??
          // non-forced for not the current audio lang
          filteredTracks.find(([_, { meta }]) => {
            return meta.language !== audioLanguage && !meta.forced
          }) ??
          // default
          filteredTracks.find(([_, { meta }]) => meta.default) ??
          filteredTracks[0]!

        return await this.selectCaptions(desired)
      }

      const wantedLanguages = tracks.filter(([_, { meta }]) => (meta.language ?? 'eng') === this.set.subtitleLanguage)
      if (wantedLanguages.length) {
        return await selectDesired(wantedLanguages)
      }

      const englishFallback = tracks.filter(([_, { meta }]) => (meta.language ?? 'eng') === 'eng')
      if (englishFallback.length) {
        return await selectDesired(englishFallback)
      }

      await this.selectCaptions(tracks[0]![0])
    }).catch(console.error)

    native.subtitles(this.selected.hash, this.selected.id, async (subtitle: { text: string, time: number, duration: number, style?: string, name?: string, readOrder?: number }, trackNumber) => {
      await tracks
      if (this.destroyed) return
      const { events, miningEvents, meta, styles } = this.track(trackNumber)
      if (events.has(subtitle)) return
      const event = this.constructSub(subtitle, meta.type !== 'ass', events.size, styles[subtitle.style ?? 'Default'] ?? 0)
      events.add(subtitle, event)
      const miningCue = createMiningCue({
        trackId: String(trackNumber),
        start: event.Start / 1000,
        end: (event.Start + event.Duration) / 1000,
        readOrder: event.ReadOrder,
        style: subtitle.style,
        speaker: subtitle.name,
        rawText: subtitle.text
      })
      if (miningCue) {
        miningEvents.set(miningCue.id, miningCue)
        this.miningRevision.value++
      }

      if (Number(this.current.value) === trackNumber) {
        await this.jassub?.ready
        if (this.jassub?._destroyed) return
        this.jassub?.renderer.createEvent(event)
      }
    }).catch(console.error)

    native.attachments(this.selected.hash, this.selected.id).then(async attachments => {
      const filtered = attachments.filter(attachment => (fontRx.test(attachment.filename) || attachment.mimetype.toLowerCase().includes('font')) && !this.fonts.includes(attachment.url))
      const urls = filtered.map(a => a.url)
      this.fonts.push(...urls)
      await this.jassub?.ready
      if (this.jassub?._destroyed) return
      await this.jassub?.renderer.addFonts(urls)
    }).catch(console.error)
  }

  async handleTransfer (e: { dataTransfer?: DataTransfer | null, clipboardData?: DataTransfer | null } & Event) {
    e.preventDefault()
    const promises = [...(e.dataTransfer ?? e.clipboardData)!.items].map(item => {
      const type = item.type
      return new Promise<File>(resolve => item.kind === 'string' ? item.getAsString(text => resolve(new File([text], 'Subtitle.txt', { type }))) : resolve(item.getAsFile()!))
    })

    for (const file of await Promise.all(promises)) {
      if (subRx.test(file.name)) this.addSingleSubtitleFile(file, 'local', undefined, 0, true, true)
    }
  }

  pickFile () {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = subtitleExtensions.map(ext => '.' + ext).join(',')
    input.multiple = true
    input.addEventListener('change', () => {
      for (const file of input.files ?? []) {
        if (subRx.test(file.name)) this.addSingleSubtitleFile(file, 'local', undefined, 0, true, true)
      }
    })
    input.click()
  }

  async addSingleSubtitleFile (file: File, source = 'local', profile?: string, rank = 0, persist = true, explicit = false) {
    const key = source + ':' + file.name
    const previous = this.fileLoads.get(key) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(() => this.loadSubtitleFile(file, source, profile, rank, persist, explicit))
    this.fileLoads.set(key, operation)
    try { await operation } finally { if (this.fileLoads.get(key) === operation) this.fileLoads.delete(key) }
  }

  async loadSubtitleFile (file: File, source: string, profile: string | undefined, rank: number, persist: boolean, explicit: boolean) {
    const fileKey = source + ':' + file.name
    if (isMixedChineseJapaneseSubtitle(file.name)) {
      this.logTiming('Excluded mixed Chinese/Japanese subtitle: ' + file.name)
      return
    }
    if (this.destroyed || (!explicit && this.loadedFiles.has(fileKey))) return
    const dot = file.name.lastIndexOf('.')
    const extension = file.name.substring(dot + 1).toLowerCase()
    if (!subtitleExtensions.includes(extension)) return
    const filename = file.name.slice(0, dot)
    // sub name could contain video name with or without extension, possibly followed by lang, or not.
    const name = filename.includes(this.selected.name)
      ? filename.replace(this.selected.name, '')
      : filename.replace(this.selected.name.slice(0, this.selected.name.lastIndexOf('.')), '')

    const originalText = await file.text()
    const convert = Subtitles.convertSubText(originalText, extension)
    if (!convert) return
    const { header, type } = convert
    const fingerprint = await subtitleFingerprint(header)
    if (this.destroyed) return
    profile ??= subtitleReleaseProfile(file.name, (await anitomyscript([file.name]))[0] ?? {})
    if (this.destroyed) return
    const previousTrack = explicit ? this.fileTracks.get(fileKey) : undefined
    if (previousTrack && this.externalTracks.get(previousTrack)?.fingerprint === fingerprint) {
      await this.selectCaptions(previousTrack, true)
      return
    }
    if (!explicit && this.loadedFiles.has(fileKey)) return
    this.loadedFiles.add(fileKey)
    if (persist) native.subtitleCachePut(this.selected.hash, this.selected.id, { name: file.name, source, profile, rank, text: originalText }).catch(error => console.error('Subtitle cache write failed', error))
    const exact = this.memory.exact[exactSubtitleKey(this.videoIdentity, fingerprint)]
    const offset = this.set.subtitleAutoRetiming ? exact?.offset ?? 0 : 0
    const activeHeader = shiftAssDialogue(header, offset)
    // lets hope there's no more than 1000 subtitle tracks in a file
    const trackNumber = previousTrack ?? 1000 + Object.keys(this._tracks.value).length
    this.fileTracks.set(fileKey, String(trackNumber))
    const newtrack = this.track(trackNumber)
    newtrack.styles.Default = 0
    newtrack.meta = { type, header: activeHeader, number: '' + trackNumber, name, language: externalSubtitleLanguage(file.name, header), _compressed: false, default: false, forced: false }
    this.miningRevision.value++
    this.externalTracks.set(String(trackNumber), {
      originalHeader: header,
      cues: parseAssMiningCues(header, String(trackNumber)).filter(cue => dialogueCue(cue.rawText, cue.style)).map(cue => ({ start: cue.start, end: cue.end, text: cue.plainText })),
      profile,
      offset,
      verifiedOffset: this.set.subtitleAutoRetiming ? exact?.offset : undefined,
      fingerprint,
      preference: { off: false, source, language: normalizeSubtitleLanguage(newtrack.meta.language), profile, forced: false, name, number: String(trackNumber) },
      rank
    })
    this.logTiming(`Candidate loaded: ${name}; ${newtrack.meta.language}; ${profile ?? 'unknown release'}; ${this.externalTracks.get(String(trackNumber))!.cues.length} dialogue cues`)
    this.identities.set(String(trackNumber), this.externalTracks.get(String(trackNumber))!.preference)
    const styleMatches = header.match(stylesRx)
    if (styleMatches) {
      for (let i = 0; i < styleMatches.length; ++i) {
        newtrack.styles[styleMatches[i]!.replace('Style:', '').trim()] = i + 1
      }
    }
    if (explicit) {
      await this.initSubtitleRenderer()
      this.selectionInitialized = true
      await this.selectCaptions(trackNumber, true)
      return
    }
    const previousSelection = this.initialSubtitleSelection
    const matchesPrevious = !this.manualLock && matchesSubtitlePreference(this.preference, this.identities.get(String(trackNumber))!)
    if (previousSelection?.off || matchesPrevious) {
      await this.initSubtitleRenderer()
      this.selectionInitialized = true
      if (matchesPrevious) {
        this.initialSubtitleSelection = null
        await this.restoreInitialTrack(String(trackNumber))
      }
      return
    }
    const desiredLanguage = normalizeSubtitleLanguage(this.preference?.language ?? this.set.subtitleLanguage)
    const currentLanguage = this.identities.get(String(this.current.value))?.language
    if (!this.manualLock && !this.frozen && !this.preference?.off && (this.current.value === -1 || (newtrack.meta.language === desiredLanguage && currentLanguage !== desiredLanguage))) {
      await this.initSubtitleRenderer()
      this.selectionInitialized = true
      await this.restoreInitialTrack(String(trackNumber))
    }
    this.scheduleAlignment()
  }

  async restoreInitialTrack (track: string) {
    if (this.manualLock || this.frozen) return
    if (Number(this.current.value) === -1) return await this.selectCaptions(track)
    this.pending = { track, offset: this.externalTracks.get(track)?.offset ?? 0, verified: false }
    await this.applyPending()
  }

  scheduleAlignment () {
    if (this.destroyed || !this.set.subtitleAutoRetiming || this.manualLock || this.pending || this.alignmentTimer !== undefined || Number(this.current.value) === -1) return
    this.alignmentTimer = setTimeout(() => {
      this.alignmentTimer = undefined
      this.analyseAlignment()
    }, 50)
  }

  stopSampling () {
    if (this.sampleId) {
      this.timingElapsedMs = Date.now() - (this.timingStartedAt ?? Date.now())
      this.logTiming('Sampling session stopped')
    }
    if (this.sampleId) native.subtitleSampleCancel?.(this.sampleId).catch(console.error)
    this.sampleId = undefined
  }

  updatePlayback (context: SubtitlePlaybackContext, paused: boolean, seeking: boolean) {
    const urgent = context.stalled !== this.playback.stalled || ((context.buffered ?? Infinity) < 15) !== ((this.playback.buffered ?? Infinity) < 15) || ((context.buffered ?? Infinity) >= 30) !== ((this.playback.buffered ?? Infinity) >= 30)
    if (urgent && this.sampleId && !this.sampleDone) this.logTiming(`Playback context: ${context.stalled ? 'stalled' : 'ready'}, ${context.buffered?.toFixed(1) ?? 'unknown'}s buffered`)
    this.playback = context
    this.paused = paused
    this.seeking = seeking
    if (this.sampleId && (urgent || Date.now() - this.lastPlaybackUpdate > 500)) {
      this.lastPlaybackUpdate = Date.now()
      native.subtitleSampleUpdate?.(this.sampleId, context).catch(console.error)
    }
    if (!this.sampleId && !this.sampleDone && this.samplingReady()) this.scheduleAlignment()
    this.applyPending().catch(console.error)
  }

  samplingReady () {
    const required = this.playback.duration > this.playback.time ? Math.min(30, this.playback.duration - this.playback.time) : 30
    return !this.playback.stalled && this.playback.buffered !== null && this.playback.buffered >= required
  }

  analyseAlignment () {
    if (this.destroyed || this.manualLock || this.pending || !this.set.subtitleAutoRetiming || Number(this.current.value) === -1) return
    const active = this.identities.get(String(this.current.value))
    const language = normalizeSubtitleLanguage(active?.language ?? this.preference?.language ?? this.set.subtitleLanguage)
    const candidates = [...this.externalTracks.entries()].filter(([, state]) => state.preference.language === language).sort((a, b) =>
      Number(matchesSubtitlePreference(this.preference, b[1].preference)) - Number(matchesSubtitlePreference(this.preference, a[1].preference)) || a[1].rank - b[1].rank
    )
    if (!candidates.length) { this.logTiming(`No external candidate for language ${language}`); return }
    if (!this.sampleId && !this.sampleDone && (!this.waitingForSampleBuffer || this.samplingReady())) {
      this.alignmentStatus.value = this.earlyTiming ? 'provisional' : 'timing'
      // Already verified torrent pieces are usable independently of the player's
      // media buffer. A cache-only pass returns immediately on a missing piece;
      // only a subsequent download-capable session waits for playback reserve.
      const availableOnly = !this.samplingReady()
      this.waitingForSampleBuffer = false
      const id = crypto.randomUUID()
      this.sampleId = id
      this.timingStartedAt = Date.now()
      this.timingError = undefined
      this.logTiming(`Sampling started (${availableOnly ? 'downloaded pieces only' : 'downloads allowed'}): ${id}`)
      this.alignmentStatus.value = this.earlyTiming ? 'provisional' : 'timing'
      if (!native.subtitleSampleStart) { this.timingError = 'Native subtitle sampling is unavailable'; this.logTiming(this.timingError); this.sampleDone = true; this.alignmentStatus.value = 'unavailable'; return }
      native.subtitleSampleStart({ sessionId: id, hash: this.selected.hash, fileId: this.selected.id, playback: this.playback, availableOnly }, event => {
        if (this.destroyed || this.sampleId !== event.sessionId) return
        if (this.pending?.early === 'apply') this.pending = undefined
        this.sample = event
        this.sampleDone = event.done && event.reason !== 'buffering'
        if (event.done && event.reason === 'buffering') {
          this.waitingForSampleBuffer = true
          this.stopSampling()
          this.logTiming('Missing sample pieces; waiting for playback reserve before requesting downloads')
        }
        this.timingElapsedMs = Date.now() - (this.timingStartedAt ?? Date.now())
        this.logTiming(`Sampling ${event.done ? event.reason ?? 'finished' : 'progress'}: ${event.bytesFetched} bytes fetched, ${event.bytesParsed} parsed, ${event.tracks.reduce((sum, track) => sum + track.windows.length, 0)} reference windows`)
        if (event.done) console.debug('Subtitle sampling', JSON.stringify({ reason: event.reason, bytesFetched: event.bytesFetched, bytesParsed: event.bytesParsed, tracks: event.tracks.map(track => ({ id: track.id, name: track.name, windows: track.windows.map(window => ({ start: window.start, end: window.end, cues: window.cues.length })) })) }))
        this.scheduleAlignment()
      }).catch(error => {
        if (this.sampleId !== id || this.destroyed) return
        console.error(error)
        this.timingError = String(error)
        this.logTiming('Sampling failed: ' + this.timingError)
        this.sampleDone = true
        this.alignmentStatus.value = 'unavailable'
        this.withdrawEarlyTiming()
      })
    }
    const references: ReferenceWindow[][] = (this.sample?.tracks ?? []).filter(track => !track.forced && !/sign|karaoke/i.test(track.name ?? '')).map(track => track.windows.map(window => ({ ...window, cues: window.cues.filter(cue => dialogueCue(cue.text, cue.style)) })))
    const signature = JSON.stringify([this.sample?.bytesParsed, candidates.map(([id]) => id), this.sampleDone, this.candidateLoading, this.candidateDiscoveryDone])
    if (signature === this.lastAnalysedSignature) return
    this.lastAnalysedSignature = signature
    this.worker ??= new TimingWorker()
    this.worker.onerror = event => { this.timingError = event.message || 'Matching worker failed'; this.logTiming(this.timingError); this.alignmentStatus.value = 'unavailable'; this.sampleDone = true; this.stopSampling(); this.withdrawEarlyTiming() }
    const analysisStarted = performance.now()
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number, results: Subtitles['timingResults'] }>) => {
      if (this.destroyed || this.manualLock || this.pending || !this.set.subtitleAutoRetiming || data.id !== this.workerSequence) return
      console.debug('Subtitle alignment', JSON.stringify({ elapsedMs: Math.round(performance.now() - analysisStarted), results: data.results.map(({ id, accepted, offset, confidence, reason }) => ({ id, accepted, offset, confidence, reason })) }))
      this.timingResults = data.results
      this.logTiming('Matcher: ' + data.results.map(result => `${this._tracks.value[result.id]?.meta.name ?? result.id}: ${result.reason}${result.offset === undefined ? '' : ` (${result.offset}s)`}`).join('; '))
      const accepted = data.results.filter(result => result.accepted && result.offset !== undefined)
      for (const result of accepted) {
        const state = this.externalTracks.get(result.id)
        if (!state || this.preparedTimingTracks.has(result.id)) continue
        this.preparedTimingTracks.add(result.id)
        if (this.frozen && result.id === String(this.current.value)) continue
        state.verifiedOffset = result.offset
        // Inactive tracks can be prepared immediately without touching the
        // current line. The active track still goes through the safe-gap path.
        if (result.id !== String(this.current.value)) this.applyTrackOffset(result.id, result.offset!)
      }
      // Freeze automatic changes to the current track, but keep evaluating late
      // candidates against the evidence already collected for this episode.
      if (this.frozen) return
      const preferred = accepted.find(result => result.id === this.earlyTiming?.track) ?? accepted.find(result => this.preference
        ? matchesSubtitlePreference(this.preference, this.externalTracks.get(result.id)?.preference ?? { off: false })
        : result.id === candidates[0]?.[0])
      if (!accepted.length && !this.earlyTiming && !this.earlyTimingAttempted && !this.sampleDone) {
        const early = data.results.find(result => result.id === String(this.current.value) && result.earlyOffset !== undefined) ??
          data.results.find(result => result.earlyOffset !== undefined)
        if (early?.earlyOffset !== undefined) {
          this.pending = { track: early.id, offset: early.earlyOffset, verified: false, early: 'apply' }
          this.logTiming(`Strong first-window estimate ${early.earlyOffset}s for ${early.id}; awaiting safe gap`)
          this.applyPending().catch(console.error)
          return
        }
      }
      const earlyResult = data.results.find(result => result.id === this.earlyTiming?.track)
      const earlyRejected = !!this.earlyTiming && !earlyResult?.accepted && (this.sampleDone || earlyResult?.reason === 'inconsistent-windows' || earlyResult?.reason === 'conflicting-references')
      if (earlyRejected && this.earlyTiming && !accepted.length) {
        this.pending = { track: this.earlyTiming.previousTrack, offset: this.earlyTiming.previousOffset, verified: false, early: 'revert' }
        this.logTiming('Early estimate could not be verified; withdrawing it at a safe gap')
        this.applyPending().catch(console.error)
        return
      }
      // A late preferred candidate still gets a chance; failed downloads settle independently.
      const preferredRejected = candidates.filter(([, state]) => matchesSubtitlePreference(this.preference, state.preference)).some(([id]) => data.results.some(result => result.id === id && ['inconsistent-windows', 'conflicting-references'].includes(result.reason)))
      if (!preferred && !earlyRejected && !preferredRejected && (!this.sampleDone || this.candidateLoading || !this.candidateDiscoveryDone)) return
      accepted.sort((a, b) => b.confidence - a.confidence || (this.externalTracks.get(a.id)?.rank ?? 0) - (this.externalTracks.get(b.id)?.rank ?? 0))
      const best = preferred ?? accepted[0]
      if (best?.offset !== undefined) {
        this.logTiming(`Accepted ${best.id} at ${best.offset}s; waiting for a safe application gap`)
        clearTimeout(this.earlyTimingTimer)
        this.pending = { track: best.id, offset: best.offset }
        this.sampleDone = true
        this.stopSampling()
        this.applyPending().catch(console.error)
      } else if (this.sampleDone) this.alignmentStatus.value = 'unavailable'
    }
    this.timingReferenceNames = (this.sample?.tracks ?? []).filter(track => !track.forced && !/sign|karaoke/i.test(track.name ?? '')).map(track => `${track.id}: ${track.name ?? track.language}`)
    this.worker.postMessage({ id: ++this.workerSequence, references, candidates: candidates.map(([id, state]) => ({ id, cues: state.cues })) })
  }

  withdrawEarlyTiming () {
    clearTimeout(this.earlyTimingTimer)
    if (!this.earlyTiming || this.manualLock || this.destroyed) return
    this.pending = { track: this.earlyTiming.previousTrack, offset: this.earlyTiming.previousOffset, verified: false, early: 'revert' }
    this.logTiming('Early offset expired or failed verification; waiting for a safe gap to restore timing')
    this.applyPending().catch(console.error)
  }

  applyTrackOffset (id: string, offset: number) {
    const state = this.externalTracks.get(id)
    const track = this._tracks.value[id]
    if (!state || !track) return
    state.offset = offset
    state.verifiedOffset = offset
    track.meta.header = shiftAssDialogue(state.originalHeader, offset)
    this.miningRevision.value++
    const result = { offset, updatedAt: Date.now() }
    this.memory.exact[exactSubtitleKey(this.videoIdentity, state.fingerprint)] = result
    this.memory.hints[this.pairKey(id)] = result
    writeSubtitleMemory(this.memory)
    this.logTiming(`Prepared verified timing ${offset}s for ${track.meta.name ?? id}`)
  }

  async applyPending () {
    const pending = this.pending
    if (!pending || this.applying || this.manualLock || this.frozen || this.destroyed) return
    const state = this.externalTracks.get(pending.track)
    const track = this._tracks.value[pending.track]
    if (!track || (!state && pending.verified !== false)) return
    const oldCues = this.getMiningCues()
    const nextKey = this.pairKey(pending.track)
    const nextDelay = this.memory.episodes[`${this.videoIdentity}:${nextKey}`] ?? this.memory.manual[nextKey] ?? 0
    const nextCues = state ? parseAssMiningCues(state.originalHeader, pending.track) : this.getMiningCues(pending.track)
    if (!this.paused && !this.seeking && !safeSubtitleGap(oldCues, nextCues, this.playback.time + this.manualDelay.value, pending.offset + this.manualDelay.value - nextDelay)) return
    if (pending.early === 'apply') {
      this.earlyTimingAttempted = true
      this.earlyTiming = { track: pending.track, offset: pending.offset, previousTrack: String(this.current.value), previousOffset: this.externalTracks.get(String(this.current.value))?.offset ?? 0 }
    }
    if (this.earlyTiming && (pending.early === 'revert' || (pending.verified !== false && pending.track !== this.earlyTiming.track))) {
      const earlyState = this.externalTracks.get(this.earlyTiming.track)
      const earlyTrack = this._tracks.value[this.earlyTiming.track]
      if (earlyState && earlyTrack) {
        earlyState.offset = earlyState.verifiedOffset ?? 0
        earlyTrack.meta.header = shiftAssDialogue(earlyState.originalHeader, earlyState.offset)
      }
    }
    this.applying = true
    this.pending = undefined
    this.frozen = pending.verified !== false
    if (state) {
      if (pending.verified !== false) this.applyTrackOffset(pending.track, pending.offset)
      else {
        state.offset = pending.offset
        track.meta.header = shiftAssDialogue(state.originalHeader, pending.offset)
      }
    }
    this.miningRevision.value++
    try {
      await this.selectCaptions(pending.track)
      if (this.destroyed || this.manualLock) return
      if (pending.verified === false) {
        if (pending.early === 'apply') {
          this.earlyTimingTimer = setTimeout(() => this.withdrawEarlyTiming(), TIMING_LIMITS.earlyTimeoutMs)
          this.alignmentStatus.value = 'provisional'
          this.logTiming(`Early offset ${pending.offset}s applied; continuing verification`)
        } else if (pending.early === 'revert') {
          clearTimeout(this.earlyTimingTimer)
          this.earlyTiming = undefined
          this.alignmentStatus.value = this.sampleDone ? 'unavailable' : 'timing'
          this.lastAnalysedSignature = ''
        }
        this.scheduleAlignment()
        return
      }
      if (!state) return
      this.earlyTiming = undefined
      this.alignmentStatus.value = 'confirmed'
      this.logTiming(`Applied ${pending.offset}s to ${track.meta.name ?? pending.track}; automatic timing frozen`)
    } finally { this.applying = false }
  }

  hasCompatibleHistory (profile: string | undefined) {
    if (!profile || !this.videoProfile) return false
    return Object.keys(this.memory.hints).some(key => {
      try {
        const [show, video, source, , , subtitle] = JSON.parse(key)
        return show === this.mediaId && video === this.videoProfile && source === 'jimaku' && subtitle === profile
      } catch { return false }
    })
  }

  pairKey (id = String(this.current.value)) {
    const preference = this.identities.get(id) ?? { off: false }
    return subtitlePairKey(this.mediaId, this.videoIdentity, this.videoProfile, preference, this.externalTracks.get(id)?.fingerprint ?? `embedded:${id}`)
  }

  getTrackTiming (id: string) {
    const state = this.externalTracks.get(id)
    const seconds = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)} s`
    const key = this.pairKey(id)
    const episode = this.memory.episodes[`${this.videoIdentity}:${key}`]
    const saved = this.memory.manual[key]
    const hint = this.memory.hints[key]
    const adjustment = episode !== undefined ? `Episode adjustment · ${seconds(episode)}` : saved !== undefined ? `Saved show adjustment · ${seconds(saved)} · carried across episodes` : undefined
    let label = state ? 'Unverified' : 'Embedded timing'
    let tone = 'neutral'
    if (state?.verifiedOffset !== undefined) {
      const applied = state.offset === state.verifiedOffset
      label = `Verified · ${seconds(state.verifiedOffset)}${applied ? '' : ' · awaiting application'}`
      tone = applied ? 'verified' : 'neutral'
    } else if (this.earlyTiming?.track === id) {
      label = `Temporary · ${seconds(this.earlyTiming.offset)} · not yet verified`
    } else {
      const result = this.timingResults.find(result => result.id === id)
      if (result && !result.accepted) {
        label = result.reason === 'inconsistent-windows' ? 'Unverified · windows disagree' : `Unverified · ${result.reason.replaceAll('-', ' ')}`
        tone = 'warning'
      }
    }
    return { label, tone, adjustment, hint: hint && state?.verifiedOffset === undefined ? `${seconds(hint.offset)} · hint only, not applied to this episode` : undefined }
  }

  restoreManualDelay () {
    const key = this.pairKey()
    this.manualDelay.value = this.memory.episodes[`${this.videoIdentity}:${key}`] ?? this.memory.manual[key] ?? 0
    if (this.jassub) this.jassub.timeOffset = this.manualDelay.value
  }

  setManualDelay (value: number, episodeOnly = false) {
    if (!Number.isFinite(value) || Math.abs(value) > 120) return
    const state = this.externalTracks.get(String(this.current.value))
    if (state && state.verifiedOffset !== state.offset) state.verifiedOffset = undefined
    clearTimeout(this.earlyTimingTimer)
    this.logTiming(`Manual delay ${value}s; automatic changes suspended`)
    this.manualLock = true
    this.pending = undefined
    this.workerSequence++
    this.stopSampling()
    this.manualDelay.value = value
    const active = this.identities.get(String(this.current.value))
    if (active) {
      this.preference = active
      this.initialSubtitleSelection = null
      this.memory.shows[String(this.mediaId)] = active
    }
    if (this.jassub) this.jassub.timeOffset = value
    const key = this.pairKey()
    if (episodeOnly) this.memory.episodes[`${this.videoIdentity}:${key}`] = value
    else { this.memory.manual[key] = value; Reflect.deleteProperty(this.memory.episodes, `${this.videoIdentity}:${key}`) }
    writeSubtitleMemory(this.memory)
    this.alignmentStatus.value = 'hidden'
  }

  updateAlignmentStatus (_trackNumber: number | string) {
    const state = this.externalTracks.get(String(this.current.value))
    if (!this.set.subtitleAutoRetiming || Number(this.current.value) === -1) this.alignmentStatus.value = 'hidden'
    else if (state?.verifiedOffset !== undefined && state.offset === state.verifiedOffset) this.alignmentStatus.value = 'confirmed'
    else if (this.manualLock) this.alignmentStatus.value = 'hidden'
  }

  async resetAutomaticTiming (enabled: boolean) {
    this.stopSampling()
    this.workerSequence++
    this.pending = undefined
    this.frozen = false
    this.sampleDone = false
    this.sample = undefined
    this.lastAnalysedSignature = ''
    this.waitingForSampleBuffer = false
    this.timingResults = []
    clearTimeout(this.earlyTimingTimer)
    this.preparedTimingTracks.clear()
    this.earlyTiming = undefined
    this.earlyTimingAttempted = false
    this.timingReferenceNames = []
    this.timingStartedAt = undefined
    this.timingElapsedMs = 0
    this.timingError = undefined
    for (const [id, state] of this.externalTracks) {
      state.offset = 0
      state.verifiedOffset = undefined
      this._tracks.value[id]!.meta.header = state.originalHeader
    }
    this.miningRevision.value++
    this.alignmentStatus.value = 'hidden'
    await this.selectCaptions(this.current.value)
    if (enabled) this.scheduleAlignment()
  }

  async retryTiming () {
    this.logTiming('Retry requested; manual lock released')
    this.manualLock = false
    await this.resetAutomaticTiming(true)
  }

  async resetTiming () {
    this.setManualDelay(0)
    const state = this.externalTracks.get(String(this.current.value))
    if (state) Reflect.deleteProperty(this.memory.exact, exactSubtitleKey(this.videoIdentity, state.fingerprint))
    Reflect.deleteProperty(this.memory.hints, this.pairKey())
    writeSubtitleMemory(this.memory)
    await this.retryTiming()
  }

  async initSubtitleRenderer () {
    await this.customFontReady
    if (this.destroyed || this.jassub) return

    const styleOverride = subtitleStyleOverride(this.set.subtitleStyle, this.customFontFamily ?? this.set.subtitleCustomFontName)
    const defaultFont = this.set.subtitleStyle === 'custom' ? 'Roboto Medium' : styleOverride.FontName
    const availableFonts: Record<string, string | Uint8Array> = { ...AVAILABLE_FONTS }
    if (this.customFontUrl && this.customFontFamily) availableFonts[this.customFontFamily] = this.customFontUrl

    this.jassub = new JASSUB({
      video: this.video,
      canvas: this.canvas!,
      subContent: defaultHeader,
      fonts: this.fonts,
      maxRenderHeight: parseInt(this.set.subtitleRenderHeight) || 0,
      defaultFont,
      queryFonts: this.set.subtitleStyle === 'custom' ? false : 'localandremote',
      workerUrl,
      modernWasmUrl,
      wasmUrl,
      availableFonts
    })

    await this.jassub.ready

    await this._applyStyleOverride(this.set.subtitleStyle)
    this.syncMiningVisibility()
  }

  lastSubtitleStyle: string | undefined = undefined
  async _applyStyleOverride (subtitleStyle: SubtitleStyle) {
    const customFontName = this.customFontFamily ?? this.set.subtitleCustomFontName
    const styleKey = subtitleStyle === 'custom' ? `${subtitleStyle}:${customFontName}` : subtitleStyle
    if (this.lastSubtitleStyle === styleKey) return
    if (this.jassub) this.lastSubtitleStyle = styleKey
    if (subtitleStyle !== 'none') {
      const styleOverride = subtitleStyleOverride(subtitleStyle, customFontName)
      const overrideStyle: ASSStyle = {
        Name: 'DialogueStyleOverride',
        FontSize: 72,
        PrimaryColour: 0xFFFFFF00,
        SecondaryColour: 0xFF000000,
        OutlineColour: 0,
        BackColour: 0,
        Bold: subtitleStyle === 'custom' ? 0 : 1,
        Italic: 0,
        Underline: 0,
        StrikeOut: 0,
        ScaleY: 1,
        Angle: 0,
        BorderStyle: 1,
        Outline: 4,
        Shadow: 0,
        Alignment: 2,
        MarginL: 135,
        MarginR: 135,
        MarginV: 50,
        Encoding: 1,
        treat_fontname_as_pattern: 0,
        Blur: 0,
        Justify: 0,
        ...styleOverride
      }
      await this.jassub?.renderer.styleOverride(overrideStyle)
      await this.jassub?.renderer.setDefaultFont(subtitleStyle === 'custom' ? 'Roboto Medium' : overrideStyle.FontName)
    } else {
      await this.jassub?.renderer.disableStyleOverride()
      await this.jassub?.renderer.setDefaultFont('roboto medium')
    }
  }

  track (trackNumber: number | string) {
    const tracks = this._tracks.value

    tracks[trackNumber] ??= {
      events: new HashMap(),
      miningEvents: new Map(),
      // @ts-expect-error initializing with empty object
      meta: {},
      styles: {}
    }

    return tracks[trackNumber]!
  }

  getMiningCues (trackNumber: number | string = this.current.value) {
    const trackId = String(trackNumber)
    const track = this._tracks.value[trackId]
    if (!track || trackNumber === -1) return []
    const cached = this.miningCueCache.get(trackId)
    if (cached?.revision === this.miningRevision.value) return cached.cues
    const headerCues = track.meta.header ? parseAssMiningCues(track.meta.header, trackId) : []
    const cues = sortAndDeduplicateMiningCues([...headerCues, ...track.miningEvents.values()])
    this.miningCueCache.set(trackId, { revision: this.miningRevision.value, cues })
    return cues
  }

  getMiningCueAt (time: number, trackNumber: number | string = this.current.value) {
    return findMiningCueAt(this.getMiningCues(trackNumber), time)
  }

  getActiveMiningCues (time: number, trackNumber: number | string = this.current.value) {
    return findActiveMiningCues(this.getMiningCues(trackNumber), time)
  }

  setMiningMode (active: boolean) {
    this.miningMode = active
    this.syncMiningVisibility()
  }

  screenshotOverlay () {
    return this.jassub?._canvas
  }

  syncMiningVisibility () {
    const canvas = this.jassub?._canvas
    if (!canvas) return
    if (this.miningMode) {
      this.previousCanvasVisibility ??= canvas.style.visibility
      canvas.style.visibility = 'hidden'
    } else if (this.previousCanvasVisibility !== undefined) {
      canvas.style.visibility = this.previousCanvasVisibility
      this.previousCanvasVisibility = undefined
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructSub (subtitle: any, isNotAss: boolean, subtitleIndex: number, Style: number): ASSEvent {
    let Text = subtitle.text ?? ''
    if (isNotAss) { // converts VTT or other to SSA
      const matches: string[] | null = Text.match(/<[^>]+>/g) // create array of all tags
      if (matches) {
        matches.forEach(match => {
          if (match.includes('</')) { // check if its a closing tag
            Text = Text.replace(match, match.replace('</', '{\\').replace('>', '0}'))
          } else {
            Text = Text.replace(match, match.replace('<', '{\\').replace('>', '1}'))
          }
        })
      }
      // replace all html special tags with normal ones
      Text = Text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\\h').replace(/\r?\n/g, '\\N')
    } else {
      Text = Text.replace(/\r?\n/g, '')
    }
    return {
      Start: subtitle.time,
      Duration: subtitle.duration,
      Style,
      Name: subtitle.name ?? '',
      MarginL: Number(subtitle.marginL) || 0,
      MarginR: Number(subtitle.marginR) || 0,
      MarginV: Number(subtitle.marginV) || 0,
      Effect: subtitle.effect ?? '',
      Text,
      ReadOrder: subtitle.readOrder ?? subtitleIndex,
      Layer: Number(subtitle.layer) || 0
    }
  }

  async selectCaptions (trackNumber: number | string, manual = false) {
    if (this.destroyed) return
    const revision = ++this.selectionRevision
    if (manual) {
      clearTimeout(this.earlyTimingTimer)
      this.logTiming(`Manual subtitle selection: ${trackNumber}; automatic changes suspended`)
      this.manualLock = true
      this.pending = undefined
      this.workerSequence++
      this.stopSampling()
      const preference = Number(trackNumber) === -1 ? { off: true } : this.identities.get(String(trackNumber))
      if (preference) {
        this.preference = preference
        this.initialSubtitleSelection = null
        this.memory.shows[String(this.mediaId)] = preference
        writeSubtitleMemory(this.memory)
      }
    }
    const selectedState = this.externalTracks.get(String(trackNumber))
    if (manual && this.set.subtitleAutoRetiming && selectedState?.verifiedOffset !== undefined && selectedState.offset !== selectedState.verifiedOffset) {
      this.applyTrackOffset(String(trackNumber), selectedState.verifiedOffset)
    }
    this.writingCurrent = true
    this.current.value = trackNumber
    this.writingCurrent = false
    this.restoreManualDelay()
    this.updateAlignmentStatus(trackNumber)

    if (trackNumber === -1) {
      this.stopSampling()
      if (!this.jassub) return
      await this.jassub.ready
      if (this.destroyed || revision !== this.selectionRevision) return
      await this.jassub.renderer.setTrack(defaultHeader)
      return await this.jassub.resize()
    }

    const track = this._tracks.value[trackNumber]
    if (!track) return

    if (!this.jassub) return
    await this.jassub.ready
    if (this.destroyed || String(this.current.value) !== String(trackNumber)) return

    if (this.externalTracks.has(String(trackNumber))) this.scheduleAlignment()

    await this.jassub.renderer.setTrack(track.meta.header || defaultHeader)
    for (const subtitle of track.events) {
      if (this.destroyed || revision !== this.selectionRevision) return
      await this.jassub.renderer.createEvent(subtitle)
    }
    if (this.destroyed || revision !== this.selectionRevision) return
    const lang = track.meta.language
    if (this.set.subtitleStyle === 'custom') {
      await this.jassub.renderer.setDefaultFont('Roboto Medium')
    } else if (LANGUAGE_OVERRIDES[lang]) {
      const name = LANGUAGE_OVERRIDES[lang]
      await this.jassub.renderer.setDefaultFont(name)
    } else {
      await this.jassub.renderer.setDefaultFont('roboto medium')
    }
    await this.jassub.resize()
  }

  destroy () {
    this.destroyed = true
    clearTimeout(this.earlyTimingTimer)
    this.downloads.abort()
    this.stopSampling()
    this.worker?.terminate()
    if (this.alignmentTimer !== undefined) clearTimeout(this.alignmentTimer)
    this.externalTracks.clear()
    this.miningCueCache.clear()
    this.embeddedTracks.clear()
    this.alignmentStatus.value = 'hidden'
    this.settingsUnsubscribe()
    this.setMiningMode(false)
    this.jassub?.destroy()
    if (this.customFontUrl) URL.revokeObjectURL(this.customFontUrl)
    for (const { events, miningEvents } of Object.values(this._tracks.value)) {
      events.clear()
      miningEvents.clear()
    }
  }

  static convertSubText (text: string, type: string) {
    const srtRx = /(?:\d+\r?\n)?(\S{9,12})\s?-->\s?(\S{9,12})(.*)\r?\n([\s\S]*)$/i
    const srt = (text: string) => {
      const subtitles = []
      const replaced = text.replace(/\r/g, '')
      for (const split of replaced.split(/\r?\n\r?\n/)) {
        const match: string[] | null = split.match(srtRx)
        if (match?.length !== 5) continue
        // timestamps
        match[1] = match[1]!.match(/.*[.,]\d{2}/)![0]
        match[2] = match[2]!.match(/.*[.,]\d{2}/)![0]
        if (match[1].length === 9) {
          match[1] = '0:' + match[1]
        } else {
          if (match[1][0] === '0') {
            match[1] = match[1].substring(1)
          }
        }
        match[1].replace(',', '.')
        if (match[2].length === 9) {
          match[2] = '0:' + match[2]
        } else {
          if (match[2][0] === '0') {
            match[2] = match[2].substring(1)
          }
        }
        match[2].replace(',', '.')
        // create array of all tags
        const matches = match[4]?.match(/<[^>]+>/g)
        if (matches) {
          matches.forEach(matched => {
            if (matched.includes('</')) { // check if its a closing tag
              match[4] = match[4]!.replace(matched, matched.replace('</', '{\\').replace('>', '0}'))
            } else {
              match[4] = match[4]!.replace(matched, matched.replace('<', '{\\').replace('>', '1}'))
            }
          })
        }
        subtitles.push('Dialogue: 0,' + match[1].replace(',', '.') + ',' + match[2].replace(',', '.') + ',Default,,0,0,0,,' + match[4]!.replace(/\r?\n/g, '\\N'))
      }
      return subtitles
    }
    const subRx = /[{[](\d+)[}\]][{[](\d+)[}\]](.+)/i
    const sub = (text: string) => {
      const subtitles = []
      const replaced = text.replace(/\r/g, '')
      let frames = 1000 / Number(replaced.match(subRx)?.[3])
      if (!frames || isNaN(frames)) frames = 41.708
      for (const split of replaced.split('\r?\n')) {
        const match = split.match(subRx)
        if (match) subtitles.push('Dialogue: 0,' + toTS((Number(match[1]) * frames) / 1000, 1) + ',' + toTS((Number(match[2]) * frames) / 1000, 1) + ',Default,,0,0,0,,' + match[3]?.replace('|', '\\N'))
      }
      return subtitles
    }
    if (type === 'ass') {
      return { type: 'ass', header: text }
    } else if (type === 'srt' || type === 'vtt') {
      return { type: 'srt', header: defaultHeader + srt(text).join('\n') }
    } else if (type === 'sub') {
      return { type: 'sub', header: defaultHeader + sub(text).join('\n') }
    } else {
      // subbers have a tendency to not set the extensions at all
      if (text.startsWith('[Script Info]')) return { type: 'ass', header: text }
      if (srtRx.test(text)) return { type: 'srt', header: defaultHeader + srt(text).join('\n') }
      if (subRx.test(text)) return { type: 'sub', header: defaultHeader + sub(text).join('\n') }
    }
  }
}
