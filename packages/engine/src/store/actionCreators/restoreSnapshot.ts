import { SetterCreator, NodeValue } from '@store/types'

const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t
}

const canTween = (value: NodeValue): value is number | [number, number, number] => {
  return (
    typeof value === 'number' ||
    (Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'))
  )
}

export const createRestoreSnapshot: SetterCreator<'restoreSnapshot'> =
  (setState) => (snapshotId: string, durationSeconds?: number) => {
    setState((state) => {
      if (!state.snapshots || !state.snapshots[snapshotId]) {
        console.error(`Snapshot ${snapshotId} not found`)
        return
      }

      const snapshot = state.snapshots[snapshotId]

      // If no duration, instant snap
      if (!durationSeconds || durationSeconds <= 0) {
        Object.keys(snapshot.nodeValues).forEach((nodeId) => {
          if (state.nodes[nodeId]) {
            state.nodeValues[nodeId] = snapshot.nodeValues[nodeId]
          }
        })
        return
      }

      // Tween over time
      const startValues: Record<string, NodeValue> = {}
      const targetValues: Record<string, NodeValue> = {}
      const tweenableNodeIds: string[] = []

      Object.keys(snapshot.nodeValues).forEach((nodeId) => {
        if (state.nodes[nodeId]) {
          const currentValue = state.nodeValues[nodeId]
          const targetValue = snapshot.nodeValues[nodeId]

          if (canTween(currentValue) && canTween(targetValue)) {
            startValues[nodeId] = currentValue
            targetValues[nodeId] = targetValue
            tweenableNodeIds.push(nodeId)
          } else {
            // Non-twenable values snap immediately
            state.nodeValues[nodeId] = targetValue
          }
        }
      })

      if (tweenableNodeIds.length === 0) return

      // Perform tween animation
      const startTime = performance.now()
      const durationMs = durationSeconds * 1000

      const animate = () => {
        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / durationMs, 1)
        const eased =
          progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2 // easeInOutQuad

        setState((state) => {
          tweenableNodeIds.forEach((nodeId) => {
            const start = startValues[nodeId]
            const target = targetValues[nodeId]

            if (typeof start === 'number' && typeof target === 'number') {
              state.nodeValues[nodeId] = lerp(start, target, eased)
            } else if (Array.isArray(start) && Array.isArray(target)) {
              state.nodeValues[nodeId] = [
                lerp(start[0], target[0], eased),
                lerp(start[1], target[1], eased),
                lerp(start[2], target[2], eased),
              ] as [number, number, number]
            }
          })
        })

        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }

      requestAnimationFrame(animate)
    })
  }
