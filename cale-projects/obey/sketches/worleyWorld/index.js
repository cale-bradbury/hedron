const THREE = require('three')
const glsl = require('glslify')
const fragShader = glsl.file('./worleyWorld.glsl')

class WorleyWorld {

  constructor() {
    //shaders
    {
      var vert = "#ifdef GL_ES\n" +
        "precision highp float;\n" +
        "#endif\n" +
        "varying vec2 local;\n" +
        "void main(){\n" +
        "	local = uv;\n" +
        "	vec4 pos = vec4(position*2., 1.);\n" +
        //"	pos.z = (projectionMatrix * modelViewMatrix * pos).z;\n"+		
        "	gl_Position = pos;\n" +
        "}";
    }

    this.root = new THREE.Group()
    console.log(fragShader)
    var geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      vertexShader: vert,
      fragmentShader: fragShader,
      uniforms: {
        color: {
          type: "v4",
          value: {
            x: 1,
            y: 1,
            z: 1,
            w: 1
          }
        },
        mic: {
          type: "v4",
          value: {
            x: 1,
            y: 1,
            z: 1,
            w: 1
          }
        },
        iPos: {
          type: "v4",
          value: {
            x: 1,
            y: 1,
            z: 1,
            w: 1
          }
        },
        iTime: {
          type: "f",
          value: 0
        }
      },
    });
    this.plane = new THREE.Mesh(geometry, this.material);
    this.root.add(this.plane);
    this.position = {
      x: 0,
      y: 0,
      z: 0
    }
  }

  lerp(v0, v1, t) {
    return (1 - t) * v0 + t * v1;
  }

  update(params, time, delta, allParams) {
    this.material.uniforms.iTime.value = time / 60;
    this.position.x += params.xPos;
    this.position.y += params.yPos;
    this.position.z += params.zPos;
    this.material.uniforms.iPos.value = this.position;
    this.material.uniforms.mic.value = {
      x: params.m0,
      y: params.m1,
      z: params.m2,
      w: params.m3
    };
  }

}

module.exports = WorleyWorld
