import { EngineState, isParamRGB, ParamNode, ParamRGB } from '@store/types'
import { COLOR_BLEND_KEYS } from '@store/shared/colorBlendNodes'
import { ColorBlendOptions, RGB, blendColors, defaultColorBlendOptions } from '@utils/colorBlend'

const getComponents = (state: EngineState, node: ParamRGB): RGB | undefined => {
  const values = node.childGroups.vectorComponentIds.map((id) => state.paramValues[id])
  return values.every((v) => typeof v === 'number') ? (values as RGB) : undefined
}

/** True when an input drives the color's blend, otherwise the color is just Color A */
export const isColorBlendDriven = (state: Pick<EngineState, 'nodes'>, nodeId: string) => {
  const node = state.nodes[nodeId]
  const blend = isParamRGB(node) && node.inputProxyId ? state.nodes[node.inputProxyId] : undefined
  return (blend?.childGroups.inputNodeIds.length ?? 0) > 0
}

const getColorBlendState = (state: EngineState, nodeId: string) => {
  const node = state.nodes[nodeId]
  if (!isParamRGB(node)) return undefined

  const colorA = getComponents(state, node)
  if (!colorA) return undefined

  const options: ColorBlendOptions = { ...defaultColorBlendOptions }
  let colorB: RGB | undefined
  let blend = 0

  for (const id of node.childGroups.optionNodeIds) {
    const option = state.nodes[id] as ParamNode | undefined
    if (!option) continue
    const value = state.paramValues[id]

    switch (option.key) {
      case COLOR_BLEND_KEYS.colorB:
        // Color B can blend too, so use its output
        colorB = getBlendedColor(state, id)
        break
      case COLOR_BLEND_KEYS.blend:
        blend = typeof value === 'number' ? value : 0
        break
      case COLOR_BLEND_KEYS.space:
        options.space = value as ColorBlendOptions['space']
        break
      case COLOR_BLEND_KEYS.curve:
        options.curve = value as ColorBlendOptions['curve']
        break
      case COLOR_BLEND_KEYS.hue:
        options.hue = value as ColorBlendOptions['hue']
        break
      case COLOR_BLEND_KEYS.range:
        options.range = value as ColorBlendOptions['range']
        break
    }
  }

  return { node, colorA, colorB, blend, options }
}

/** The color a sketch receives: Color A, blended toward Color B while an input drives the blend */
export const getBlendedColor = (state: EngineState, nodeId: string): RGB | undefined => {
  const blendState = getColorBlendState(state, nodeId)
  if (!blendState) return undefined

  const { colorA, colorB, blend, options } = blendState
  if (!colorB || !isColorBlendDriven(state, nodeId)) return colorA
  return blendColors(colorA, colorB, blend, options)
}

/** Samples the blend across its slider range, e.g. for a gradient preview */
export const sampleBlendedColors = (
  state: EngineState,
  nodeId: string,
  count: number,
): RGB[] | undefined => {
  const blendState = getColorBlendState(state, nodeId)
  const blendId = blendState?.node.inputProxyId
  if (!blendState?.colorB || !blendId) return undefined

  const { colorA, colorB, options } = blendState
  const min = state.paramValues[`${blendId}-sliderMin`]
  const max = state.paramValues[`${blendId}-sliderMax`]
  const from = typeof min === 'number' ? min : 0
  const to = typeof max === 'number' ? max : 1

  return Array.from({ length: count }, (_, i) =>
    blendColors(colorA, colorB, from + ((to - from) * i) / (count - 1), options),
  )
}
