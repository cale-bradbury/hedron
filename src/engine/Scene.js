import * as THREE from 'three'
const EffectComposer = require('three-effectcomposer')(THREE)
import AudioAnalyzer from '../inputs/AudioAnalyzer'

class Scene {
  constructor () {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, null, 1, 1000000)
    this.camera.position.z = 1000
    this.post = new EffectComposer(this.renderer)
    var rend = new EffectComposer.RenderPass(this.scene, this.camera)
    this.post.addPass(rend)
    this.postEffects = []
    this.renderPass = new EffectComposer.RenderPass(this.scene, this.camera)
    this.addPost(this.renderPass)
    this.analyzer = AudioAnalyzer
  }

  setRatio (ratio) {
    this.camera.aspect = ratio
    this.camera.updateProjectionMatrix()
  }

  addPost (shader) {
    if (this.postEffects.length > 0) {
      this.postEffects[this.postEffects.length - 1].renderToScreen = false
    }
    this.postEffects.push(shader)
    shader.renderToScreen = true
    this.post.addPass(shader)
  }
  removePost (shader) {
    var i = this.postEffects.indexOf(shader)
    if (i != -1) {
      this.postEffects.splice(i, 1)
      if (this.postEffects.length > 0) {
        this.postEffects[this.postEffects.length - 1].renderToScreen = true
      }
      i = this.post.passes.indexOf(shader)
      this.post.passes.splice(i, 1)
    }
  }

  render (scene, camera, renderTarget, forceClear) {
    if (this.postEffects.length > 0) {
      this.renderer.autoClear = false
      this.renderer.setRenderTarget(null)
      this.renderer.clear()
      this.post.renderer = this.renderer
      this.post.render()
    } else {
      this.renderer.render(scene, camera, renderTarget, forceClear)
    }
  }
}

export default Scene
