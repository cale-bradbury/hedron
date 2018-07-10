uniform float normalAmp;

varying vec2 local;

void main(){
	local = uv;
	vec3 p = position;
	p += normal * normalAmp;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}
