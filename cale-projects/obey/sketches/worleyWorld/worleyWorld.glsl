// iq
vec3 random3f( vec3 p )
{
    p = mod(p, 10.);
    return fract(sin(vec3( dot(p,vec3(1.0,57.0,113.0)), 
                           dot(p,vec3(57.0,113.0,1.0)),
                           dot(p,vec3(113.0,1.0,57.0))))*438.5453);
}

float voronoi3(vec3 p)
{
    vec3 fp = floor(p);
    
    float d1 = 1./0.;
    float d2 = 1./0.;
    
    for(int i = -1; i < 2; i++)
    {
        for(int j = -1; j < 2; j++)
        {
            for(int k = -1; k < 2; k++)
            {
                vec3 cur_p = fp + vec3(i, j, k);
                
                vec3 r = random3f(cur_p);
                d1 = min(d1, distance(p, cur_p + r));
            }
        }
    }
    return d1;
}

#define steps 8.
#define fogStart 6.
varying vec2 local;
uniform vec4 color;
uniform vec4 mic;
uniform float iTime;
uniform vec4 iPos;
void main(){
    // Normalized pixel coordinates (from 0 to 1)
    vec2 p = local-.5;
    p*=4.;
    p.x = -abs(p.x);
	float time = mod(iTime*.1, 10.);
    
    vec4 m = mic;
    
    vec3 ro = iPos.xyz;
    vec3 ta = ro+vec3(0., 0., 1.);
    vec3 ww = normalize( ta - ro );
    vec3 uu = normalize( cross(ww,vec3(0.0,1.0,0.0) ) );
    vec3 vv = normalize( cross(uu,ww));
	vec3 rd = normalize( p.x*uu + p.y*vv + 2.0*ww );
    rd*=.2;
    vec3 f = vec3(0.);
    for(float i = 0.; i<steps;i++){
        f += smoothstep(0.5, 1.,vec3(voronoi3(ro*vec3(1., 1., 1.+m.x)+100.),voronoi3(ro*vec3(2., 2.+m.y, 2.)-100.),voronoi3(ro*vec3(4.1-m.z, 4., 4.))))*smoothstep(steps, fogStart, i)*.2;
        
        ro+=rd;
    }
	float o = .25;
    float a = .05;
    
    m*=4.;
    
    vec3 c = f.r*sin(m.r*vec3(0., .33, .66))+f.r;
    c += f.g*cos(m.g*vec3(0.33, .66, .0))+f.g;
    c += f.b*sin(m.b*vec3(0.66, .0, .33)+1.5707)+f.b;
    c = abs(mod(c*1.1+1., vec3(2.))-1.);
    c = pow(c, vec3(2.));
    // Output to screen
    gl_FragColor = vec4(c,1.0)*color;
}