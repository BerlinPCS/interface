<script lang='ts'>
  import Captions from 'lucide-svelte/icons/captions'
  import Cast from 'lucide-svelte/icons/cast'
  import CircleCheck from 'lucide-svelte/icons/circle-check'
  import Contrast from 'lucide-svelte/icons/contrast'
  import DecimalsArrowLeft from 'lucide-svelte/icons/decimals-arrow-left'
  import DecimalsArrowRight from 'lucide-svelte/icons/decimals-arrow-right'
  import FastForward from 'lucide-svelte/icons/fast-forward'
  import List from 'lucide-svelte/icons/list'
  import LoaderCircle from 'lucide-svelte/icons/loader-circle'
  import Pause from 'lucide-svelte/icons/pause'
  import Pickaxe from 'lucide-svelte/icons/pickaxe'
  import PictureInPicture2 from 'lucide-svelte/icons/picture-in-picture-2'
  import Proportions from 'lucide-svelte/icons/proportions'
  import RefreshCcw from 'lucide-svelte/icons/refresh-ccw'
  import Rewind from 'lucide-svelte/icons/rewind'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import RotateCw from 'lucide-svelte/icons/rotate-cw'
  import ScreenShare from 'lucide-svelte/icons/screen-share'
  import SkipBack from 'lucide-svelte/icons/skip-back'
  import SkipForward from 'lucide-svelte/icons/skip-forward'
  import Volume1 from 'lucide-svelte/icons/volume-1'
  import VolumeX from 'lucide-svelte/icons/volume-x'
  import { onDestroy, onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { persisted } from 'svelte-persisted-store'
  import { toast } from 'svelte-sonner'
  import VideoDeband from 'video-deband'

  import ProgressButton from '../button/progress-button.svelte'

  import Animations, { playAnimation } from './animations.svelte'
  import { activeDisplay, displays } from './castplayer.svelte'
  import Chapters, { findChapter, getChapterTitle, type Chapter } from './chapters'
  import DownloadStats from './downloadstats.svelte'
  import EpisodesModal from './episodesmodal.svelte'
  import { condition, loadWithDefaults } from './keybinds.svelte'
  import MiningDictionaryPopup from './mining-dictionary-popup.svelte'
  import MiningSubtitle from './mining-subtitle.svelte'
  import Options from './options.svelte'
  import PictureInPicture from './pip'
  import Seekbar from './seekbar.svelte'
  import StatsForNerds from './statsfornerds.svelte'
  import Subs from './subtitles'
  import Thumbnailer from './thumbnailer'
  import { screenshot, type MediaInfo } from './util'
  import Volume from './volume.svelte'

  import type { ResolvedFile } from './resolver'
  import type { TorrentFile } from 'native'
  import type { SvelteMediaTimeRange } from 'svelte/elements'

  import { dev } from '$app/env'
  import { goto, onNavigate } from '$app/navigation'
  import { page } from '$app/stores'
  import PictureInPictureOff from '$lib/components/icons/PictureInPicture.svelte'
  import PictureInPictureExit from '$lib/components/icons/PictureInPictureExit.svelte'
  import Play from '$lib/components/icons/Play.svelte'
  import Subtitles from '$lib/components/icons/Subtitles.svelte'
  import Volume2 from '$lib/components/icons/Volume2.svelte'
  import { Maximize, Messages, Minimize } from '$lib/components/icons/animated'
  import { Button, iconSizes } from '$lib/components/ui/button'
  import { W2GChatPanel } from '$lib/components/ui/chat'
  import { authAggregator } from '$lib/modules/auth'
  import { isPlaying } from '$lib/modules/idle'
  import { beginMiningPlaybackSession, miningCueSeekTime, navigateMiningCue, shouldResumeAfterMining, type MiningCue, type MiningPlaybackSession, type MiningSelection } from '$lib/modules/mining'
  import {
    calculateMiningPopupPosition,
    getMiningLookupRequest,
    UNAVAILABLE_MINING_DICTIONARY_STATE,
    type MiningDictionaryEntry,
    type MiningDictionaryState,
    type MiningPopupPosition
  } from '$lib/modules/mining-dictionary'
  import native from '$lib/modules/native'
  import { click, customDoubleClick, inputType, keywrap } from '$lib/modules/navigate'
  import { settings, SUPPORTS } from '$lib/modules/settings'
  import { server } from '$lib/modules/torrent'
  import { w2globby } from '$lib/modules/w2g/lobby'
  import { getAnimeProgress, setAnimeProgress } from '$lib/modules/watchProgress'
  import { toTS, scaleBlurFade, cn } from '$lib/utils'

  export let mediaInfo: MediaInfo
  export let otherFiles: TorrentFile[]
  export let videoFiles: ResolvedFile[]
  export let selectFile: (file: ResolvedFile) => void
  export let prev: (() => void) | undefined = undefined
  export let next: (() => void) | undefined = undefined

  server._addNZBs(mediaInfo.file.hash, mediaInfo.media, mediaInfo.episode, mediaInfo.file.name)
  server._addHTTPWebSeeds(mediaInfo.file.hash, mediaInfo.media, mediaInfo.episode, { name: mediaInfo.file.name, index: mediaInfo.file.id })
  // bindings
  // values
  let videoHeight = 0
  let videoWidth = 0
  let currentTime = 0
  let seekPercent = 0
  let duration = 1
  let chatOpen = false
  const playbackRate = persisted('playbackRate', 1, {
    serializer: {
      stringify: (value) => value.toString(),
      parse: (value) => Math.min(16, Math.max(0.1, parseFloat(value)))
    }
  })
  let buffered: SvelteMediaTimeRange[] = []
  let subtitleDelay = 0
  $: buffer = Math.max(...buffered.map(({ end }) => end))
  let readyState = 0
  $: safeduration = isFinite(duration) ? duration : currentTime
  const volume = persisted('volume', 1)
  $: exponentialVolume = SUPPORTS.isMobile ? 1 : $volume ** 3
  let muted = false

  let miningMode = false
  let miningCue: MiningCue | undefined
  let miningDisplayCues: MiningCue[] = []
  let miningTrackId: string | undefined
  let miningNavigationCueId: string | undefined
  let miningRevisionSeen = -1
  let miningEffectiveTimeSeen = Number.NaN
  let miningPlaybackSession: MiningPlaybackSession | undefined
  let miningDictionaryEntries: MiningDictionaryEntry[] = []
  let miningDictionaryPosition: MiningPopupPosition | undefined
  let miningDictionaryLoading = false
  let miningDictionaryError = ''
  let miningDictionaryRequestKey = ''
  let miningDictionaryRequestGeneration = 0
  let miningDictionaryState = UNAVAILABLE_MINING_DICTIONARY_STATE
  let miningDictionaryLookupTimer = 0
  let miningDictionaryCloseTimer = 0
  const miningDictionaryCache = new Map<string, MiningDictionaryEntry[]>()
  $: isMiniplayer = $page.route.id !== '/app/player'

  const timeFormat = persisted('timeFormat', 'positive')

  // elements
  let fullscreenElement: HTMLElement | null = null
  let video: Pick<HTMLVideoElement, 'currentTime' | 'play' | 'pause' | 'audioTracks' | 'videoTracks' | 'requestVideoFrameCallback' | 'cancelVideoFrameCallback' |'clientWidth' | 'clientHeight' | 'getVideoPlaybackQuality' | 'playbackRate' | 'load' |'src'>
  let wrapper: HTMLDivElement

  let canvasSource: CanvasImageSource
  function setSource (video: HTMLVideoElement) {
    canvasSource = video
    thumbnailer.setVideo(video)
    subtitles = new Subs(video, otherFiles, mediaInfo)

    return {
      destroy () {
        thumbnailer.destroy()
        subtitles?.destroy()
      }
    }
  }

  let useMediaBunnyPlayback = $settings.playerCustom || dev

  let subtitles: Subs | undefined
  $: subtitleAlignmentStatus = subtitles?.alignmentStatus
  $: miningRevision = subtitles?.miningRevision
  $: miningTrack = subtitles?.current
  $: subtitles?.setMiningMode(miningMode && !isMiniplayer)
  let deband: VideoDeband | undefined

  const pip = new PictureInPicture()

  function setPipVideo (video: HTMLVideoElement, { subtitles, deband }: { subtitles?: Subs, deband?: VideoDeband }) {
    pip._setElements(video, subtitles, deband)
    return {
      update ({ subtitles, deband }: { subtitles?: Subs, deband?: VideoDeband }) {
        pip._setElements(video, subtitles, deband)
      },
      destroy () {
        pip.destroy()
      }
    }
  }
  const pipElementStore = pip.element
  $: pictureInPictureElement = $pipElementStore

  const thumbnailer = new Thumbnailer(useMediaBunnyPlayback ? '' : mediaInfo.file.url)

  function handleMediaBunnyFallback ({ detail }: CustomEvent<Error>) {
    useMediaBunnyPlayback = false
    toast.error('Mobile playback setup failed', {
      description: detail.message || 'Falling back to native playback for this file.', duration: 15_000
    })
  }

  $: if (subtitles?.jassub) subtitles.jassub.timeOffset = Number(subtitleDelay)

  // state
  let seeking = false
  let ended = false
  let paused = true
  $: if (miningMode && subtitles && $miningRevision !== undefined && $miningTrack !== undefined) {
    refreshMiningCue($miningTrack, $miningRevision, currentTime, paused, subtitleDelay)
  }
  let pointerMoving = false
  let fastForwarding = false
  // const cast = false

  $: $isPlaying = !paused

  $: buffering = readyState < 3 && !paused
  $: immersed = (!buffering && !paused && !ended && !pictureInPictureElement && !pointerMoving) || fastForwarding
  let pointerMoveTimeout = 0
  function resetMove (time = 300) {
    clearTimeout(pointerMoveTimeout)
    pointerMoving = true
    pointerMoveTimeout = setTimeout(() => {
      pointerMoveTimeout = 0
      pointerMoving = false
    }, time)
  }

  // functions
  function playPause () {
    playAnimation(paused ? 'play' : 'pause')
    return paused ? Promise.allSettled([video.play(), pip.element.value?.play()]) : [video.pause(), pip.element.value?.pause()]
  }
  function mobilePlayPause () {
    if (!SUPPORTS.isMobile) return playPause()
    return resetMove(immersed ? 2000 : 0)
  }
  async function fullscreen () {
    const target = document.getElementById('episodeListTarget')!
    if (SUPPORTS.isAndroid) target.classList.remove('custom-fullscreen')
    try {
      return fullscreenElement ? await document.exitFullscreen() : await target.requestFullscreen({ navigationUI: 'hide' })
    } catch (err) {
      console.error(err)
      // hacky workaround for android permission system
      if (SUPPORTS.isAndroid && !fullscreenElement) target.classList.add('custom-fullscreen')
    }
  }
  // $: if (fullscreenElement) screen.orientation.lock?.('landscape').catch(() => {})
  $: fullscreenElement ? screen.orientation.lock?.('landscape') : screen.orientation.unlock?.()

  // return the promises for cleaner UI transitions while navigating
  onNavigate(({ to, from }) => {
    if (to?.route.id === from?.route.id && to?.route.id === '/app/player') return
    if (SUPPORTS.isAndroid) document.getElementById('episodeListTarget')!.classList.remove('custom-fullscreen')
    if (to?.route.id === '/app/player') {
      // force fullscreen on mobile
      if (SUPPORTS.isMobile && !SUPPORTS.isIPad) return fullscreen()
    } else if (fullscreenElement) {
      // exit fullscreen when navigating away from player
      return fullscreen()
    }
  })

  onMount(() => {
    if (SUPPORTS.isMobile && !SUPPORTS.isIPad && !fullscreenElement && !isMiniplayer) fullscreen()
    if (!native.isApp) return
    const applyDictionaryState = (state: MiningDictionaryState) => {
      if (state.generation !== miningDictionaryState.generation) miningDictionaryCache.clear()
      miningDictionaryState = state
    }
    const unsubscribe = native.onMiningDictionaryEvent(event => {
      if (event.event === 'stateChanged') applyDictionaryState(event.data)
      if (event.event === 'backendError' && miningDictionaryPosition) {
        miningDictionaryError = event.data.message
        miningDictionaryLoading = false
      }
    })
    native.miningDictionaryState()
      .then(applyDictionaryState)
      .catch(error => {
        miningDictionaryState = {
          ...UNAVAILABLE_MINING_DICTIONARY_STATE,
          error: error instanceof Error ? error.message : 'The offline dictionary backend is unavailable.'
        }
      })
    return unsubscribe
  })

  onDestroy(() => {
    subtitles?.setMiningMode(false)
    closeMiningDictionary()
  })

  // exiting fullscreen on mobile navigates back since its a "back" gesture
  function checkMobileFullscreen () {
    if (!document.fullscreenElement && SUPPORTS.isAndroid && !isMiniplayer) history.back()
  }

  function checkAudio () {
    if (video.audioTracks) {
      if (!video.audioTracks.length) {
        toast.error('Audio Codec Unsupported', {
          description: "This torrent's audio codec is not supported, try a different release by disabling Autoplay Torrents in Torrent settings. You can also use external players like MPV.",
          duration: 15_000
        })
      } else if (video.audioTracks.length > 1) {
        const preferredTrack = [...video.audioTracks].find(({ language }) => language === $settings.audioLanguage)
        if (preferredTrack) return selectAudio(preferredTrack.id)

        const japaneseTrack = [...video.audioTracks].find(({ language }) => language === 'jpn')
        if (japaneseTrack) return selectAudio(japaneseTrack.id)
      }
    } else {
      video.requestVideoFrameCallback(() => {
        // using capturestream.getAudioTracks() could work too
        if ('webkitAudioDecodedByteCount' in video && video.webkitAudioDecodedByteCount === 0) {
          toast.error('Audio Codec Unsupported', {
            description: "This torrent's audio codec is not supported, try a different release by disabling Autoplay Torrents in Torrent settings. You can also use external players like MPV.",
            duration: 15_000
          })
        }
      })
    }
  }
  function changeVolume (delta: number) {
    playAnimation(delta > 0 ? 'volumeup' : 'volumedown')
    $volume = Math.min(1, Math.max(0, $volume + delta))
  }
  function selectAudio (id: string) {
    if (id) {
      for (const track of video.audioTracks ?? []) {
        track.enabled = track.id === id
        if (track.id === id) playAnimation(track.label)
      }

      if (useMediaBunnyPlayback) return
      seek(-0.2) // stupid fix because video freezes up when chaging tracks
    }
  }
  function selectVideo (id: string) {
    if (id) {
      for (const track of video.videoTracks ?? []) {
        track.selected = track.id === id
        if (track.id === id) playAnimation(track.label)
      }
    }
  }
  function seek (time: number) {
    seekTo(currentTime + time)
  }
  function seekTo (time: number) {
    const oldTime = currentTime
    currentTime = time
    // WARN: this causes all subscriptions to video to re-run!!!
    if (video) video.currentTime = currentTime
    playAnimation(time > oldTime ? 'seekforw' : 'seekback')
  }

  function refreshMiningCue (trackNumber: number | string, revision: number, playbackTime: number, playbackPaused: boolean, delay: number) {
    if (!subtitles) return
    const trackId = String(trackNumber)
    const trackChanged = miningTrackId !== trackId
    const revisionChanged = miningRevisionSeen !== revision
    const cues = subtitles.getMiningCues(trackNumber)
    const effectiveTime = playbackTime + Number(delay)
    const timeChanged = !Number.isFinite(miningEffectiveTimeSeen) || Math.abs(effectiveTime - miningEffectiveTimeSeen) > 0.001
    const activeCues = subtitles.getActiveMiningCues(effectiveTime, trackNumber)

    if (trackChanged) {
      miningNavigationCueId = undefined
      miningCue = subtitles.getMiningCueAt(effectiveTime, trackNumber)
      miningDisplayCues = activeCues.length ? activeCues : (miningCue ? [miningCue] : [])
    } else if (!playbackPaused) {
      const navigatedCue = cues.find(cue => cue.id === miningNavigationCueId)
      if (navigatedCue && navigatedCue.start <= effectiveTime && effectiveTime < navigatedCue.end) {
        miningCue = navigatedCue
      } else {
        miningNavigationCueId = undefined
        miningCue = activeCues[0]
      }
      miningDisplayCues = activeCues
    } else {
      const navigatedCue = cues.find(cue => cue.id === miningNavigationCueId)
      if (navigatedCue && navigatedCue.start <= effectiveTime && effectiveTime < navigatedCue.end) {
        miningCue = navigatedCue
      } else if (timeChanged) {
        miningNavigationCueId = undefined
        miningCue = activeCues[0]
      } else if (revisionChanged) {
        miningNavigationCueId = undefined
        miningCue = cues.find(cue => cue.id === miningCue?.id) ?? activeCues[0]
      }
      miningDisplayCues = activeCues.some(cue => cue.id === miningCue?.id)
        ? activeCues
        : (miningCue ? [miningCue] : [])
    }

    miningTrackId = trackId
    miningRevisionSeen = revision
    miningEffectiveTimeSeen = effectiveTime
  }

  function enterMiningMode () {
    if (miningMode || isMiniplayer || SUPPORTS.isMobile) return
    miningPlaybackSession = beginMiningPlaybackSession(paused, $settings.miningPauseOnEnter)
    miningMode = true
    miningTrackId = undefined
    miningNavigationCueId = undefined
    miningRevisionSeen = -1
    miningEffectiveTimeSeen = Number.NaN
    if (miningPlaybackSession.autoPaused) {
      video.pause()
      pip.element.value?.pause()
    }
    if (subtitles) {
      miningCue = subtitles.getMiningCueAt(currentTime + Number(subtitleDelay))
      const activeCues = subtitles.getActiveMiningCues(currentTime + Number(subtitleDelay))
      miningDisplayCues = activeCues.length ? activeCues : (miningCue ? [miningCue] : [])
      subtitles.setMiningMode(true)
    }
  }

  function exitMiningMode () {
    if (!miningMode) return
    const resume = shouldResumeAfterMining(miningPlaybackSession)
    miningMode = false
    miningCue = undefined
    miningDisplayCues = []
    miningTrackId = undefined
    miningNavigationCueId = undefined
    miningRevisionSeen = -1
    miningEffectiveTimeSeen = Number.NaN
    subtitles?.setMiningMode(false)
    miningPlaybackSession = undefined
    closeMiningDictionary()
    if (resume) {
      Promise.allSettled([video.play(), pip.element.value?.play()])
    } else {
      video.pause()
      pip.element.value?.pause()
    }
  }

  function toggleMiningMode () {
    miningMode ? exitMiningMode() : enterMiningMode()
  }

  function navigateMiningSubtitle (direction: -1 | 1) {
    if (!subtitles) return
    const cues = subtitles.getMiningCues()
    const nextCue = navigateMiningCue(cues, miningCue?.id, direction, currentTime + Number(subtitleDelay))
    if (!nextCue) return
    if (nextCue.id === miningCue?.id) return
    miningCue = nextCue
    miningNavigationCueId = nextCue.id
    const activeCues = subtitles.getActiveMiningCues(nextCue.start)
    miningDisplayCues = activeCues.length ? activeCues : [nextCue]
    closeMiningDictionary()
    seekTo(miningCueSeekTime(nextCue, Number(subtitleDelay)))
  }

  function clearMiningDictionaryCloseTimer () {
    clearTimeout(miningDictionaryCloseTimer)
    miningDictionaryCloseTimer = 0
  }

  function closeMiningDictionary () {
    clearMiningDictionaryCloseTimer()
    clearTimeout(miningDictionaryLookupTimer)
    miningDictionaryLookupTimer = 0
    ++miningDictionaryRequestGeneration
    miningDictionaryPosition = undefined
    miningDictionaryEntries = []
    miningDictionaryLoading = false
    miningDictionaryError = ''
    miningDictionaryRequestKey = ''
  }

  function scheduleMiningDictionaryClose () {
    clearMiningDictionaryCloseTimer()
    miningDictionaryCloseTimer = setTimeout(closeMiningDictionary, 180)
  }

  function positionMiningDictionary (selection: MiningSelection) {
    const wrapperRect = wrapper.getBoundingClientRect()
    miningDictionaryPosition = calculateMiningPopupPosition(
      selection.anchor,
      { width: window.innerWidth, height: window.innerHeight },
      $settings.miningPopupWidth,
      $settings.miningPopupHeight,
      { left: wrapperRect.left, top: wrapperRect.top }
    )
  }

  function handleMiningSelection ({ detail: selection }: CustomEvent<MiningSelection | undefined>) {
    clearMiningDictionaryCloseTimer()
    if (!selection) {
      scheduleMiningDictionaryClose()
      return
    }
    const cue = miningDisplayCues.find(item => item.id === selection.cueId)
    if (!cue) return closeMiningDictionary()
    const request = getMiningLookupRequest(
      cue,
      selection,
      $settings.miningDictionaryScanLength,
      $settings.miningDictionaryScanNonJapanese,
      $settings.miningDictionaryMaxResults
    )
    if (!request) return closeMiningDictionary()

    positionMiningDictionary(selection)
    if (!miningDictionaryState.available) {
      miningDictionaryEntries = []
      miningDictionaryLoading = false
      miningDictionaryError = miningDictionaryState.error || (native.isApp
        ? 'The offline dictionary backend is unavailable.'
        : 'Dictionary lookup is only available in the Hayase desktop app.')
      return
    }
    if (!miningDictionaryState.order.term.some(id => miningDictionaryState.dictionaries.find(dictionary => dictionary.id === id)?.enabled.term)) {
      miningDictionaryEntries = []
      miningDictionaryLoading = false
      miningDictionaryError = 'Import and enable a term dictionary in Mining settings.'
      return
    }

    const requestKey = `${miningDictionaryState.generation}:${request.text}:${request.offset}:${request.scanLength}:${request.maxResults}`
    if (requestKey === miningDictionaryRequestKey && (miningDictionaryLoading || miningDictionaryEntries.length)) return

    clearTimeout(miningDictionaryLookupTimer)
    const requestGeneration = ++miningDictionaryRequestGeneration
    miningDictionaryRequestKey = requestKey
    const cachedEntries = miningDictionaryCache.get(requestKey)
    miningDictionaryEntries = cachedEntries ?? []
    miningDictionaryError = ''
    if (cachedEntries) {
      miningDictionaryLoading = false
      return
    }
    miningDictionaryLoading = true
    miningDictionaryLookupTimer = setTimeout(async () => {
      try {
        const result = await native.miningDictionaryLookup(request)
        if (requestGeneration !== miningDictionaryRequestGeneration) return
        miningDictionaryCache.set(requestKey, result.entries)
        miningDictionaryEntries = result.entries
      } catch (error) {
        if (requestGeneration !== miningDictionaryRequestGeneration) return
        if (error instanceof Error && error.message.includes('SUPERSEDED')) return
        miningDictionaryError = error instanceof Error ? error.message : 'Dictionary lookup failed'
      } finally {
        if (requestGeneration === miningDictionaryRequestGeneration) miningDictionaryLoading = false
      }
    }, 120)
  }

  function handlePlayerKeydown (event: KeyboardEvent) {
    stopAnimation()
    if (!miningMode || isMiniplayer || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    navigateMiningSubtitle(event.key === 'ArrowLeft' ? -1 : 1)
  }
  let wasPaused = false
  function startSeek () {
    wasPaused = paused
    if (!paused) video.pause()
  }

  function finishSeek () {
    seekTo(seekPercent * safeduration / 100)
    if (!wasPaused) video.play()
  }

  const chaptersHandler = new Chapters(mediaInfo)
  const chapters = chaptersHandler.chapters

  $: chaptersHandler.loadChapters(safeduration)

  function createDeband (video: HTMLVideoElement, playerDeband: boolean) {
    const create = () => {
      if (deband) return
      try {
        deband = new VideoDeband(video, { alpha: false, powerPreference: 'high-performance' })
        deband.canvas.classList.add('deband-canvas', 'w-full', 'h-full', 'pointer-events-none', 'object-contain')
        video.before(deband.canvas)
      } catch (e) {
        console.error('Failed to create video deband:', e)
        destroy()
      }
    }

    const destroy = () => {
      deband?.destroy()
      deband = undefined
    }

    if (playerDeband) create()

    return {
      destroy,
      update: (playerDeband: boolean) => {
        if (playerDeband) {
          create()
        } else {
          destroy()
        }
      }
    }
  }

  let completed = false
  async function checkCompletion () {
    if (!completed && $settings.playerAutocomplete) {
      const fromend = Math.max(180, safeduration / 10)
      if (safeduration && currentTime && readyState && safeduration - fromend < currentTime) {
        authAggregator.watch(mediaInfo.media, mediaInfo.episode)
        completed = true
      }
    }
  }

  // other
  $: if (ended && $settings.playerAutoplay && !isMiniplayer && (!$w2globby || Object.keys($w2globby.peers.value).length > 1)) next?.()

  function handleVisibility (visibility: DocumentVisibilityState) {
    if (!ended && $settings.playerPause && !pictureInPictureElement) {
      if (visibility === 'hidden') {
        visibilityPaused = paused
        if (!paused) playPause()
      } else {
        if (!visibilityPaused && paused) playPause()
      }
    }
  }
  let visibilityPaused = true
  let visibilityState: DocumentVisibilityState
  $: handleVisibility(visibilityState)

  function autoPlay () {
    if (!isMiniplayer) video.play()
  }

  const interval = setInterval(() => {
    video.load()
  }, 10_000)

  onDestroy(() => clearInterval(interval))

  $: if (readyState > 0) clearInterval(interval)

  let currentSkippable: Chapter | undefined
  function checkSkippableChapters () {
    const current = findChapter(currentTime, $chapters)
    const wasSkippable = currentSkippable?.autoskippable
    if (current) {
      currentSkippable = current.skippable ? current : undefined
      if ($settings.playerSkip && current.autoskippable && !wasSkippable && (!$w2globby || Object.keys($w2globby.peers.value).length > 1)) animating = true
    }
  }

  function stopAnimation () {
    animating = false
  }

  let animating = false

  function skip () {
    const current = findChapter(currentTime, $chapters)
    if (current) {
      if (!current.skippable && (current.end - current.start) > 100) {
        seekTo(currentTime + 85)
      } else {
        const endtime = current.end + 0.5
        seekTo(endtime)
        currentSkippable = undefined
      }
    } else if (currentTime < 10) {
      seekTo(90)
    } else if (safeduration - currentTime < 90) {
      seekTo(safeduration)
    } else {
      seekTo(currentTime + 85)
    }
  }

  function cast () {
    if ($displays[0]?.host === 'PresentationRequest') {
      $activeDisplay = $displays[0]
    } else {
      openPath(['cast'])
    }
  }

  let showStats = false

  $: seekIndex = Math.max(0, Math.floor(seekPercent * safeduration / 100 / thumbnailer.interval))

  $: playbackIndex = Math.max(0, Math.floor(currentTime / thumbnailer.interval))

  $: if (readyState > 1 && !seekIndex && canvasSource) thumbnailer._paintThumbnail(canvasSource, playbackIndex, videoWidth, videoHeight)

  $: native.setMediaSession(mediaInfo.session, mediaInfo.media.id, safeduration)
  $: native.setPositionState({ duration: safeduration, position: Math.min(Math.max(0, currentTime), safeduration), playbackRate: $playbackRate }, readyState === 0 ? 'none' : paused ? 'paused' : 'playing')
  $: native.setPlayBackState(readyState === 0 ? 'none' : paused ? 'paused' : 'playing')
  native.setActionHandler('play', playPause)
  native.setActionHandler('pause', playPause)
  native.setActionHandler('seekto', ({ seekTime }) => seekTo(seekTime ?? 0))
  native.setActionHandler('seekbackward', () => seek(-Number($settings.playerSeek)))
  native.setActionHandler('seekforward', () => seek(Number($settings.playerSeek)))
  native.setActionHandler('previoustrack', () => prev?.())
  native.setActionHandler('nexttrack', () => next?.())
  try {
    // about://flags/#auto-picture-in-picture-for-video-playback
    native.setActionHandler('enterpictureinpicture', () => {
      goto('/#/app/player')
      pip.pip(true)
    })
  } catch (e) {}

  let openPath: (path: string[]) => Promise<void>
  let open = false

  function openSettings () {
    if ($inputType !== 'mouse' || open) return
    open = true
  }

  function cycleSubtitles (e: KeyboardEvent | MouseEvent) {
    if (!subtitles) return
    const entries = Object.entries(subtitles._tracks.value)
    if (!entries.length) return
    const offset = e.shiftKey ? -1 : 1
    const index = entries.findIndex(([index]) => index === subtitles!.current.value) + offset
    const [id, info] = entries.at(index) ?? [-1, { meta: { name: 'Off', language: 'Eng' } }]
    playAnimation(info.meta.name ?? info.meta.language ?? 'Eng')
    subtitles.current.set(id)
  }

  function seekBarKey (event: KeyboardEvent) {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopPropagation()
    }

    switch (event.key) {
      case 'ArrowLeft':
        seek(-Number($settings.playerSeek))
        break
      case 'ArrowRight':
        seek(Number($settings.playerSeek))
        break
      case 'Enter':
        playPause()
        break
    }
  }
  function ss () {
    screenshot(deband?.canvas ?? canvasSource, videoWidth, videoHeight, subtitles)
  }
  let fitWidth = false
  function getMiningKeybind () {
    if (SUPPORTS.isMobile) return {}
    return {
      KeyV: {
        fn: toggleMiningMode,
        id: 'toggle_mining',
        icon: Pickaxe,
        type: 'icon',
        desc: 'Toggle Mining Mode'
      }
    }
  }
  loadWithDefaults({
    KeyX: {
      fn: ss,
      id: 'screenshot_monitor',
      icon: ScreenShare,
      type: 'icon',
      desc: 'Save Screenshot to Clipboard'
    },
    KeyI: {
      fn: () => { showStats = !showStats },
      icon: List,
      id: 'list',
      type: 'icon',
      desc: 'Toggle Stats'
    },
    Space: {
      fn: (e) => {
        if ('repeat' in e && e.repeat) return
        playPause()
      },
      id: 'play_arrow',
      icon: Play,
      type: 'icon',
      desc: 'Play/Pause'
    },
    KeyN: {
      fn: () => next?.(),
      id: 'skip_next',
      icon: SkipForward,
      type: 'icon',
      desc: 'Next Episode'
    },
    KeyB: {
      fn: () => prev?.(),
      id: 'skip_previous',
      icon: SkipBack,
      type: 'icon',
      desc: 'Previous Episode'
    },
    KeyA: {
      fn: () => {
        $settings.playerDeband = !$settings.playerDeband
      },
      id: 'deblur',
      icon: Contrast,
      type: 'icon',
      desc: 'Toggle Video Debanding'
    },
    KeyM: {
      fn: () => (muted = !muted),
      id: 'volume_off',
      icon: VolumeX,
      type: 'icon',
      desc: 'Toggle Mute'
    },
    KeyP: {
      fn: () => pip.pip(),
      id: 'picture_in_picture',
      icon: PictureInPicture2,
      type: 'icon',
      desc: 'Toggle Picture in Picture'
    },
    KeyF: {
      fn: () => fullscreen(),
      id: 'fullscreen',
      icon: Maximize,
      type: 'icon',
      desc: 'Toggle Fullscreen'
    },
    KeyS: {
      fn: () => skip(),
      id: '+90',
      desc: 'Skip Intro/90s'
    },
    KeyW: {
      fn: () => { fitWidth = !fitWidth },
      id: 'fit_width',
      icon: Proportions,
      type: 'icon',
      desc: 'Toggle Video Cover'
    },
    KeyD: {
      fn: () => cast(),
      id: 'cast',
      icon: Cast,
      type: 'icon',
      desc: 'Cast'
    },
    KeyC: {
      fn: (e) => cycleSubtitles(e),
      id: 'subtitles',
      icon: Captions,
      type: 'icon',
      desc: 'Cycle Subtitles'
    },
    ...getMiningKeybind(),
    ArrowLeft: {
      fn: (e) => {
        if ($inputType === 'dpad') return
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        seek(-Number($settings.playerSeek))
      },
      id: 'fast_rewind',
      icon: Rewind,
      type: 'icon',
      desc: 'Rewind'
    },
    ArrowRight: {
      fn: (e) => {
        if ($inputType === 'dpad') return
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        seek(Number($settings.playerSeek))
      },
      id: 'fast_forward',
      icon: FastForward,
      type: 'icon',
      desc: 'Seek'
    },
    ArrowUp: {
      fn: (e) => {
        if ($inputType === 'dpad') return
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        changeVolume(0.05)
      },
      id: 'volume_up',
      icon: Volume2,
      type: 'icon',
      desc: 'Volume Up'
    },
    ArrowDown: {
      fn: (e) => {
        if ($inputType === 'dpad') return
        e.preventDefault()
        e.stopImmediatePropagation()
        e.stopPropagation()
        changeVolume(-0.05)
      },
      id: 'volume_down',
      icon: Volume1,
      type: 'icon',
      desc: 'Volume Down'
    },
    BracketLeft: {
      fn: () => { $playbackRate = Math.min(16, Math.max(0.1, $playbackRate - 0.1)) },
      id: 'history',
      icon: RotateCcw,
      type: 'icon',
      desc: 'Decrease Playback Rate'
    },
    BracketRight: {
      fn: () => { $playbackRate = Math.min(16, Math.max(0.1, $playbackRate + 0.1)) },
      id: 'update',
      icon: RotateCw,
      type: 'icon',
      desc: 'Increase Playback Rate'
    },
    Backslash: {
      fn: () => { $playbackRate = 1 },
      icon: RefreshCcw,
      id: 'schedule',
      type: 'icon',
      desc: 'Reset Playback Rate'
    },
    Semicolon: {
      fn: () => { subtitleDelay -= 0.1 },
      icon: DecimalsArrowLeft,
      type: 'icon',
      id: 'subtitle_delay_minus',
      desc: 'Decrease Subtitle Delay'
    },
    Quote: {
      fn: () => { subtitleDelay += 0.1 },
      icon: DecimalsArrowRight,
      type: 'icon',
      id: 'subtitle_delay_plus',
      desc: 'Increase Subtitle Delay'
    }
  })

  $condition = () => !isMiniplayer

  function holdToFF (document: HTMLElement, type: 'key' | 'pointer') {
    const ctrl = new AbortController()
    let timeout = 0
    let oldPlaybackRate = $playbackRate
    let wasPaused = paused
    const startFF = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (fastForwarding) return
        wasPaused = paused
        paused = false
        fastForwarding = true
        oldPlaybackRate = $playbackRate
        $playbackRate = 2
      }, 1000)
    }
    const endFF = () => {
      clearTimeout(timeout)
      if (!fastForwarding) return
      fastForwarding = false
      $playbackRate = oldPlaybackRate
      paused = wasPaused
    }
    document.addEventListener(type + 'down' as 'keydown' | 'pointerdown', event => {
      if (isMiniplayer) return
      if ('code' in event && (event.code !== 'Space')) return
      if ('button' in event && event.button !== 0) return
      if ('repeat' in event && event.repeat) return
      if ('pointerId' in event) {
        document.setPointerCapture(event.pointerId)
      }
      startFF()
    }, { ...ctrl, capture: type === 'key' })
    document.addEventListener(type + 'up' as 'keyup' | 'pointerup', event => {
      if (isMiniplayer) return
      if ('code' in event && event.code === 'Space') return endFF()
      if ('pointerId' in event) document.releasePointerCapture(event.pointerId)
    }, ctrl)
    document.addEventListener('click', e => {
      if (isMiniplayer) return
      if (fastForwarding) e.stopImmediatePropagation()
      endFF()
    }, ctrl)

    if (type === 'pointer') {
      document.addEventListener('pointercancel', event => {
        if ('pointerId' in event) document.releasePointerCapture(event.pointerId)
        endFF()
      }, ctrl)
    }

    return { destroy: () => ctrl.abort() }
  }

  function updateState (state: { paused: boolean, time: number }) {
    currentTime = state.time
    paused = state.paused
  }

  $: $w2globby?.playerStateChanged({ paused, time: Math.floor(currentTime) })
  $: $w2globby?.on('player', updateState)

  function loadAnimeProgress () {
    if (!mediaInfo.media.id || !mediaInfo.episode) return

    const animeProgress = getAnimeProgress(mediaInfo.media.id)
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (!animeProgress || animeProgress.episode !== mediaInfo.episode) return

    currentTime = Math.max(animeProgress.currentTime - 5, 0)
  }

  function saveAnimeProgress () {
    if (!mediaInfo.media.id || !mediaInfo.episode) return

    if (buffering || paused) return

    setAnimeProgress(mediaInfo.media.id, { episode: mediaInfo.episode, currentTime, safeduration })
  }
  const saveProgressLoop = setInterval(saveAnimeProgress, 10000)
  onDestroy(() => clearInterval(saveProgressLoop))

  function handleWheel ({ shiftKey, deltaY }: WheelEvent) {
    const sign = Math.sign(deltaY)
    if (shiftKey) {
      seek(Number($settings.playerSeek) * sign * -1)
    } else {
      changeVolume(-0.05 * sign)
    }
  }

  function toggleTimeFormat () {
    $timeFormat = $timeFormat === 'negative' ? 'positive' : 'negative'
  }

  let clientWidth = 0
  let clientHeight = 0
