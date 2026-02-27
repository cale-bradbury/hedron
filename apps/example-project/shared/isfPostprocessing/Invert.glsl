
/*{
	"NAME": "Invert",
	"DESCRIPTION": "Simply inverts the image",
	"CREDIT": "cale",
	"ISFVSN": "2",
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "wet",
			"TYPE": "float",
			"DEFAULT": 0,
			"MIN": 0,
			"MAX": 1
		}
	]
	
}*/

void main()	{
    vec2 uv = isf_FragNormCoord.xy;

   	vec4 c = IMG_NORM_PIXEL(inputImage,uv);

	c.rgb = mix(c.rgb, 1.0-c.rgb, wet)

    gl_FragColor = c;
}
