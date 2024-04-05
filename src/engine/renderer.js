import * as THREE from 'three'
import { EffectComposer, RenderPass, SavePass, TextureEffect, EffectPass, ClearPass } from 'postprocessing'

import getSketchParams from '../selectors/getSketchParams'

import uiEventEmitter from '../utils/uiEventEmitter'
import * as engine from './'

import getScenes from '../selectors/getScenes'

// EXPORT STUFF
import { clockPulse, clockReset } from '../store/clock/actions'
import { rSettingsUpdate } from '../store/settings/actions'
let fs = require('fs')
let childProcess = require('child_process')
const _path = require('path')
import { remote } from 'electron'
let save
// END EXPORT STUFF

let store, domEl, outputEl, viewerEl, isSendingOutput, rendererWidth, rendererHeight,
  previewCanvas, previewContext, outputCanvas, outputContext

let blendOpacity
let delta

const renderScenes = new Map()

const channelPasses = {
  'A': [],
  'B': [],
}

export let renderer, composer

// Store renderer size as an object
export const size = { width: 0, height: 0 }

const blankTexture = new THREE.Texture()

const channelTextureEffect = {
  A: new TextureEffect({ texture: blankTexture }),
  B: new TextureEffect({ texture: blankTexture }),
}

export const setRenderer = () => {
  renderer = new THREE.WebGLRenderer({
    antialias: false, // antialiasing should be handled by the composer
  })

  domEl = renderer.domElement
  viewerEl.innerHTML = ''
  viewerEl.appendChild(domEl)
  composer = new EffectComposer(renderer)
}

export const channelUpdate = (sceneId, c) => {
  // Disable previous passes in channel
  channelPasses[c].forEach(pass => { pass.enabled = false })
  channelPasses[c] = []

  if (!sceneId) {
    channelTextureEffect[c].uniforms.get('texture').value = blankTexture
    return
  }

  const renderScene = renderScenes.get(sceneId)

  // Set new passes for the channel and enable them
  channelPasses[c] = renderScene.passes
  renderScene.passes.forEach(pass => { pass.enabled = true })

  // Set output texture for the channel
  channelTextureEffect[c].uniforms.get('texture').value = renderScene.outputTexture
}

export const getSketchPasses = (state, sketchId, hedronScene) => {
  const module = engine.sketches[sketchId]

  if (module.initiatePostProcessing) {
    const params = getSketchParams(state, sketchId)

    return module.initiatePostProcessing({
      scene: hedronScene.scene,
      camera: hedronScene.camera,
      params,
      sketchesDir: `file://${engine.sketchesDir}`,
      composer,
      outputSize: size,
    }) || []
  } else {
    return []
  }
}

export const sceneRenderSetup = (hedronScene, passes) => {
  const renderScene = {
    passes: [],
    outputTexture: null,
  }

  if (hedronScene.scene.children.length > 0) {
    // Render the scene if it has anything to render
    renderScene.passes.push(new RenderPass(hedronScene.scene, hedronScene.camera))
  } else {
    // Otherwise just clear the buffer
    renderScene.passes.push(new ClearPass())
  }

  // Add all custom passes
  renderScene.passes.push(...passes)

  // Channel will also have the final pass saved to a texture to be mixed
  const savePass = new SavePass()
  renderScene.passes.push(savePass)
  renderScene.outputTexture = savePass.renderTarget.texture

  return renderScene
}

export const setPostProcessing = () => {
  const state = store.getState()
  const stateScenes = getScenes(state)

  composer.reset()

  const globalPasses = []

  // Loop through all scenes and check for postprocessing
  stateScenes.forEach(stateScene => {
    const hedronScene = engine.scenes[stateScene.id]
    const localPasses = []
    stateScene.sketchIds.forEach(sketchId => {
      const passes = getSketchPasses(state, sketchId, hedronScene)
      if (stateScene.settings.globalPostProcessingEnabled) {
        // If global, add to global passes list to be added to composer later
        globalPasses.push(...passes)
      } else {
        // Otherwise add to local passes to be added now
        localPasses.push(...passes)
      }
    })

    const renderScene = sceneRenderSetup(hedronScene, localPasses)
    renderScene.passes.forEach(pass => {
      composer.addPass(pass)
      // Disable all passes (will be enabled if added to channel)
      pass.enabled = false
    })
    renderScenes.set(
      stateScene.id,
      renderScene
    )
  })

  // Mix the two channels
  const mixPass = new EffectPass(null, channelTextureEffect.A, channelTextureEffect.B)
  mixPass.renderToScreen = true
  composer.addPass(mixPass)

  // Add global passes to composer and set last pass to render to the screen
  if (globalPasses.length) {
    globalPasses.forEach(pass => { composer.addPass(pass) })
    mixPass.renderToScreen = false
    globalPasses[globalPasses.length - 1].renderToScreen = true
  }

  // The channel mix value will will be set to channelB's opacity
  blendOpacity = channelTextureEffect.B.blendMode.opacity

  // Set up channels
  channelUpdate(state.scenes.channels.A, 'A')
  channelUpdate(state.scenes.channels.B, 'B')
}

