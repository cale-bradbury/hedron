# DMX Lighting Plugin

DMX lighting for Hedron over USB, ArtNet and sACN. Sketches write colours into named
sources; the panel decides which lights exist, where they are patched and which colours
reach which of their heads.

## Features
- A fixture library shared by every project, with explicit channel tables per mode
- A rig of fixtures at any address, sharing channels where the hardware does
- Mappings that spread a source across heads or reduce a range to one colour
- A channel map with per-channel descriptions on hover and overrides on click
- Identify, duplicate-to-next-address and a top-down stage view

## Usage
```js
const strip = hedron.lighting.source('strip', 28)
strip.set(0, 255, 128, 0)

hedron.lighting.setColor('house', 255, 128, 0)
```

See `DMX.md` for the full model.
