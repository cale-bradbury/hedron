import { useEffect, useRef } from 'react'
import { useEngine } from '@hooks/engineHooks'
import { NodeControlSwatch } from '@components/NodeControl/NodeControl'
import { toCssRgb } from '@utils/toCssRgb'

interface ParamColorSwatchProps {
  id: string
}

/** Shows the color a sketch receives, including any blend */
export const ParamColorSwatch = ({ id }: ParamColorSwatchProps) => {
  const engine = useEngine()
  const ref = useRef<HTMLDivElement>(null)

  // Sets the style directly so a color changing every frame doesn't rerender
  useEffect(
    () =>
      engine.getStore().subscribe(
        () => {
          const color = engine.getBlendedColor(id)
          return color ? toCssRgb(color) : 'transparent'
        },
        (color) => {
          ref.current?.style.setProperty('background-color', color)
        },
        { fireImmediately: true },
      ),
    [engine, id],
  )

  return <NodeControlSwatch ref={ref} />
}
