import { CSSProperties } from 'react'
import type { COLOR_BLEND_KEYS as EngineColorBlendKeys, ParamNode } from '@hedron-gl/engine'
import { ControlGrid } from '@components/ControlGrid/ControlGrid'
import { NodeContainer } from '@containers/NodeContainer/NodeContainer'
import { useNodeOptionNodes } from '@hooks/useNodeOptionNodes'
import { useEngine, useEngineStore } from '@hooks/engineHooks'
import { toCssRgb } from '@utils/toCssRgb'

// Mirrors the engine's keys (type-checked) so ui-core doesn't bundle the engine
const KEYS = {
  colorB: 'colorB',
  blend: 'blend',
  space: 'blendSpace',
  curve: 'blendCurve',
  hue: 'blendHue',
  range: 'blendRange',
} as const satisfies typeof EngineColorBlendKeys

const HUE_SPACES = ['hsl', 'hsv', 'oklch']
const GRADIENT_SAMPLES = 32
// 1px black outline keeps the value readable over light colors
const TEXT_OUTLINE = [-1, 0, 1]
  .flatMap((x) => [-1, 0, 1].map((y) => `${x}px ${y}px 0 #000`))
  .join(', ')

// Returns a string so the component only rerenders when the gradient changes
const useBlendGradient = (id: string) => {
  const engine = useEngine()

  return useEngineStore(() => {
    const samples = engine.sampleColorBlend(id, GRADIENT_SAMPLES)
    return samples && `linear-gradient(to right, ${samples.map(toCssRgb).join(', ')})`
  })
}

interface ParamColorBlendProps {
  id: string
}

/** Color B, blend and blend settings for an rgb param */
export const ParamColorBlend = ({ id }: ParamColorBlendProps) => {
  const options = useNodeOptionNodes<Record<string, ParamNode | undefined>>(id)
  const gradient = useBlendGradient(id)
  const spaceId = options[KEYS.space]?.id
  const space = useEngineStore((state) => (spaceId ? state.paramValues[spaceId] : undefined))

  const colorB = options[KEYS.colorB]
  const blend = options[KEYS.blend]
  if (!colorB || !blend) return null

  const settingIds = [KEYS.space, KEYS.curve, KEYS.hue, KEYS.range]
    .filter((key) => key !== KEYS.hue || HUE_SPACES.includes(space as string))
    .map((key) => options[key]?.id)
    .filter((nodeId): nodeId is string => !!nodeId)

  return (
    <ControlGrid>
      <NodeContainer nodeId={colorB.id} />
      <div
        style={
          {
            display: 'contents',
            '--floatSliderBackgroundColor': gradient,
            '--numberInputTextShadow': TEXT_OUTLINE,
            '--numberInputTextIndent': '1px',
          } as CSSProperties
        }
      >
        <NodeContainer nodeId={blend.id} />
      </div>
      {settingIds.map((nodeId) => (
        <NodeContainer key={nodeId} nodeId={nodeId} />
      ))}
    </ControlGrid>
  )
}
