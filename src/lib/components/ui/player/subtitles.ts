import JASSUB from 'jassub'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import workerUrl from 'jassub/dist/worker/worker.js?worker&url'
import { writable } from 'simple-store-svelte'
import { get } from 'svelte/store'

import { findSubtitleAlignment, parseAssCues, shiftAssDialogue, shouldAttemptSubtitleAlignment, type SubtitleCue } from './subtitle-alignment'
import { advanceAlignment, alignmentStatus, cachedSubtitleAlignment, initialAlignmentProgress, rankJimakuCandidates, readSubtitleAlignmentCache, saveSubtitleAlignment, subtitleReleaseProfile, writeSubtitleAlignmentCache, type SubtitleAlignmentProgress, type SubtitleAlignmentStatus } from './subtitle-profiles'

import type { ResolvedFile } from './resolver'
import type { MediaInfo } from './util'
import type { ASSEvent, ASSStyle } from 'jassub/dist/worker/util'
import type { SubtitleTrack, TorrentFile } from 'native'

import { extensions } from '$lib/modules/extensions'
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

const STYLE_OVERRIDES: Record<typeof defaults.subtitleStyle, Pick<ASSStyle, 'FontName' |'Spacing' | 'ScaleX'>> = {
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

let lastSelectedTrack: { language?: string, name?: string, number: string } | undefined

const stylesRx = /^Style:[^,]*/gm

interface JimakuAlignmentState {
  originalHeader: string
  cues: SubtitleCue[]
  profile?: string
  progress: SubtitleAlignmentProgress
}

export default class Subtitles {
  video?: HTMLVideoElement
  canvas?: HTMLCanvasElement
  selected: ResolvedFile
  fonts: string[]
  jassub: JASSUB | null = null
  current = writable<number | string>(-1)
  alignmentStatus = writable<SubtitleAlignmentStatus>('hidden')
  set = get(settings)
  embeddedTracks = new Set<string>()
  jimakuTracks = new Map<string, JimakuAlignmentState>()
  alignmentCache = readSubtitleAlignmentCache()
  alignmentReferenceTrack: string | undefined
  alignmentTimer: ReturnType<typeof setTimeout> | undefined
  mediaId: number

  _tracks = writable<Record<number | string, { events: HashMap<{ text: string, time: number, duration: number, style?: string }, ASSEvent>, meta: SubtitleTrack, styles: Record<string | number, number> }>>({})

  constructor (video: HTMLVideoElement | undefined, otherFiles: TorrentFile[], mediaInfo: MediaInfo, canvas?: HTMLCanvasElement) {
    this.video = video
    this.canvas = canvas
    this.selected = mediaInfo.file
    this.mediaId = mediaInfo.media.id
    this.fonts = [...otherFiles.filter(file => fontRx.test(file.name)).map(file => file.url)]

    this.current.subscribe(value => {
      this.selectCaptions(value)
    })

    settings.subscribe(set => {
      this._applyStyleOverride(set.subtitleStyle)
    })

    const subFiles = otherFiles.filter(({ name }) => subRx.test(name))

    const fetchSubtitleFile = async (file: { url: string, name: string }) => {
      const res = await fetch(file.url)
      const blob = await res.blob()
      return new File([blob], file.name)
    }

    const fetchAndLoad = async (file: { url: string, name: string, extension?: string }) => {
      await this.addSingleSubtitleFile(await fetchSubtitleFile(file), file.extension)
    }

    extensions.subtitlesQuery(mediaInfo.media, mediaInfo.episode).then(async results => {
      const jimaku = results.filter(({ extension }) => extension === 'jimaku')
      for (const { url, language, extension } of results.filter(({ extension }) => extension !== 'jimaku')) {
        fetchAndLoad({ url, name: language, extension })
      }

      if (!jimaku.length) return
      const parsed = await anitomyscript(jimaku.map(({ language }) => language))
      const candidates = jimaku.map((value, index) => ({
        value,
        filename: value.language,
        profile: subtitleReleaseProfile(value.language, parsed[index] ?? {}),
        episodeNumbers: parsed[index]?.episode_number ?? [],
        index
      }))
      const playingMultiEpisode = mediaInfo.file.metadata.parseObject.episode_number.length > 1
      const ranked = rankJimakuCandidates(candidates, this.alignmentCache, this.mediaId, playingMultiEpisode)
      const files = await Promise.allSettled(ranked.map(async candidate => ({
        candidate,
        file: await fetchSubtitleFile({ url: candidate.value.url, name: candidate.value.language })
      })))
      for (const result of files) {
        if (result.status === 'rejected') {
          console.error(result.reason)
          continue
        }
        await this.addSingleSubtitleFile(result.value.file, 'jimaku', result.value.candidate.profile)
      }
    })

    if (subFiles.length === 1) {
      fetchAndLoad(subFiles[0]!)
    } else if (subFiles.length > 1) {
      const videoName = mediaInfo.file.name.substring(0, mediaInfo.file.name.lastIndexOf('.')) || mediaInfo.file.name
      for (const file of subFiles) {
        if (file.name.includes(videoName)) {
          fetchAndLoad(file)
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
      this.alignmentReferenceTrack = this.chooseAlignmentReferenceTrack()
      await this.initSubtitleRenderer()

      if (!this.set.subtitleLanguage) return // if lang set to none dont autoselect

      const tracks = Object.entries(this._tracks.value)

      if (!tracks.length) return
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

      const matchesLast = lastSelectedTrack && tracks.filter(([_, { meta }]) => meta.language === lastSelectedTrack!.language && meta.name === lastSelectedTrack!.name)

      if (matchesLast?.length) {
        if (matchesLast.length === 1) return await this.selectCaptions(matchesLast[0]![0])

        const matchesLastNumber = matchesLast.find(([_, { meta }]) => meta.number === lastSelectedTrack!.number)
        if (matchesLastNumber) return await this.selectCaptions(matchesLastNumber[0])

        return await selectDesired(matchesLast)
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

    native.subtitles(this.selected.hash, this.selected.id, async (subtitle: { text: string, time: number, duration: number, style?: string }, trackNumber) => {
      await tracks
      const { events, meta, styles } = this.track(trackNumber)
      if (events.has(subtitle)) return
      const event = this.constructSub(subtitle, meta.type !== 'ass', events.size, styles[subtitle.style ?? 'Default'] ?? 0)
      events.add(subtitle, event)
      if (this.alignmentReferenceTrack === String(trackNumber) && this.jimakuTracks.has(String(this.current.value)) && shouldAttemptSubtitleAlignment(events.size)) {
        this.scheduleJimakuAlignment()
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
      if (subRx.test(file.name)) this.addSingleSubtitleFile(file)
    }
  }

  pickFile () {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = subtitleExtensions.map(ext => '.' + ext).join(',')
    input.multiple = true
    input.addEventListener('change', () => {
      for (const file of input.files ?? []) {
        if (subRx.test(file.name)) this.addSingleSubtitleFile(file)
      }
    })
    input.click()
  }

  async addSingleSubtitleFile (file: File, source?: string, profile?: string) {
    const dot = file.name.lastIndexOf('.')
    const extension = file.name.substring(dot + 1).toLowerCase()
    if (!subtitleExtensions.includes(extension)) return
    const filename = file.name.slice(0, dot)
    // sub name could contain video name with or without extension, possibly followed by lang, or not.
    const name = filename.includes(this.selected.name)
      ? filename.replace(this.selected.name, '')
      : filename.replace(this.selected.name.slice(0, this.selected.name.lastIndexOf('.')), '')

    const convert = Subtitles.convertSubText(await file.text(), extension)
    if (!convert) return
    const { header, type } = convert
    const cached = source === 'jimaku' ? cachedSubtitleAlignment(this.alignmentCache, this.mediaId, profile) : undefined
    const activeHeader = cached ? shiftAssDialogue(header, cached.offset) : header
    // lets hope there's no more than 1000 subtitle tracks in a file
    const trackNumber = 1000 + Object.keys(this._tracks.value).length
    const newtrack = this.track(trackNumber)
    newtrack.styles.Default = 0
    newtrack.meta = { type, header: activeHeader, number: '' + trackNumber, name, language: (detectCJKLanguage(header) ?? name.replace(/[,._-]/g, ' ').trim()) || 'Track ' + trackNumber, _compressed: false, default: false, forced: false }
    if (source === 'jimaku') {
      this.jimakuTracks.set(String(trackNumber), {
        originalHeader: header,
        cues: parseAssCues(header),
        profile,
        progress: initialAlignmentProgress(cached)
      })
    }
    const styleMatches = header.match(stylesRx)
    if (styleMatches) {
      for (let i = 0; i < styleMatches.length; ++i) {
        newtrack.styles[styleMatches[i]!.replace('Style:', '').trim()] = i + 1
      }
    }
    if (this.current.value === -1) {
      await this.initSubtitleRenderer()
      await this.selectCaptions(trackNumber)
    }
  }

  scheduleJimakuAlignment () {
    if (this.alignmentTimer !== undefined || !this.jimakuTracks.has(String(this.current.value))) return
    this.alignmentTimer = setTimeout(() => {
      this.alignmentTimer = undefined
      this.alignJimakuTracks().catch(console.error)
    })
  }

  chooseAlignmentReferenceTrack () {
    const references = [...this.embeddedTracks].reduce<Array<{ trackNumber: string, language: string, default: boolean }>>((result, trackNumber) => {
      const track = this._tracks.value[trackNumber]
      if (!track || track.meta.forced) return result

      result.push({
        trackNumber,
        language: track.meta.language,
        default: track.meta.default
      })
      return result
    }, [])

    return references.sort((a, b) => {
      const aEnglish = a.language === 'eng' || a.language === 'en'
      const bEnglish = b.language === 'eng' || b.language === 'en'
      if (aEnglish !== bEnglish) return Number(bEnglish) - Number(aEnglish)
      if (a.default !== b.default) return Number(b.default) - Number(a.default)
      return 0
    })[0]?.trackNumber
  }

  alignmentReference () {
    if (!this.alignmentReferenceTrack) return
    const track = this._tracks.value[this.alignmentReferenceTrack]
    if (!track || track.meta.forced) return

    const cues = [...track.events]
      .map(event => ({ start: event.Start / 1000, end: (event.Start + event.Duration) / 1000 }))
      .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start)

    return {
      cues
    }
  }

  async alignJimakuTracks () {
    const trackNumber = String(this.current.value)
    const state = this.jimakuTracks.get(trackNumber)
    const reference = this.alignmentReference()
    if (!state || !reference || reference.cues.length < 4) return

    const estimate = findSubtitleAlignment(reference.cues, state.cues)
    if (!estimate) return

    const update = advanceAlignment(state.progress, estimate.offset, reference.cues.length)
    state.progress = update.progress

    if (update.confirmedNow && state.profile && state.progress.offset !== undefined) {
      saveSubtitleAlignment(this.alignmentCache, this.mediaId, state.profile, state.progress.offset)
      writeSubtitleAlignmentCache(this.alignmentCache)
    }

    if (String(this.current.value) === trackNumber) this.updateAlignmentStatus(trackNumber)
    if (!update.applyOffset || state.progress.offset === undefined) return

    const track = this._tracks.value[trackNumber]
    if (!track) return
    track.meta.header = shiftAssDialogue(state.originalHeader, state.progress.offset)

    if (String(this.current.value) === trackNumber) await this.selectCaptions(trackNumber)
  }

  updateAlignmentStatus (trackNumber: number | string) {
    const state = this.jimakuTracks.get(String(trackNumber))
    this.alignmentStatus.value = state ? alignmentStatus(state.progress) : 'hidden'
  }

  async initSubtitleRenderer () {
    if (this.jassub) return

    this.jassub = new JASSUB({
      video: this.video,
      canvas: this.canvas!,
      subContent: defaultHeader,
      fonts: this.fonts,
      maxRenderHeight: parseInt(this.set.subtitleRenderHeight) || 0,
      defaultFont: STYLE_OVERRIDES[this.set.subtitleStyle].FontName,
      queryFonts: 'localandremote',
      workerUrl,
      modernWasmUrl,
      wasmUrl,
      availableFonts: AVAILABLE_FONTS
    })

    await this.jassub.ready

    await this._applyStyleOverride(this.set.subtitleStyle)
  }

  lastSubtitleStyle: typeof defaults.subtitleStyle | undefined = undefined
  async _applyStyleOverride (subtitleStyle: typeof defaults.subtitleStyle) {
    if (this.lastSubtitleStyle === subtitleStyle) return
    if (this.jassub) this.lastSubtitleStyle = subtitleStyle
    if (subtitleStyle !== 'none') {
      const overrideStyle: ASSStyle = {
        Name: 'DialogueStyleOverride',
        FontSize: 72,
        PrimaryColour: 0xFFFFFF00,
        SecondaryColour: 0xFF000000,
        OutlineColour: 0,
        BackColour: 0,
        Bold: 1,
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
        ...STYLE_OVERRIDES[subtitleStyle]
      }
      await this.jassub?.renderer.styleOverride(overrideStyle)
      await this.jassub?.renderer.setDefaultFont(overrideStyle.FontName)
    } else {
      await this.jassub?.renderer.disableStyleOverride()
      await this.jassub?.renderer.setDefaultFont('roboto medium')
    }
  }

  track (trackNumber: number | string) {
    const tracks = this._tracks.value

    tracks[trackNumber] ??= {
      events: new HashMap(),
      // @ts-expect-error initializing with empty object
      meta: {},
      styles: {}
    }

    return tracks[trackNumber]!
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

  async selectCaptions (trackNumber: number | string) {
    this.current.value = trackNumber
    this.updateAlignmentStatus(trackNumber)

    if (!this.jassub) return

    await this.jassub.ready
    if (trackNumber === -1) {
      await this.jassub.renderer.setTrack(defaultHeader)
      return await this.jassub.resize()
    }

    const track = this._tracks.value[trackNumber]
    if (!track) return

    if (this.jimakuTracks.has(String(trackNumber))) this.scheduleJimakuAlignment()

    lastSelectedTrack = track.meta

    await this.jassub.renderer.setTrack(track.meta.header?.slice(0, -1) || defaultHeader)
    for (const subtitle of track.events) await this.jassub.renderer.createEvent(subtitle)
    const lang = track.meta.language
    if (LANGUAGE_OVERRIDES[lang]) {
      const name = LANGUAGE_OVERRIDES[lang]
      await this.jassub.renderer.setDefaultFont(name)
    } else {
      await this.jassub.renderer.setDefaultFont('roboto medium')
    }
    await this.jassub.resize()
  }

  destroy () {
    if (this.alignmentTimer !== undefined) clearTimeout(this.alignmentTimer)
    this.jimakuTracks.clear()
    this.embeddedTracks.clear()
    this.alignmentReferenceTrack = undefined
    this.alignmentStatus.value = 'hidden'
    this.jassub?.destroy()
    for (const { events } of Object.values(this._tracks.value)) {
      events.clear()
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
