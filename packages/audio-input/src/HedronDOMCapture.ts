/**
 * Sentinel device ID used to identify the Hedron internal audio source.
 */
export const HEDRON_INTERNAL_DEVICE_ID = 'hedron-internal'

/**
 * Captures audio from all <audio> and <video> elements in the document —
 * including off-DOM elements created by sketch code — and feeds them into a
 * single AnalyserNode for frequency analysis.
 *
 * How sketch audio is captured
 * ────────────────────────────
 * Sketches typically create HTMLVideoElements off-DOM and set up their own
 * AudioContext. DOM scanning never finds these elements. Instead, on `start()`
 * we monkey-patch `AudioContext.prototype.createMediaElementSource` so every
 * subsequent call — regardless of which context made it — is intercepted:
 *
 *   sketch AudioContext                    capture AudioContext
 *   ─────────────────────────────────────────────────────────
 *   MediaElementAudioSourceNode ──► sketch destination  (speakers, unchanged)
 *                               └──► MediaStreamAudioDestinationNode
 *                                         │ (tapDest.stream — live track)
 *                                         ▼
 *                                   createMediaStreamSource
 *                                         │
 *                                         ▼
 *                                      mergeGain ──► analyser
 *
 * Each tap source is held in `_tapSources` to prevent GC.
 *
 * DOM-appended elements (less common in Hedron sketches) are still handled via
 * MutationObserver as a fallback.
 */
export class HedronDOMCapture {
  /** AudioContext that owns the analysis graph. */
  public readonly context: AudioContext
  /** AnalyserNode — pass to AudioAnalyzer.setupAudioData(). */
  public readonly analyser: AnalyserNode

  private readonly mergeGain: GainNode
  /** Strong references to cross-context tap sources to prevent GC. */
  private readonly _tapSources: MediaStreamAudioSourceNode[] = []
  private _patched = false
  private _domElements: WeakSet<HTMLMediaElement> = new WeakSet()
  private _observer: MutationObserver | null = null

  constructor() {
    this.context = new AudioContext()
    this.mergeGain = this.context.createGain()
    this.analyser = this.context.createAnalyser()
    // Match the smoothing used by the mic path (default 0.8).
    // Setting it to 0 caused overly jumpy / instantaneous FFT values.
    this.analyser.smoothingTimeConstant = 0.8
    // The default maxDecibels (-30 dB) is calibrated for microphone input.
    // Digital audio tapped directly off a Web Audio graph typically sits at
    // -10 to 0 dBFS, which saturates every bin at the default ceiling and
    // compresses the apparent dynamic range (low-end bins stay at 1.0 while
    // highs vary — reads as "low end boosted" and narrow range).
    // Raising the ceiling to -6 dBFS gives proper headroom for line-level audio.
    this.analyser.maxDecibels = -6
    this.mergeGain.connect(this.analyser)
  }

  /**
   * Install the prototype patch, resume the context, and scan for DOM elements.
   * Safe to call multiple times — patching is idempotent.
   */
  public start(): void {
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {})
    }

    this._patchCreateMediaElementSource()

    // Fallback: any <video>/<audio> that is actually in the DOM
    const existing = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'))
    console.log(`[HedronDOMCapture] Start — found ${existing.length} DOM media element(s)`)
    existing.forEach((el) => this._connectDOMElement(el))

    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            this._connectDOMElement(node)
          } else if (node instanceof Element) {
            node
              .querySelectorAll<HTMLMediaElement>('video, audio')
              .forEach((el) => this._connectDOMElement(el))
          }
        }
      }
    })
    this._observer.observe(document.body, { childList: true, subtree: true })
  }

  public stop(): void {
    this._observer?.disconnect()
    this._observer = null
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  /**
   * Patch `AudioContext.prototype.createMediaElementSource` so every sketch
   * that calls it (no matter which AudioContext it uses) gets an invisible tap
   * bridged back into our capture graph.
   */
  private _patchCreateMediaElementSource(): void {
    if (this._patched) return
    this._patched = true

    const self = this
    const original = AudioContext.prototype.createMediaElementSource

    AudioContext.prototype.createMediaElementSource = function (
      this: AudioContext,
      element: HTMLMediaElement,
    ): MediaElementAudioSourceNode {
      const source = original.call(this, element)

      // Skip if this is already our own capture context (e.g. DOM element path)
      if (this === self.context) return source

      try {
        // Create a tap destination inside the sketch's own context
        const tapDest = this.createMediaStreamDestination()
        source.connect(tapDest)

        // The tapDest.stream track is live because source is connected to it.
        // Bridge it into the capture context via the MediaStream API.
        const captureSource = self.context.createMediaStreamSource(tapDest.stream)
        captureSource.connect(self.mergeGain)
        self._tapSources.push(captureSource)

        console.log(
          `[HedronDOMCapture] Intercepted createMediaElementSource — tap #${self._tapSources.length} connected`,
        )
      } catch (error) {
        console.warn('[HedronDOMCapture] Could not create tap:', error)
      }

      return source
    }

    console.log('[HedronDOMCapture] Patched AudioContext.prototype.createMediaElementSource')
  }

  private _connectDOMElement(el: HTMLMediaElement): void {
    if (this._domElements.has(el)) return
    this._domElements.add(el)
    try {
      // This goes through the patched createMediaElementSource, but the
      // `this === self.context` guard skips the tap so we handle it directly.
      const source = this.context.createMediaElementSource(el)
      source.connect(this.mergeGain)
      source.connect(this.context.destination)
      console.log('[HedronDOMCapture] DOM element connected')
    } catch (error) {
      console.warn('[HedronDOMCapture] Could not connect DOM element:', error)
    }
  }
}
