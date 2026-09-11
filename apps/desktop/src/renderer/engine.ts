import { HedronEngine } from '@hedron-gl/engine'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { Clock } from '@hedron-gl/clock'
import { MidiInput, MidiInputPanel, MidiGlobalPanel } from '@hedron-gl/midi-input'
import { GamepadInput, GamepadInputPanel, GamepadGlobalPanel } from '@hedron-gl/gamepad-input'
import { LFOInput, LFOInputPanel } from '@hedron-gl/lfo-input'
import { AudioInput, AudioInputPanel, AudioGlobalPanel } from '@hedron-gl/audio-input'
import { TimelineInput, TimelineGlobalPanel, TimelineInputPanel } from '@hedron-gl/timeline'
import { SceneControlPlugin, SceneControlGlobalPanel } from '@hedron-gl/scene-control'
import { ParamPresetsPlugin, ParamPresetsPanel } from '@hedron-gl/param-presets'
import { DmxLightingPlugin, DmxLightingGlobalPanel } from '@hedron-gl/dmx-lighting'

export const performanceMonitor = new Stats()

// TODO: This will eventually be handed to the engine but there's nothing to use it for yet
export const clock = new Clock()

export const engine = new HedronEngine({
  onFrameStart: performanceMonitor.begin,
  onFrameEnd: performanceMonitor.end,
  rendererType: import.meta.env.HEDRON_RENDERER_TYPE ?? 'webgl',
  canvasSizeMode: 'fixedAspectRatio',
  clock,
})

export const engineStore = engine.getStore()

engine.registerPlugin(new MidiInput(engine))
engine.registerPlugin(new LFOInput(engine))
engine.registerPlugin(new AudioInput(engine))
engine.registerPlugin(new GamepadInput(engine))
engine.registerPlugin(new TimelineInput())
engine.registerPlugin(new SceneControlPlugin())
engine.registerPlugin(new ParamPresetsPlugin())

const dmxPlugin = new DmxLightingPlugin(engine)
engine.registerPlugin(dmxPlugin)

// Expose engine and DMX API to window for sketch access
;(window as any).hedron = {
  engine,
  lighting: {
    source: dmxPlugin.source.bind(dmxPlugin),
    sourceFromCanvas: dmxPlugin.sourceFromCanvas.bind(dmxPlugin),
    setColor: dmxPlugin.setColor.bind(dmxPlugin),
    setFixtureColor: dmxPlugin.setFixtureColor.bind(dmxPlugin),
    setFixtureMappings: dmxPlugin.setFixtureMappings.bind(dmxPlugin),
  },
}

export const pluginViews = {
  inputPanel: {
    midi: MidiInputPanel,
    lfo: LFOInputPanel,
    audio: AudioInputPanel,
    gamepad: GamepadInputPanel,
    ['timeline-track']: TimelineInputPanel,
  },
  globalPanel: {
    ['audio-input']: AudioGlobalPanel,
    ['gamepad-input']: GamepadGlobalPanel,
    ['midi-input']: MidiGlobalPanel,
    ['timeline-input']: TimelineGlobalPanel,
    ['scene-control']: SceneControlGlobalPanel,
    ['dmx-lighting']: DmxLightingGlobalPanel,
  },
  sketchCollapsible: {
    ['param-presets']: ParamPresetsPanel,
  },
}
