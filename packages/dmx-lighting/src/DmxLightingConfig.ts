import { IPlugin } from '@hedron-gl/engine'

export const globalOptionNodesConfig = [
  {
    nodeType: 'param',
    key: 'protocol',
    title: 'Protocol',
    valueType: 'enum',
    options: [
      { value: 'artnet', label: 'ArtNet' },
      { value: 'sacn', label: 'sACN' },
      { value: 'usb', label: 'USB DMX' },
    ],
    defaultValue: 'artnet',
  },
  {
    nodeType: 'param',
    key: 'brightness',
    title: 'Brightness',
    valueType: 'number',
    defaultValue: 1,
    sliderMin: 0,
    sliderMax: 1,
  },
  {
    nodeType: 'param',
    key: 'lerpSpeed',
    title: 'Lerp Speed',
    valueType: 'number',
    defaultValue: 0.2,
    sliderMin: 0,
    sliderMax: 1,
  },
  {
    nodeType: 'param',
    key: 'lerpMode',
    title: 'Lerp Mode',
    valueType: 'enum',
    options: [
      { value: 'linear-rgb', label: 'Linear RGB' },
      { value: 'curved-hsb', label: 'Curved HSB' },
    ],
    defaultValue: 'linear-rgb',
  },
] as const satisfies IPlugin['globalOptionNodesConfig']
