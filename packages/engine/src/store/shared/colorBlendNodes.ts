import { addNode } from '@store/shared/addNode'
import { ensureNodeConfig } from '@store/shared/ensureConfig'
import {
  ConfigParam,
  ConfigParamImported,
  EngineState,
  isParamRGB,
  ParamNode,
  ParamRGB,
} from '@store/types'
import { RGB, defaultColorBlendOptions } from '@utils/colorBlend'

export const COLOR_BLEND_KEYS = {
  colorB: 'colorB',
  blend: 'blend',
  space: 'blendSpace',
  curve: 'blendCurve',
  hue: 'blendHue',
  range: 'blendRange',
} as const

const colorBlendOptionConfigs: ConfigParam[] = [
  {
    key: COLOR_BLEND_KEYS.space,
    title: 'Blend Space',
    nodeType: 'param',
    valueType: 'enum',
    defaultValue: defaultColorBlendOptions.space,
    options: [
      { value: 'srgb', label: 'RGB' },
      { value: 'linear', label: 'Linear RGB' },
      { value: 'hsl', label: 'HSL' },
      { value: 'hsv', label: 'HSV' },
      { value: 'oklab', label: 'OKLab' },
      { value: 'oklch', label: 'OKLCH' },
    ],
  },
  {
    key: COLOR_BLEND_KEYS.curve,
    title: 'Blend Curve',
    nodeType: 'param',
    valueType: 'enum',
    defaultValue: defaultColorBlendOptions.curve,
    options: [
      { value: 'linear', label: 'Linear' },
      { value: 'easeIn', label: 'Ease In' },
      { value: 'easeOut', label: 'Ease Out' },
      { value: 'easeInOut', label: 'Ease In Out' },
      { value: 'step', label: 'Step' },
    ],
  },
  {
    key: COLOR_BLEND_KEYS.hue,
    title: 'Blend Hue Path',
    nodeType: 'param',
    valueType: 'enum',
    defaultValue: defaultColorBlendOptions.hue,
    options: [
      { value: 'shorter', label: 'Shorter' },
      { value: 'longer', label: 'Longer' },
      { value: 'increasing', label: 'Increasing' },
      { value: 'decreasing', label: 'Decreasing' },
    ],
  },
  {
    key: COLOR_BLEND_KEYS.range,
    title: 'Blend Overflow',
    nodeType: 'param',
    valueType: 'enum',
    defaultValue: defaultColorBlendOptions.range,
    options: [
      { value: 'clamp', label: 'Clamp' },
      { value: 'repeat', label: 'Repeat' },
      { value: 'mirror', label: 'Mirror' },
    ],
  },
]

const findOptionNode = (state: EngineState, parent: ParamRGB, key: string) =>
  parent.childGroups.optionNodeIds
    .map((id) => state.nodes[id] as ParamNode | undefined)
    .find((node) => node?.key === key)

/** Gives an rgb param a Color B and a numeric blend for inputs to drive, adding only what's missing */
export const ensureColorBlendNodes = (state: EngineState, nodeId: string) => {
  const node = state.nodes[nodeId]
  if (!isParamRGB(node)) return

  const configs: ConfigParam[] = [
    {
      key: COLOR_BLEND_KEYS.colorB,
      title: 'Color B',
      nodeType: 'param',
      valueType: 'rgb',
      defaultValue: node.defaultValue.map((c) => 1 - c) as RGB,
    },
    {
      key: COLOR_BLEND_KEYS.blend,
      title: `${node.title} Blend`,
      nodeType: 'param',
      valueType: 'number',
      defaultValue: 0,
    },
    ...colorBlendOptionConfigs,
  ]

  for (const config of configs) {
    if (findOptionNode(state, node, config.key)) continue

    const optionId = `${nodeId}-${config.key}`
    // Hidden from the generic options list, ParamColorBlend shows them instead
    const imported = ensureNodeConfig({ ...config, hidden: true }) as ConfigParamImported
    addNode(state, optionId, nodeId, imported)
    node.childGroups.optionNodeIds.push(optionId)
  }

  node.inputProxyId = findOptionNode(state, node, COLOR_BLEND_KEYS.blend)?.id
}
