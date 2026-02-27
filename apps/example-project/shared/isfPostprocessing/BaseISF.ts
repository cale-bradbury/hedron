import { EffectPass, SavePass, CopyPass, Pass, ShaderPass, TextureEffect } from 'postprocessing'
import { Scene, Camera, WebGLRenderTarget, FloatType, Vector4 } from 'three'
import ISFParser from './isf/ISFParser'
import { ISFPostMaterial } from './ISFPostMaterial'
import { OutputPass } from './OutputPass'

import shader from './Invert.glsl'
const frag = shader.split('\n').join('\n')

// Module-level function for parsing ISF
function parseISFShader(fragmentISF: string): ISFParser {
  const parser = new ISFParser()
  parser.parse(fragmentISF)
  if (parser.error) {
    console.error(parser.error)
  }
  return parser
}

export default class BaseISF {
  shader: ISFPostMaterial
  pass: ShaderPass
  savePass: SavePass
  texturePass: EffectPass
  postSave: ShaderPass
  parser: ISFParser = new ISFParser()
  passes: Pass[]
  currentISF: string = 'quiver'
  id: string = Math.random().toString(36).substring(2, 7)

  static fragmentShader = frag

  fragmentISF = (this.constructor as typeof BaseISF).fragmentShader
  config

  time = 0
  analazer: any

  additionalUniforms: any = {}

  constructor(engine) {
    if (!engine) return
    this.analazer = window['__HEDRON']?.plugins?.['audio-input']?.analyzer
  }

  getPasses({ scene, camera }: { scene: Scene; camera: Camera }): Pass[] {
    if (!this.passes) {
      this.createPasses({ scene, camera })
    }
    return this.passes
  }

  createPasses({ scene, camera }: { scene: Scene; camera: Camera }) {
    //renderer.setPixelRatio(window.devicePixelRatio);
    let renderTarget = new WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: FloatType,
    })

    this.postSave = new OutputPass()

    this.parseISF()
    this.config = (this.constructor as typeof BaseISF).getConfig().params
    this.savePass = new CopyPass(renderTarget, true)
    const textureEffect = new TextureEffect({
      texture: renderTarget.texture,
    })
    this.shader = new ISFPostMaterial(this.savePass.texture, this.parser, this.additionalUniforms)
    this.pass = new ShaderPass(this.shader, 'inputImage')

    this.texturePass = new EffectPass(camera, textureEffect)
    this.passes = [this.pass, this.savePass, this.postSave]
  }

  update({ params, elapsedTimeMs }) {
    if (this.config) {
      //  fixParamsSmooth(params, this.config, this.id, 0.1);
    }
    this.time += (elapsedTimeMs ?? 33) / 1000
    this.setUniform('TIME', this.time)
    Object.keys(params).forEach((key) => {
      if (key.startsWith('rgb-')) {
        this.setColorUniform(key.substring(4), params[key])
      } else {
        this.setUniform(key, params[key])
      }
    })
    this.shader.uniforms.feedbackLoopSampler.value = this.savePass.texture
    if (this.analazer) this.shader.uniforms.audioImage.value = this.analazer.audioData.texture
  }

  setUniform(key: string, value: any) {
    if (this.shader.uniforms[key]) {
      this.shader.uniforms[key].value = value
    }
  }

  setColorUniform(key: string, value: [number, number, number]) {
    if (this.shader.uniforms[key]) {
      this.shader.uniforms[key].value = new Vector4(...value, 1)
    }
  }

  parseISF() {
    if (!this.parser) {
      this.parser = new ISFParser()
    }
    this.parser.parse(this.fragmentISF)
    if (this.parser.error) {
      console.error(this.parser.error)
    }
  }

  static getConfig() {
    const isfOptions: any[] = []

    const parser = parseISFShader(this.fragmentShader)
    let paramCategories: Record<string, any[]> = {}
    for (let i = 0; i < parser.inputs.length; i++) {
      const input = parser.inputs[i]
      if (input.TYPE === 'image') {
        continue
      }
      let param
      if (input.TYPE === 'color') {
        param = {
          key: 'rgb-' + input.NAME,
          title: input.NAME,
          valueType: 'rgb',
          defaultValue: (input.DEFAULT as number[]).slice(0, 3),
        }
      } else {
        param = {
          key: input.NAME,
          title: input.NAME,
          defaultValue: input.DEFAULT,
          sliderMin: input.MIN,
          sliderMax: input.MAX,
        }
      }
      if (!param) continue
      const category = input.CATEGORY || 'Other'
      if (!paramCategories[category]) {
        paramCategories[category] = []
      }
      paramCategories[category].push(param)
    }
    let params: any[] = []
    if (Object.keys(paramCategories).length === 1) {
      params = Object.values(paramCategories)[0]
    } else {
      Object.keys(paramCategories).forEach((cat) => {
        params.push({
          groupTitle: cat,
          params: paramCategories[cat],
        })
      })
    }
    return {
      defaultTitle: 'ISF Post Effect',
      params: params,
    }
  }
}
