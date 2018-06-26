import * as THREE from 'three'
const EffectComposer = require('three-effectcomposer')(THREE)
import AudioAnalyzer from '../inputs/AudioAnalyzer'

class Scene {
  constructor (renderer) {
    this.renderer = renderer
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, null, 1, 1000000)
    this.camera.position.z = 1000
    this.post = new EffectComposer(this.renderer)
    this.postEffects = []
    this.renderPass = new EffectComposer.RenderPass(this.scene, this.camera)
    this.addPost(this.renderPass)
    this.analyzer = AudioAnalyzer
  }

  setRatio (ratio) {
    this.camera.aspect = ratio
    this.camera.updateProjectionMatrix()
  }
	
	setSize(width, height){
    this.post.setSize(width, height)
		this.renderer.setSize(width, height)
		this.setRatio(width/height);
	}

  addPost (shader) {
    if (this.postEffects.length > 0) {
      this.postEffects[this.postEffects.length - 1].renderToScreen = false
    }
    this.postEffects.push(shader)
    shader.renderToScreen = false
    this.post.addPass(shader)
  }
  removePost (shader) {
    var i = this.postEffects.indexOf(shader)
    if (i != -1) {
      this.postEffects.splice(i, 1)
      if (this.postEffects.length > 0) {
        this.postEffects[this.postEffects.length - 1].renderToScreen = false
      }
      i = this.post.passes.indexOf(shader)
      this.post.passes.splice(i, 1)
    }
  }

  render (scene, camera, renderTarget, forceClear) {
    if (this.postEffects.length > 1) {
      if (renderTarget) {
        this.renderer.autoClear = false
        this.renderer.clear()
        this.postEffects[this.postEffects.length - 1].renderToScreen = false
      } else {
        this.postEffects[this.postEffects.length - 1].renderToScreen = true
      }
      this.renderer.setRenderTarget(null)
      this.post.renderer = this.renderer
      this.post.reset(renderTarget)
      this.post.render()
    } else {
      this.renderer.render(scene, camera, renderTarget, forceClear)
    }
  }
}

export default Scene
