/*{
	"NAME": "ColorMap",
	"DESCRIPTION": "A simple color gradient mapping effect, gradients are linear but with an adjustable center, you can blend between 2 gradients (ie; audio input, etc)",
	"CREDIT": "cale",
	"CATEGORIES": [
		"color"
	],
	"ISFVSN": "2",
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "wet",
			"CATEGORY": "controls",
			"TYPE": "float",
			"DEFAULT": 1,
			"MIN": 0,
			"MAX": 1
		},
		{
			"NAME": "color1A",
			"CATEGORY": "map A",
			"TYPE": "color",
			"DEFAULT": [
			0,
			0,
			0,
			1
			]
		},
		{
			"NAME": "color2A",
			"CATEGORY": "map A",
			"TYPE": "color",
			"DEFAULT": [
			0.5,
			0.5, 
			0.5,
			1
			]
		},
		{
			"NAME": "color3A",
			"CATEGORY": "map A",
			"TYPE": "color",
			"DEFAULT": [
			1,
			1,
			1,
			1
			]
		},
		{
			"NAME": "centerA",
			"CATEGORY": "map A",
			"DESCRIPTION": "Center point for color mapping (where color 2 is applied)",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.1,
			"MAX": 0.9
		},
		{
			"NAME": "color1B",
			"CATEGORY": "map B",
			"TYPE": "color",
			"DEFAULT": [
			0,
			0,
			0,
			1
			]
		},
		{
			"NAME": "color2B",
			"CATEGORY": "map B",
			"TYPE": "color",
			"DEFAULT": [
			0.5,
			0.5, 
			0.5,
			1
			]
		},
		{
			"NAME": "color3B",
			"CATEGORY": "map B",
			"TYPE": "color",
			"DEFAULT": [
			1,
			1,
			1,
			1
			]
		},
		{
			"NAME": "centerB",
			"CATEGORY": "map B",
			"DESCRIPTION": "Center point for color mapping (where color 2 is applied)",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.1,
			"MAX": 0.9
		},
		{
			"NAME": "splitRGB",
			"CATEGORY": "controls",
			"DESCRIPTION": "Do we map R/G/B individually, or map to greyscale (blended)",
			"TYPE": "float",
			"DEFAULT": 1,
			"MIN": 0,
			"MAX": 1
		},
		{
			"NAME": "mixAB",
			"CATEGORY": "controls",
			"DESCRIPTION": "Whether to use the second set of colors (color1B, color2B, color3B)",
			"TYPE": "float",
			"DEFAULT": 0,
			"MIN": 0,
			"MAX": 1
		}
	]	
}*/


void main()	{
    vec2 uv = isf_FragNormCoord.xy;
    vec4 inputColor = IMG_NORM_PIXEL(inputImage, uv);
	vec4 newColor = inputColor;
	float grey = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
	newColor.rgb = mix(vec3(grey), newColor.rgb, splitRGB);

	vec4 color1 = mix(color1A, color1B, mixAB);
	vec4 color2 = mix(color2A, color2B, mixAB);
	vec4 color3 = mix(color3A, color3B, mixAB);
	float center = mix(centerA, centerB, mixAB);
	
	newColor = mix(color1, mix(color2, color3, max(vec4(0.),newColor-center)/(center)), min(newColor/center, vec4(1.)));

    gl_FragColor = mix(inputColor, newColor, wet);
}
