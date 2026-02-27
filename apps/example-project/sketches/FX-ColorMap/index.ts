import BaseISF from '../../shared/isfPostprocessing/BaseISF.ts'
import shader from './ColorMap.glsl'
const frag = shader.split('\n').join('\n')

export default class ColorMap extends BaseISF {
  static fragmentShader = frag
}
