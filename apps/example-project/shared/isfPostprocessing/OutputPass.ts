import { ShaderPass } from "postprocessing";
import { ShaderMaterial, Texture, Uniform } from "three";

export class OutputPass extends ShaderPass {
    constructor() {
        const postMaterial = new ShaderMaterial({
            uniforms: {
                tex: new Uniform(Texture),
            },
            vertexShader:
                "varying vec2 local;\n" +
                "void main(){\n" +
                "	local = uv;\n" +
                "	gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n" +
                "}",
            fragmentShader:
                "varying vec2 local;\n" +
                "uniform sampler2D tex;\n" +
                "uniform float fade;\n" +
                "void main(){\n" +
                "	gl_FragColor = texture2D(tex,local);\n" +
                "}",
        });
        super(postMaterial, 'tex');
    }
}