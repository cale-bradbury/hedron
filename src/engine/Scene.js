import * as THREE from 'three'
const EffectComposer = require('three-effectcomposer')(THREE)

class Scene {
  constructor () {
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(75, null, 1, 1000000)
    this.camera.position.z = 1000
    this.post = new EffectComposer(this.renderer)
    var rend = new EffectComposer.RenderPass(this.scene, this.camera)
    this.post.addPass(rend)
    this.postEffects = []
  }

  setRatio (ratio) {
    this.camera.aspect = ratio
    this.camera.updateProjectionMatrix()
  }

  addPost (shader) {
    if (this.postEffects.length > 0) { this.postEffects[this.postEffects.length - 1].renderToScreen = false }
    this.postEffects.push(shader)
    shader.renderToScreen = true
    this.post.addPass(shader)
    console.log(this.postEffects.length)
  }
  removePost (shader) {
    var i = this.postEffects.indexOf(shader)
    if (i != -1) {
      this.post.removePass(shader)
      this.postEffects.splice(i, 1)
      if (this.postEffects.length > 0) { this.postEffects[this.postEffects.length - 1].renderToScreen = true }
    }
  }

  render (scene, camera, renderTarget, forceClear) {
    if (this.postEffects.length > 0) {
      this.renderer.autoClear = false
      this.renderer.setRenderTarget(null)
      this.renderer.clear()
      this.post.renderer = this.renderer
      this.post.render(0.1)
    } else {
      this.renderer.render(scene, camera, renderTarget, forceClear)
    }
  }
}

export default Scene
