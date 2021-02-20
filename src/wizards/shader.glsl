
uniform vec2 iResolution;
uniform float iTime;

##SHADER##

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    mainShadertoy(outputColor, uv*iResolution);
}