</script>

<svelte:document bind:fullscreenElement bind:visibilityState use:holdToFF={'key'} on:fullscreenchange={checkMobileFullscreen} />
<svelte:window on:keydown|capture={handlePlayerKeydown} />

<div class='size-full relative content-center bg-background overflow-clip text-left touch-none'
  class:fitWidth class:seeking class:pip={pictureInPictureElement} bind:this={wrapper}
  on:navigate={() => resetMove(2000)}
  on:wheel={handleWheel}
  on:focusin={stopAnimation}
  on:pointerenter={stopAnimation}
  on:pointermove={stopAnimation}
  on:dragover|preventDefault
  on:paste={e => subtitles?.handleTransfer(e)}
  on:drop={e => subtitles?.handleTransfer(e)}
>
  {#if useMediaBunnyPlayback}
    {#await import('./bunny/video.svelte') then BunnyVideo}
      <BunnyVideo.default
        src={mediaInfo.file.url}
        {immersed}
        {isMiniplayer}
        {fitWidth}
        {holdToFF}
        {otherFiles}
        {pip}
        current={mediaInfo}
        bind:this={video}
        bind:canvasSource
        bind:videoHeight
        bind:videoWidth
        bind:currentTime
        bind:duration
        bind:ended
        bind:paused
        bind:muted
        bind:readyState
        bind:buffered
        bind:clientWidth
        bind:clientHeight
        bind:subtitles
        bind:playbackRate={$playbackRate}
        bind:volume={exponentialVolume}
        on:fallback={handleMediaBunnyFallback}
        on:click={mobilePlayPause}
        on:dblclick={fullscreen}
        on:loadeddata={checkAudio}
        on:loadedmetadata={loadAnimeProgress}
        on:timeupdate={checkSkippableChapters}
        on:timeupdate={checkCompletion}
        on:loadedmetadata={autoPlay}
        on:pointermove={() => resetMove()}
        on:contextmenu={openSettings}
        class={cn('size-full touch-none object-contain min-h-40',
          immersed && 'cursor-none',
          isMiniplayer && 'cursor-pointer',
          fitWidth && 'object-cover'
        )}
      />
    {/await}
  {:else}
    <video class='size-full touch-none' preload='metadata' class:cursor-none={immersed} class:cursor-pointer={isMiniplayer} class:object-cover={fitWidth} class:opacity-0={$settings.playerDeband || seeking || pictureInPictureElement} class:absolute={$settings.playerDeband} class:top-0={$settings.playerDeband}
      use:setSource
      use:setPipVideo={{ subtitles, deband }}
      use:createDeband={$settings.playerDeband}
      use:holdToFF={'pointer'}
      crossorigin='anonymous'
      src={mediaInfo.file.url}
      bind:videoHeight
      bind:videoWidth
      bind:currentTime
      bind:duration
      bind:ended
      bind:paused
      bind:muted
      bind:readyState
      bind:buffered
      bind:playbackRate={$playbackRate}
      bind:volume={exponentialVolume}
      bind:this={video}
      use:customDoubleClick={{ single: mobilePlayPause, double: fullscreen, condition: !isMiniplayer }}
      on:loadeddata={checkAudio}
      on:loadedmetadata={loadAnimeProgress}
      on:timeupdate={checkSkippableChapters}
      on:timeupdate={checkCompletion}
      on:loadedmetadata={autoPlay}
      on:pointermove={() => resetMove()}
      on:contextmenu={openSettings}
    />
  {/if}
  {#if miningMode && !isMiniplayer}
    <MiningSubtitle cues={miningDisplayCues} css={$settings.miningSubtitleCss} on:selection={handleMiningSelection} />
    {#if miningDictionaryPosition}
      <MiningDictionaryPopup
        entries={miningDictionaryEntries}
        loading={miningDictionaryLoading}
        error={miningDictionaryError}
        position={miningDictionaryPosition}
        scale={$settings.miningPopupScale}
        collapseMode={$settings.miningDictionaryCollapseMode}
        expandFirstDictionary={$settings.miningDictionaryExpandFirst}
        twoColumnLayout={$settings.miningDictionaryTwoColumn}
        compactGlossaries={$settings.miningDictionaryCompactGlossaries}
        showExpressionTags={$settings.miningDictionaryShowExpressionTags}
        dictionaryStyles={miningDictionaryState.styles}
        customCss={$settings.miningDictionaryCss}
        on:close={closeMiningDictionary}
        on:enter={clearMiningDictionaryCloseTimer}
        on:leave={scheduleMiningDictionaryClose}
      />
    {/if}
  {/if}
  {#if !isMiniplayer}
    <div class='absolute size-full flex items-center justify-center top-0 pointer-events-none'>
      <DownloadStats {immersed} />
      {#if seeking}
        {#await thumbnailer.getThumbnail(seekIndex) then src}
          {#if src}
            <img {src} alt='thumbnail' class='size-full bg-background absolute top-0 right-0 object-contain' loading='lazy' decoding='async' class:!object-cover={fitWidth} />
          {/if}
        {/await}
      {/if}
      {#if showStats}
        <StatsForNerds {subtitleDelay} {currentTime} {safeduration} {readyState} volume={$volume} {video} {buffered} {videoWidth} {videoHeight} close={() => { showStats = false }} />
      {/if}
      {#if $settings.minimalPlayerUI || (SUPPORTS.isMobile && !SUPPORTS.isAndroidTV)}
        {#if !SUPPORTS.isMobile}
          <Button
            class='inline-flex p-3 size-12 absolute z-[1] top-4 right-20 bg-background/20 pointer-events-auto transition-opacity desktop:select:opacity-100 {immersed && 'opacity-0'} {!pointerMoveTimeout && 'delay-150'}'
            variant={miningMode ? 'secondary' : 'ghost'}
            aria-label='Toggle mining mode'
            aria-pressed={miningMode}
            title='Toggle mining mode'
            on:click={toggleMiningMode}
            on:keydown={keywrap(toggleMiningMode)}
          >
            <Pickaxe size='24px' />
          </Button>
        {/if}
        <Options {wrapper} bind:open bind:openPath {video} {seekTo} screenshot={ss} {selectAudio} {selectVideo} {fullscreen} chapters={$chapters} {subtitles} {videoFiles} {selectFile} {pip} bind:playbackRate={$playbackRate} bind:subtitleDelay
          class='inline-flex p-3 size-12 absolute z-[1] top-4 right-4 bg-background/20 pointer-events-auto transition-opacity desktop:select:opacity-100 {immersed && 'opacity-0'} {!pointerMoveTimeout && 'delay-150'}' />
      {/if}
      {#if fastForwarding}
        <div class='absolute top-10 font-bold text-sm animate-[fade-in_.4s_ease] flex items-center leading-none bg-background/60 px-4 py-2 rounded-2xl'>x2 <FastForward class='ml-2' size='12' fill='currentColor' /></div>
      {/if}
      {#if !SUPPORTS.isAndroidTV}
        <div class='mobile:flex hidden gap-10 absolute items-center transition-opacity z-[0]' class:opacity-0={immersed || seeking} class:delay-150={!pointerMoveTimeout}>
          <Button class='p-3 size-10 pointer-events-auto rounded-[50%] bg-background/20' variant='ghost' disabled={!prev} on:click={() => prev?.()}>
            <SkipBack fill='currentColor' strokeWidth='1' />
          </Button>
          <Button class={cn('p-2.5 size-12 pointer-events-auto rounded-[50%] bg-background/20', buffering && 'opacity-10')} variant='ghost' on:click={playPause}>
            {#if paused}
              <Play fill='currentColor' class='p-0.5' />
            {:else}
              <Pause fill='currentColor' strokeWidth='1' />
            {/if}
          </Button>
          <Button class='p-3 size-10 pointer-events-auto rounded-[50%] bg-background/20' variant='ghost' disabled={!next} on:click={() => next?.()}>
            <SkipForward fill='currentColor' strokeWidth='1' />
          </Button>
        </div>
        <div class='size-full mobile:flex hidden justify-between absolute'>
          <div class='h-full w-1/4 pointer-events-auto' use:holdToFF={'pointer'} use:customDoubleClick={{ double: () => seek(-Number($settings.playerSeek)), single: mobilePlayPause }} />
          <div class='h-full w-1/4 pointer-events-auto' use:holdToFF={'pointer'} use:customDoubleClick={{ double: () => seek(Number($settings.playerSeek)), single: mobilePlayPause }} />
        </div>
      {/if}
      {#if buffering}
        <div in:fade={{ duration: 200, delay: 500 }} out:fade={{ duration: 200 }}>
          <div class='border-[3px] rounded-[50%] w-10 h-10 drop-shadow-lg border-transparent border-t-foreground animate-spin' />
        </div>
      {/if}
      <Animations />
    </div>
    {#if currentSkippable}
      <ProgressButton onclick={skip} bind:animating size='default' duration={3000} class={cn('px-7 font-bold absolute bottom-40 right-10 transition-opacity', !pointerMoveTimeout && 'delay-150', immersed && !animating && 'opacity-0')}>
        Skip {currentSkippable.skiptype ?? ''}
      </ProgressButton>
    {/if}
    <div class='absolute w-full bottom-0 flex flex-col gradient px-6 py-3 transition-opacity desktop:select:opacity-100' class:opacity-0={immersed} class:delay-150={!pointerMoveTimeout}>
      <div class='flex items-end gap-1'>
        <div class='flex flex-col gap-2 text-left cursor-pointer'>
          <EpisodesModal portal={wrapper} {mediaInfo} />
        </div>
        <div class='flex flex-col gap-2 grow-0 items-end self-end text-shadow-lg ml-auto'>
          <div class='text-[rgba(217,217,217,0.6)] text-sm leading-none font-light line-clamp-1 capitalize'>{getChapterTitle(seeking ? seekPercent * safeduration / 100 : currentTime, $chapters) || ''}</div>
          <div class='ml-auto self-end text-sm leading-none font-light text-nowrap' use:click={toggleTimeFormat}>
            {#if $timeFormat === 'positive'}
              {toTS(seeking ? seekPercent * safeduration / 100 : currentTime)} / {toTS(safeduration)}
            {:else}
              -{toTS(safeduration - (seeking ? seekPercent * safeduration / 100 : currentTime))} / {toTS(safeduration)}
            {/if}
          </div>
        </div>
      </div>
      <Seekbar {duration} {currentTime} buffer={buffer / duration * 100} chapters={$chapters} bind:seeking bind:seek={seekPercent} on:seeked={finishSeek} on:seeking={startSeek} {thumbnailer} on:keydown={seekBarKey} on:dblclick={fullscreen} />
      {#if !$settings.minimalPlayerUI && (!SUPPORTS.isAndroid || SUPPORTS.isAndroidTV) && !SUPPORTS.isIOS}
        <div class='justify-between gap-2 flex'>
          <div class='flex text-foreground gap-2'>
            <Button class='p-3 size-12 relative shrink-0' variant='ghost' on:click={playPause} on:keydown={keywrap(playPause)}>
              {#if paused}
                <div transition:scaleBlurFade class='absolute'>
                  <Play size='24px' fill='currentColor' class='p-0.5' />
                </div>
              {:else}
                <div transition:scaleBlurFade class='absolute'>
                  <Pause size='24px' fill='currentColor' strokeWidth='1' />
                </div>
              {/if}
            </Button>
            {#if prev}
              <Button class='p-3 size-12' variant='ghost' on:click={prev} on:keydown={keywrap(prev)}>
                <SkipBack size='24px' fill='currentColor' strokeWidth='1' />
              </Button>
            {/if}
            {#if next}
              <Button class='p-3 size-12' variant='ghost' on:click={next} on:keydown={keywrap(next)}>
                <SkipForward size='24px' fill='currentColor' strokeWidth='1' />
              </Button>
            {/if}
            <Volume bind:volume={$volume} bind:muted />
          </div>
          <div class='flex gap-2'>
            {#if $playbackRate !== 1 && $playbackRate}
              <Button class='p-3 size-12 hidden sm:flex leading-none text-base font-bold' variant='ghost' on:click={() => openPath(['rate'])} on:keydown={keywrap(() => openPath(['rate']))}>
                x{$playbackRate?.toFixed(1)}
              </Button>
            {/if}
            {#if !SUPPORTS.isMobile}
              <Button
                class='p-3 size-12 relative shrink-0'
                variant={miningMode ? 'secondary' : 'ghost'}
                aria-label='Toggle mining mode'
                aria-pressed={miningMode}
                title='Toggle mining mode'
                on:click={toggleMiningMode}
                on:keydown={keywrap(toggleMiningMode)}
              >
                <Pickaxe size='24px' />
              </Button>
            {/if}
            <Options {fullscreen} {wrapper} screenshot={ss} {seekTo} bind:open bind:openPath {video} {selectAudio} {selectVideo} chapters={$chapters} {subtitles} {videoFiles} {selectFile} {pip} bind:playbackRate={$playbackRate} bind:subtitleDelay />
            {#if $w2globby}
              <Button class='p-3 size-12 relative shrink-0 animated-icon' variant='ghost' on:click={() => { chatOpen = !chatOpen }} on:keydown={keywrap(() => { chatOpen = !chatOpen })}>
                <Messages size={24} />
              </Button>
            {/if}
            {#if subtitles}
              {#if $subtitleAlignmentStatus && $subtitleAlignmentStatus !== 'hidden'}
                <div
                  class='size-12 flex shrink-0 items-center justify-center'
                  class:text-amber-400={$subtitleAlignmentStatus === 'provisional'}
                  class:text-green-400={$subtitleAlignmentStatus === 'confirmed'}
                  role='status'
                  aria-live='polite'
                  aria-atomic='true'
                  aria-label={$subtitleAlignmentStatus === 'timing' ? 'Timing subtitles' : $subtitleAlignmentStatus === 'provisional' ? 'Subtitle timing applied; verifying' : 'Subtitles timed'}
                  title={$subtitleAlignmentStatus === 'timing' ? 'Timing subtitles' : $subtitleAlignmentStatus === 'provisional' ? 'Subtitle timing applied; verifying' : 'Subtitles timed'}
                >
                  {#if $subtitleAlignmentStatus === 'confirmed'}
                    <CircleCheck size='24px' strokeWidth='2.5' />
                  {:else}
                    <LoaderCircle size='24px' strokeWidth='2.5' class='animate-spin' />
                  {/if}
                </div>
              {/if}
              <Button class='p-3 size-12' variant='ghost' on:click={() => openPath(['subs'])} on:keydown={keywrap(() => openPath(['subs']))}>
                <Subtitles size='24px' fill='currentColor' strokeWidth='0' />
              </Button>
            {/if}
            <Button class='p-3 size-12 relative shrink-0' variant='ghost' on:click={() => pip.pip()} on:keydown={keywrap(() => pip.pip())}>
              {#if pictureInPictureElement}
                <div transition:scaleBlurFade class='absolute'>
                  <PictureInPictureExit size='24px' strokeWidth='2' />
                </div>
              {:else}
                <div transition:scaleBlurFade class='absolute'>
                  <PictureInPictureOff size='24px' strokeWidth='2' />
                </div>
              {/if}
            </Button>
            {#if $displays.length}
              <Button class='p-3 size-12 hidden sm:flex' variant='ghost' on:click={cast} on:keydown={keywrap(cast)}>
                <!-- <Cast size='24px' fill='white' strokeWidth='2' />
            {:else} -->
                <Cast size='24px' strokeWidth='2' />
              </Button>
            {/if}
            <Button class='p-3 size-12 relative animated-icon shrink-0' variant='ghost' on:click={fullscreen} on:keydown={keywrap(fullscreen)}>
              {#if fullscreenElement}
                <div transition:scaleBlurFade class='absolute'>
                  <Minimize size='24px' class='p-0.5' strokeWidth='2.5' />
                </div>
              {:else}
                <div transition:scaleBlurFade class='absolute'>
                  <Maximize size='24px' class='p-0.5' strokeWidth='2.5' />
                </div>
              {/if}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class='absolute w-full left-0 bottom-0 flex justify-center'>
      <Button variant='ghost' class='drop-shadow-[0_0_7px_#000] mb-1 relative' size='icon' on:pointerdown={e => { e.stopPropagation(); playPause() }}>
        {#if paused}
          <div transition:scaleBlurFade class='absolute'>
            <Play size={iconSizes.lg} fill='currentColor' class='px-0.5' />
          </div>
        {:else}
          <div transition:scaleBlurFade class='absolute'>
            <Pause size={iconSizes.lg} fill='currentColor' strokeWidth='1' />
          </div>
        {/if}
      </Button>
    </div>
  {/if}
</div>
{#if $w2globby && !isMiniplayer && chatOpen}
  <W2GChatPanel />
{/if}

<style>
  .fitWidth :global(.deband-canvas) {
    object-fit: cover !important;
  }

  .seeking :global(.deband-canvas), .pip :global(.deband-canvas), .seeking :global(.JASSUB) {
    display: none;
  }

  .gradient {
    background: linear-gradient(to top, oklab(0 0 0 / 0.85) 0%, oklab(0 0 0 / 0.7) 35%, oklab(0 0 0 / 0) 100%);
  }

  /* .gradient-to-bottom {
    background: linear-gradient(to bottom, oklab(0 0 0 / 0.85) 0%, oklab(0 0 0 / 0.7) 35%, oklab(0 0 0 / 0) 100%);
  } */
</style>
