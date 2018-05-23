varying vec2 local;
uniform sampler2D tex;
uniform sampler2D blur;
uniform float fade;
uniform float time;
uniform vec4 shift; //xy-shift z-distance shift w-angle shift

vec4 hueShift(vec4 color, float hueAdjust){
	const vec4  kRGBToYPrime = vec4 (0.299, 0.587, 0.114, 0.0);
	const vec4  kRGBToI     = vec4 (0.596, -0.275, -0.321, 0.0);
	const vec4  kRGBToQ     = vec4 (0.212, -0.523, 0.311, 0.0);
	const vec4  kYIQToR   = vec4 (1.0, 0.956, 0.621, 0.0);
	const vec4  kYIQToG   = vec4 (1.0, -0.272, -0.647, 0.0);
	const vec4  kYIQToB   = vec4 (1.0, -1.107, 1.704, 0.0);
	float   YPrime  = dot (color, kRGBToYPrime);
	float   I      = dot (color, kRGBToI);
	float   Q      = dot (color, kRGBToQ);
	float   hue     = atan (Q, I);
	float   chroma  = sqrt (I * I + Q * Q);
	hue += hueAdjust;
	Q = chroma * sin (hue);
	I = chroma * cos (hue);
	vec4    yIQ   = vec4 (YPrime, I, Q, 0.0);
	color.r = dot (yIQ, kYIQToR);
	color.g = dot (yIQ, kYIQToG);
	color.b = dot (yIQ, kYIQToB);
	return color;
}

void main(){
	 vec2 u =local;
	 vec3 old = texture2D(blur,u).rgb;
	 vec3 new = texture2D(tex,u).rgb;
    u-=.5;
    float d = length(u);
    d-=shift.z*d;
    float a = atan(u.y,u.x)+shift.w;
    
    u.x = cos(a);
    u.y = sin(a);
    u*=d;
    u+=shift.xy;
    old = texture2D(blur,u+.5).rgb;
    
    new = mix(new, old, fade);
    gl_FragColor = vec4(new, 1.0);
} 