
uniform vec2 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform sampler2D iChannel0;


##SHADER##

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    mainShadertoy(outputColor, uv*iResolution);
}