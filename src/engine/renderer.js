import * as THREE from 'three'
import uiEventEmitter from '../utils/uiEventEmitter'
import * as engine from './'
import QuadScene from './QuadScene'
import { clockPulse, clockReset } from '../store/clock/actions'
import { settingsUpdate } from '../store/settings/actions'
let fs = require('fs')
let child_process = require('child_process')
import { remote } from 'electron'
import { fireShot } from './'

let store, domEl, outputEl, viewerEl, isSendingOutput, rendererWidth, rendererHeight, previewCanvas, previewContext, outputCanvas, outputContext

let quadScene, rttA, rttB

export let renderer

export const setRenderer = () => {
  const settings = store.getState().settings

  renderer = new THREE.WebGLRenderer({
    antialias: settings.antialias,
  })

  domEl = renderer.domElement
  viewerEl.innerHTML = ''
  viewerEl.appendChild(domEl)
  const renderTargetParameters = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBFormat,
    stencilBuffer: false,
  }
  rttA = new THREE.WebGLRenderTarget(null, null, renderTargetParameters)
  rttB = new THREE.WebGLRenderTarget(null, null, renderTargetParameters)

  quadScene = new QuadScene(rttA, rttB)

  // Set ratios for each scene
  const engineScenes = engine.scenes
  for (const key in engineScenes) {
    engineScenes[key].renderer = renderer
  }
}

export const setViewerEl = (el) => {
  viewerEl = el
}

export const setSize = (w = -1) => {
  const settings = store.getState().settings
  if (this.savePath) { w = store.getState().exportSettings.gifWidth }
  if (settings.aspectW == 0 || settings.aspectH == 0) { return }
  let width, ratio

  if (w != -1) {
    width = w
    ratio = settings.aspectW / settings.aspectH
  } else if (isSendingOutput) {
    // Get width and ratio from output window
    width = outputEl.offsetWidth
    ratio = width / outputEl.offsetHeight

    previewCanvas.width = width
    previewCanvas.height = width / ratio

    outputCanvas.width = width
    outputCanvas.height = width / ratio

    renderer.setSize(viewerEl.offsetWidth, viewerEl.offsetWidth / ratio)
  } else {
    // Basic width and ratio if no output
    width = viewerEl.offsetWidth
    ratio = settings.aspectW / settings.aspectH
  }
  const perc = 100 / ratio
  const height = width / ratio

  renderer.setSize(width, height)

  // Set sizes for render targets
  rttA.setSize(width, height)
  rttB.setSize(width, height)

  // Set sizes for quad scene
  quadScene.setSize(width, height)

  // Set ratios for each scene
  const engineScenes = engine.scenes
  for (const key in engineScenes) {
    engineScenes[key].setSize(width, height)
  }

  rendererWidth = width
  rendererHeight = height

  // CSS trick to resize canvas
  viewerEl.style.paddingBottom = perc + '%'
}

export const initiate = (injectedStore) => {
  store = injectedStore

  uiEventEmitter.on('reset-renderer', () => {
    setRenderer()
  })
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

const renderChannels = (sceneA, sceneB) => {
  sceneA && sceneA.render(sceneA.scene, sceneA.camera, rttA, true)
  sceneB && sceneB.render(sceneB.scene, sceneB.camera, rttB, true)
  renderer.render(quadScene.scene, quadScene.camera)
}

const renderSingle = (scene) => {
  scene && scene.render(scene.scene, scene.camera)
}

const renderLogic = (sceneA, sceneB, mix) => {
  switch (mix) {
    case 'A':
      renderSingle(sceneA)
      break
    case 'B':
      renderSingle(sceneB)
      break
    default:
      renderChannels(sceneA, sceneB, mix)
  }
}

const copyPixels = (context) => {
  context.drawImage(renderer.domElement, 0, 0, rendererWidth, rendererHeight)
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

export const beginSaveSequence = () => {
  const settings = store.getState().exportSettings
  this.savePath = settings.gifPath + '\\' + settings.gifName // path.toString();
  if (!fs.existsSync(this.savePath)) {
    fs.mkdirSync(this.savePath)
  }
  this.saveName = settings.gifName
  this.saveCount = settings.gifFrames
  this.savePrewarm = settings.gifWarmup
  this.saveBatch = settings.gifGenerate
  this.saveBatchIndex = 0
  this.saveIndex = 0
  store.dispatch(settingsUpdate({ clockGenerated: false, aspectW:settings.gifWidth, aspectH:settings.gifHeight }))
  setSize(settings.gifWidth)
  store.dispatch(clockReset())
  store.dispatch(clockPulse())
}

export const render = (sceneA, sceneB, mixRatio, viewerMode) => {
  quadScene.material.uniforms.mixRatio.value = mixRatio
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
      renderLogic(sceneA, sceneB, mixState)
    } else {
      renderLogic(sceneA, sceneB, viewerMode)
    }
  } else {
    // When outputting, need the preview canvas
    if (previewCanvas) previewCanvas.style.display = 'block'
    // mix and preview viewer are the same
    if (viewerMode === 'mix' || mixState === viewerMode) {
      // No need for output canvas
      outputCanvas.style.display = 'none'
      // Render the correct thing
      renderLogic(sceneA, sceneB, mixState)
      // Copy pixels to preview
      copyPixels(previewContext)
    } else {
      // mix and preview are not the same
      // Show output canvas
      outputCanvas.style.display = 'block'

      // Render for output
      renderLogic(sceneA, sceneB, mixState)
      // Copy pixels to output canvas
      copyPixels(outputContext)
      // Render for preview
      renderLogic(sceneA, sceneB, viewerMode)
      // Copy pixels to preview canvas
      copyPixels(previewContext)
    }
  }

  if (this.savePath) {
    if (this.savePrewarm > 0) {
      this.savePrewarm--
    } else {
      let num = this.saveIndex + ''
      let numberLength = this.saveCount.toString().length
      while (num.length < numberLength) { num = '0' + num }
      let path = this.savePath + '\\' + this.saveName + num + '.png'

      let data = domEl.toDataURL('image/png')
      data = data.slice(data.indexOf(',') + 1)// .replace(/\s/g,'+');
      let buffer = new Buffer(data, 'base64')
      fs.writeFileSync(path, buffer, (e) => { if (e) console.log(e); this.saveIndex++ })
      this.saveIndex++
      if (this.saveIndex >= this.saveCount) {
        let convertName = this.saveName
        if (this.saveBatch > 1) { convertName += '_' + this.saveBatchIndex }

        child_process.execSync('gif.py ' + convertName + ' -cwd ' + this.saveName + ' -v -g', { cwd:this.savePath })

        fs.writeFileSync(this.savePath + '\\' + convertName + '_cover.png', buffer, (e) => { if (e) console.log(e) })

              // ------ Call All randomize fuinctions
        let keys = Object.keys(store.getState().sketches)
        for (let i = 0; i < keys.length; i++) {
          fireShot(keys[i], 'randomize')
        }

        this.saveBatchIndex++
        if (this.saveBatchIndex < this.saveBatch) {
          const settings = store.getState().exportSettings
          this.saveName = settings.gifName
          this.saveIndex = 0
          this.savePrewarm = settings.gifWarmup
          store.dispatch(clockReset())
        } else {
          this.savePath = null
          store.dispatch(settingsUpdate({ clockGenerated: true }))
          setSize()
        }
      }
    }
    store.dispatch(clockPulse())
  }
}
