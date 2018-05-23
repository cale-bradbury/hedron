const THREE = require('three'),
  EffectComposer = require('three-effectcomposer')(THREE)
const glsl = require('glslify')
const feedbackFrag = glsl.file('./feedbacker.glsl')

class Feedback {

  constructor(scene) {
    var vert = "varying vec2 local;\n" +
      "void main(){\n" +
      "	local = uv;\n" +
      "	gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n" +
      "}";

    var defaultFrag = "varying vec2 local;\n" +
      "uniform sampler2D tex;\n" +
      "uniform float fade;\n" +
      "void main(){\n" +
      "	gl_FragColor = texture2D(tex,local);\n" +
      "}";



    this.root = new THREE.Group()
    this.camera = scene.camera;
    this.renderer = scene.renderer;
    this.scene = scene.scene;

    scene.addPost(new EffectComposer.RenderPass(this.scene, this.camera));

    this.save = new EffectComposer.SavePass();

    this.shift = new EffectComposer.ShaderPass({
      uniforms: {
        tex: {
          type: "t",
          value: null
        },
        blur: {
          type: "t",
          value: this.save.renderTarget
        },
        fade: {
          type: "f",
          value: .5
        },
        time: {
          type: "f",
          value: 0
        },
        shift: {
          type: "v4",
          value: new THREE.Vector4(0, 0, 0, 0)
        }
      },
      vertexShader: vert,
      fragmentShader: feedbackFrag

    }, "tex");

    scene.addPost(this.shift);
    scene.addPost(this.save);
    scene.addPost(new EffectComposer.ShaderPass({
      uniforms: {
        tex: {
          type: "t",
          value: null
        }
      },
      vertexShader: vert,
      fragmentShader: defaultFrag

    }, "tex"));

  }

  lerp(v0, v1, t) {
    return (1 - t) * v0 + t * v1;
  }

  panic() {
    console.log("PANIC");
    this.clearNextFrame = true;
  }

  update(params, time, delta, allParams) {
    var size = this.renderer.getSize();
    params.xShift /= size.width;
    params.yShift /= size.height;
    params.dShift /= size.height;
    params.aShift /= 360 / 3.1415

    if (this.clearNextFrame) {
      this.clearNextFrame = false;
      params.fade = 0;
    }

    this.shift.uniforms.time.value = time;
    this.shift.uniforms.fade.value = params.fade;
    this.shift.uniforms.shift.value = {
      x: params.xShift,
      y: params.yShift,
      z: params.dShift,
      w: params.aShift
    }
    //console.log(this.camera);
  }

}

/** HEDRON TIP **
  Class must be exported as a default.
**/
module.exports = Feedback
