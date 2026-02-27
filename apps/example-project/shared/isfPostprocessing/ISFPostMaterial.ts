import {
  Color,
  ShaderMaterial,
  Texture,
  Uniform,
  Vector2,
  Vector4,
} from "three";
import ISFParser from "./isf/ISFParser";

export class ISFPostMaterial extends ShaderMaterial {
  baseUniforms = [
    ["TIME", new Uniform(0)],
    ["RENDERSIZE", new Uniform(new Vector2(16, 16))],
    ["inputImage", new Uniform(Texture)],
    ["audioImage", new Uniform(Texture)],
    ["_inputImage_imgRect", new Uniform(new Vector4(0, 0, 1, 1))],
    ["_inputImage_imgSize", new Uniform(new Vector2(16, 16))],
    ["feedbackLoopSampler", new Uniform(Texture)],
  ];

  /**
   *
   * @param texture The texture to be used as input
   * @param parser The pre-parsed ISF parser object
   */
  constructor(
    texture: Texture,
    parser: ISFParser,
    additionalUniforms: any = {}
  ) {
    super({
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });

    this.uniforms = Object.fromEntries(this.baseUniforms);
    // Add any additional uniforms
    for (const key in additionalUniforms) {
      this.uniforms[key] = additionalUniforms[key];
    }
    this.setTexture(texture);
    this.setParser(parser);
  }

  public setParser(parser: ISFParser) {
    for (let i = 0; i < parser.inputs.length; i++) {
      const input = parser.inputs[i];
      if (input.TYPE === "image") {
        continue;
      }
      if (input.TYPE === "color") {
        this.uniforms[input.NAME] = new Uniform(new Vector4(...input.DEFAULT));
        continue;
      }
      this.uniforms[input.NAME] = new Uniform(input.DEFAULT);
    }
    if (parser.vertexShader) {
      this.vertexShader = parser.vertexShader
        .replace("attribute vec2 isf_position; // -1..1", "")
        .replace(
          "vec4( isf_position, 0.0, 1.0 );",
          "projectionMatrix * modelViewMatrix * vec4( position, 1.0 );"
        );
    }

    this.fragmentShader = (
      `varying vec2 isf_FragNormCoord;\n
      uniform vec2 RENDERSIZE;\n
      uniform float TIME;\n
      ` +
      parser.uniformDefs +
      parser.rawFragmentMain
    )
      .split("IMG_NORM_PIXEL")
      .join("texture2D");
  }

  public setTexture(texture: Texture) {
    this.uniforms.feedbackLoopSampler.value = texture;
    this.uniforms.RENDERSIZE.value = new Vector2(
      texture.image.width,
      texture.image.height
    );
    this.uniforms._inputImage_imgSize.value = new Vector2(
      texture.image.width,
      texture.image.height
    );
  }
}
