# DMX Lighting Plugin

This package provides a DMX lighting plugin for Hedron, supporting ArtNet and sACN protocols. It exposes a global API for sketches to set fixture colors and provides global options for protocol, brightness, lerp speed, and lerp mode.

## Features
- Set fixture colors via `hedron.lighting.setFixtureColor('color-id', [r, g, b])`
- Supports ArtNet and sACN output
- Global options: protocol, brightness, lerp speed, lerp mode
- Displays and controls all color ids
- Shows connected DMX device info (if available)
- Button to log device info to the console

## Usage
```js
hedron.lighting.setFixtureColor('my-fixture', [255, 128, 0])
```