export const setViewerEl = (el) => {
  viewerEl = el
}

export const setSize = () => {
  const settings = store.getState().settings
  let width, ratio
  if (save) {
    width = store.getState().exportSettings.gifWidth
    ratio = settings.aspectW / settings.aspectH
  } else if (isSendingOutput) {
    // Get width and ratio from output window
    width = outputEl.offsetWidth
    ratio = width / outputEl.offsetHeight

    previewCanvas.width = width
    previewCanvas.height = width / ratio

    outputCanvas.width = width
    outputCanvas.height = width / ratio
  } else {
    // Basic width and ratio if no output
    width = viewerEl.offsetWidth
    ratio = settings.aspectW / settings.aspectH
  }

  const perc = 100 / ratio
  const height = width / ratio

  composer.setSize(width, height)
  size.width = width
  size.height = height

  // Set ratios for each scene
  const engineScenes = engine.scenes
  for (const key in engineScenes) {
    engineScenes[key].setRatio(ratio)
  }

  rendererWidth = width
  rendererHeight = height

  // CSS trick to resize canvas
  viewerEl.style.paddingBottom = perc + '%'
}

export const initiate = (injectedStore) => {
  store = injectedStore

  uiEventEmitter.on('repaint', () => {
    setSize()
  })

  setRenderer()
  setSize()
}

export const setOutput = (win) => {
  stopOutput()
  const container = win.document.querySelector('div')

  rendererHeight = container.offsetWidth
  rendererWidth = container.offsetHeight
  outputEl = container

  // Move renderer canvas to new window
  outputEl.appendChild(domEl)
  domEl.setAttribute('style', '')

  // Setup output canvas
  // If preview and output are different, this canvas will be used and
  // renderer renders two different images, with images being copied from
  // the dom element to both preview and output canvases
  outputCanvas = document.createElement('canvas')
  outputCanvas.style = 'position: absolute; left: 0; top:0; height: 0; width:100%; height:100%;'
  outputContext = outputCanvas.getContext('2d')
  outputEl.appendChild(outputCanvas)

  // Setup preview canvas in dom
  // Pixels will be copied from renderer dom element to this
  previewCanvas = document.createElement('canvas')
  previewCanvas.style = 'position: absolute; left: 0; top:0; height: 0; width:100%; height:100%;'
  previewContext = previewCanvas.getContext('2d')
  viewerEl.appendChild(previewCanvas)

  isSendingOutput = true

  setSize()

  win.addEventListener('resize', () => {
    uiEventEmitter.emit('repaint')
  })
}

export const stopOutput = () => {
  viewerEl.innerHTML = ''
  domEl.setAttribute('style', '')
  viewerEl.appendChild(domEl)

  isSendingOutput = false

  setSize()
}

const renderChannels = (mixRatio) => {
  if (blendOpacity) blendOpacity.value = mixRatio
  composer.render(delta / 1000)
}

const renderSingle = (disableChannel, mixRatio) => {
  channelPasses[disableChannel].forEach(pass => { pass.enabled = false })

  if (blendOpacity) blendOpacity.value = mixRatio
  composer.render(delta / 1000)
}

const renderLogic = (viewerMode, mixRatio) => {
  channelPasses['A'].forEach(pass => { pass.enabled = true })
  channelPasses['B'].forEach(pass => { pass.enabled = true })

  switch (viewerMode) {
    case 'A':
      renderSingle('B', 0)
      break
    case 'B':
      renderSingle('A', 1)
      break
    default:
      renderChannels(mixRatio)
  }
}

const copyPixels = (context) => {
  context.drawImage(renderer.domElement, 0, 0, rendererWidth, rendererHeight)
}

