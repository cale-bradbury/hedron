import { Uniform, ShaderMaterial, Vector3 } from 'three'
import { Pass, ShaderPass } from 'postprocessing'
import { mix } from 'three/tsl'

const fragmentShader = `
  uniform vec3 u_color;
  uniform float u_brightness;
  varying vec2 vUv;
  uniform sampler2D u_texture;
  void main() {
    vec4 base = texture2D(u_texture, vUv);
    vec3 tint = base.rgb * u_color;
    tint = mix(base.rgb, tint, u_brightness);
    gl_FragColor = vec4(tint, base.a);
  }
`

export default class FixtureColorSketch {
  shader?: ShaderMaterial
  pass?: ShaderPass
  passes?: Pass[]

  getPasses(): Pass[] {
    if (!this.passes) {
      this.createPasses()
    }
    return this.passes!
  }

  createPasses() {
    this.shader = this.createTintShader()
    this.pass = new ShaderPass(this.shader, 'u_texture')
    this.passes = [this.pass]
  }

  createTintShader(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        u_color: new Uniform(new Vector3(1, 1, 1)),
        u_brightness: new Uniform(1),
        u_texture: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader,
    })
  }

  update({ params }) {
    // Mix the two colors
    const colorA = new Vector3(params.colorA[0], params.colorA[1], params.colorA[2])
    const colorB = new Vector3(params.colorB[0], params.colorB[1], params.colorB[2])
    const mixed = colorA.clone().lerp(colorB, params.mix)
    this.setUniform('u_color', mixed)
    this.setUniform('u_brightness', params.brightness)

    // DMX output - send to all 4 pods with RGBW+Intensity
    if (window.hedron?.lighting?.setFixtureColor) {
      // Convert to [0-255] for DMX
      window.hedron.lighting.setFixtureColor(
        params.fixtureName || 'fixture-1',
        {
          red: Math.max(0, Math.min(255, Math.round(mixed.x * 255 * params.brightness))),
          green: Math.max(0, Math.min(255, Math.round(mixed.y * 255 * params.brightness))),
          blue: Math.max(0, Math.min(255, Math.round(mixed.z * 255 * params.brightness))),
          white: Math.max(0, Math.min(255, Math.round(params.white * 255 * params.brightness))),
          intensity: Math.max(
            0,
            Math.min(255, Math.round(params.intensity * 255 * params.brightness)),
          ),
        },
        {
          channelMap: ['red', 'green', 'blue', 'white', 'intensity'],
          podCount: 4, // Control all 4 pods
        },
      )
    }
  }

  setUniform(key: string, value: any) {
    if (this.shader?.uniforms[key]) {
      this.shader.uniforms[key].value = value
    }
  }

  static getConfig() {
    return {
      title: 'Fixture Color',
      description: 'Mixes two colors and sends to DMX, also tints the scene.',
      category: 'lighting',
      params: [
        {
          title: 'Color A',
          key: 'colorA',
          valueType: 'rgb',
          defaultValue: [1, 0, 0],
        },
        {
          title: 'Color B',
          key: 'colorB',
          valueType: 'rgb',
          defaultValue: [0, 0, 1],
        },
        {
          title: 'Mix',
          key: 'mix',
          valueType: 'number',
          defaultValue: 0.5,
          sliderMin: 0,
          sliderMax: 1,
        },
        {
          title: 'Brightness',
          key: 'brightness',
          valueType: 'number',
          defaultValue: 1,
          sliderMin: 0,
          sliderMax: 1,
        },
        {
          title: 'White',
          key: 'white',
          valueType: 'number',
          defaultValue: 0,
          sliderMin: 0,
          sliderMax: 1,
        },
        {
          title: 'Intensity',
          key: 'intensity',
          valueType: 'number',
          defaultValue: 1,
          sliderMin: 0,
          sliderMax: 1,
        },
      ],
    }
  }
}
