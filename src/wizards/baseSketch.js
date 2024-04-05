/**
 * wow this file was autogenerated by the shadertoy import wizard
 * I better have better info scattered throuout than this before I go live ;)
 */

const { THREE, postprocessing, glslify } = window.HEDRON.dependencies
const { EffectPass, Effect, BlendFunction } = postprocessing
const { Uniform } = THREE
const frag = glslify.file('./frag.glsl')

class ShadertoyEffect extends Effect {
    constructor({
        blendFunction = BlendFunction.NORMAL,
    } = {}) {
        super('ShadertoyEffect', frag, {
            blendFunction,
            uniforms: new Map([
                ['iTime', new Uniform(0)],
                ['iResolution', new Uniform(new THREE.Vector2(100, 100))],
            ]),
        })
    }
}

class ##SHADER_NAME## {

    initiatePostProcessing() {
        this.shadertoyEffect = new ShadertoyEffect()
        this.gradientPass = new EffectPass(null, this.shadertoyEffect)
        return [this.gradientPass]
    }

    update({ params, elapsedTimeMs }) {
        this.shadertoyEffect.uniforms.get('iTime').value = elapsedTimeMs / 1000;
    }
}

/**  HEDRON TIP **
  Class must be exported as a default.
**/
module.exports = ##SHADER_NAME##