export const render = (mixRatio, viewerMode, deltaIn) => {
  delta = deltaIn

  // mixState helps with performance. If mixer is all the way to A or B
  // we can stop rendering of opposite channel
  let mixState = 'mix'
  if (mixRatio === 0) {
    mixState = 'A'
  } else if (mixRatio === 1) {
    mixState = 'B'
  }

  if (!isSendingOutput) {
    // Always using dom element when not outputting
    if (previewCanvas) previewCanvas.style.display = 'none'
    if (viewerMode === 'mix') {
      renderLogic(mixState, mixRatio)
    } else {
      renderLogic(viewerMode, mixRatio)
    }
  } else {
    // When outputting, need the preview canvas
    if (previewCanvas) previewCanvas.style.display = 'block'
    // mix and preview viewer are the same
    if (viewerMode === 'mix' || mixState === viewerMode) {
      // No need for output canvas
      outputCanvas.style.display = 'none'
      // Render the correct thing
      renderLogic(mixState, mixRatio)
      // Copy pixels to preview
      copyPixels(previewContext)
    } else {
      // mix and preview are not the same
      // Show output canvas
      outputCanvas.style.display = 'block'

      // Render for output
      renderLogic(mixState, mixRatio)
      // Copy pixels to output canvas
      copyPixels(outputContext)
      // Render for preview
      renderLogic(viewerMode, mixRatio)
      // Copy pixels to preview canvas
      copyPixels(previewContext)
    }
  }
  if (save && save.path) {
    doSaveStep()
  }
}

const doSaveStep = () => {
  if (save.prewarm > 0) {
    save.prewarm--
  } else {
    let num = save.index + ''
    while (num.length < save.numberLength) { num = '0' + num }
    let path = _path.normalize(save.path + _path.sep + save.name + num + '.png')

    let data = domEl.toDataURL('image/png')
    data = data.slice(data.indexOf(',') + 1)// .replace(/\s/g,'+');
    let buffer = new Buffer(data, 'base64')
    fs.writeFileSync(path, buffer, (e) => { if (e) window.console.log(e); save.index++ })
    save.index++
    if (save.index >= save.count) {
      // let convertName = save.name
      // if (save.batch > 1) { convertName += '_' + save.batchIndex }

      // TODO: replace with contents of gif.py
      // childProcess.execSync('gif.py ' + convertName + ' -cwd ' + save.name + ' -v -g', { cwd: save.path })

      // TODO: add space for custom post png execution in settings
      // fs.writeFileSync(save.path + '\\' + convertName + '_cover.png', buffer, (e) => { if (e) console.log(e) })

      // ------ Call All randomize functions
      let keys = Object.keys(store.getState().sketches)
      for (let i = 0; i < keys.length; i++) {
        engine.fireShot(keys[i], 'randomize')
      }

      save.batchIndex++
      if (save.batchIndex < save.batch) {
        const settings = store.getState().exportSettings
        save.name = settings.gifName + save.batchIndex
        save.index = 0
        save.prewarm = settings.gifWarmup
        store.dispatch(clockReset())
      } else {
        save = null
        store.dispatch(rSettingsUpdate({ clockGenerated: true, aspectW: 16, aspectH: 9 }))
        setSize()
      }
    }
  }
  store.dispatch(clockPulse())
}

export const saveSequence = () => {
  remote.dialog.showOpenDialog({
    properties: ['openDirectory'],
  },
    path => {
      if (path) {
        beginSaveSequence(path)
      }
    })
}

// TODO: maybe this ~ replacement actually works on windows too?
const normalizePath = (path) => {
  if (path[0] === '~') {
    path = _path.join(process.env.HOME, path.slice(1))
  }
  return _path.normalize(path)
}

export const beginSaveSequence = () => {
  const settings = store.getState().exportSettings
  save = {
    path: normalizePath(settings.gifPath + _path.sep + settings.gifName),
    name: settings.gifName,
    count: (settings.gifBeats * (60 / settings.gifBPM)) * settings.gifFPS,
    numberLength: ((settings.gifBeats * (60 / settings.gifBPM)) * settings.gifFPS + '').length,
    prewarm: (settings.gifWarmup * (60 / settings.gifBPM)) * settings.gifFPS,
    batch: settings.gifGenerate,
    batchIndex: 0,
    index: 0,
  }
  console.error(save);
  // Create directory if it does not exist
  if (!fs.existsSync(save.path)) {
    fs.mkdirSync(save.path, { recursive: true })
  }
  store.dispatch(rSettingsUpdate({ clockGenerated: false, aspectW: settings.gifWidth, aspectH: settings.gifHeight }))
  setSize(settings.gifWidth)
  store.dispatch(clockReset())
  store.dispatch(clockPulse())
}
