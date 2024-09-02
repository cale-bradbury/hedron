import { useMemo } from 'react'
import { useAppStore } from 'src/renderer/engine/sketchesState'

export const WorkArea = (): JSX.Element => {
  const sketchLibrary = useAppStore((state) => state.sketchLibrary)
  const sketches = useAppStore((state) => state.sketches)
  const addSketch = useAppStore((state) => state.addSketch)
  const deleteSketch = useAppStore((state) => state.deleteSketch)

  // TODO: Proper selectors/hooks to get this stuff
  const sketchLibraryVals = useMemo(() => Object.values(sketchLibrary), [sketchLibrary])
  const sketchesVals = useMemo(() => Object.values(sketches), [sketches])

  return (
    <div>
      <h2>Add Sketches</h2>
      <ul>
        {sketchLibraryVals.map(({ name, sketchId }) => (
          <li key={sketchId}>
            <button onClick={() => addSketch(sketchId)}>{name}</button>
          </li>
        ))}
      </ul>
      <h2>Remove sketches</h2>
      <ul>
        {sketchesVals.map(({ sketchId, id }) => (
          <li key={id}>
            <button onClick={() => deleteSketch(id)}>
              Remove {sketchId} ({id})
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
