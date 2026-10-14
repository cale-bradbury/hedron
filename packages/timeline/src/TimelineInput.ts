import {
  defineOptionNodeConfigs,
  EngineState,
  HedronEngine,
  InputNode,
  IPlugin,
  isEqual,
  OptionNodesFromConfigs,
  isParamVector,
  ParamNode,
  ParamValue,
  ShotNode,
  isParamVectorComponent,
} from '@hedron-gl/engine'
import { DEFAULT_TIMELINE_ID, TIMELINE_DURATION } from './constants'
import { TimelineManager } from './TimelineManager'
import { getTimelineTracks } from './selectors/getTimelineTracks'
import { TimelineManagerKeyframeTrack, TimelineManagerTrack } from './types'

// defineOptionNodeConfigs is only needed if we want nice TS node name inference in other parts of the plugin
export const TIMELINE_OPTION_NODE_CONFIGS = defineOptionNodeConfigs([
  {
    nodeType: 'param',
    key: 'playheadPositionMs',
    valueType: 'number',
    defaultValue: 0,
  },
  {
    nodeType: 'param',
    key: 'timelineDurationS',
    valueType: 'number',
    displayMode: 'field',
    defaultValue: 30,
  },
  {
    nodeType: 'param',
    key: 'isPlaying',
    valueType: 'boolean',
    defaultValue: false,
  },
  // This is a cheap hack to get audio working, eventually you'll manually add an audio track
  {
    nodeType: 'param',
    key: 'audioUrl',
    valueType: 'file',
    defaultValue: null,
    accept: ['audio/*'],
  },
  {
    nodeType: 'param',
    key: 'zoomPxPerSecond',
    title: 'Timeline Zoom',
    valueType: 'number',
    defaultValue: 10,
    sliderMin: 0.01,
    sliderMax: 300,
  },
])

// We can use TimelineOptionNodes for strong typing when using useNodeOptionNodes
export type TimelineOptionNodes = OptionNodesFromConfigs<typeof TIMELINE_OPTION_NODE_CONFIGS>

const getKeyframeTracks = (tracks: TimelineManagerTrack[]): TimelineManagerKeyframeTrack[] => {
  const keyframeTracks: TimelineManagerKeyframeTrack[] = []

  for (const track of tracks) {
    if (track.trackType === 'keyframe') {
      keyframeTracks.push(track)
      continue
    }

    if (track.trackType === 'vector') {
      keyframeTracks.push(...getKeyframeTracks(track.childTracks))
    }
  }

  return keyframeTracks
}

const ACT_AS_BLEND_CONFIG = {
  nodeType: 'param',
  key: 'actAsBlend',
  title: 'Act as Blend',
  valueType: 'boolean',
  defaultValue: false,
} as const

const getTrackIds = (state: EngineState) =>
  (state.nodes[DEFAULT_TIMELINE_ID]?.childGroups as { trackIds?: string[] } | undefined)
    ?.trackIds ?? []

const getActAsBlendId = (state: EngineState, input: InputNode) =>
  input.childGroups.optionNodeIds.find(
    (id) => (state.nodes[id] as ParamNode | undefined)?.key === ACT_AS_BLEND_CONFIG.key,
  )

/** For a track on a color, the color and blend ids, whichever of the two it targets */
const getColorTrackTargets = (state: EngineState, input: InputNode) => {
  const target = state.nodes[input.targetNodeId]
  if (target?.nodeType !== 'param') return undefined

  if (target.valueType === 'rgb' && target.inputProxyId) {
    return { colorId: target.id, blendId: target.inputProxyId }
  }

  const color = target.parentIds
    .map((id) => state.nodes[id])
    .find((node) => node?.nodeType === 'param' && node.inputProxyId === target.id)
  return color ? { colorId: color.id, blendId: target.id } : undefined
}

/** Color tracks whose target doesn't match their toggle, as [trackId, targetId] pairs */
const getPendingRetargets = (state: EngineState) =>
  getTrackIds(state).flatMap((trackId) => {
    const input = state.nodes[trackId] as InputNode | undefined
    const targets = input && getColorTrackTargets(state, input)
    if (!targets) return []

    const toggleId = getActAsBlendId(state, input)
    const wanted = toggleId && state.paramValues[toggleId] ? targets.blendId : targets.colorId
    return wanted === input.targetNodeId ? [] : [[trackId, wanted] as const]
  })

export class TimelineInput implements IPlugin {
  public readonly id = 'timeline-input'
  public readonly name = 'Timeline Input'
  public readonly iconName = 'timeline'
  public readonly inputType = 'timeline-track'
  // Colors keyframe r/g/b by default, "Act as Blend" switches a track to the blend
  public readonly ignoresInputProxy = true
  public readonly description = 'Timeline-based input for automating parameters over time.'
  public timelineManagers: Map<string, TimelineManager> = new Map()
  private unsubscribeColorSync?: () => void

  onEngineInitialize(engine: HedronEngine) {
    engine.addNodeOnce(DEFAULT_TIMELINE_ID, null, {
      title: 'Default Timeline',
      key: 'default-timeline',
      nodeType: 'custom',
      customNodeType: 'timeline',
    })

    engine.addOptionNodes(DEFAULT_TIMELINE_ID, TIMELINE_OPTION_NODE_CONFIGS)

    this.syncColorTracks(engine)

    this.timelineManagers.set(
      DEFAULT_TIMELINE_ID,
      new TimelineManager({
        durationMs: TIMELINE_DURATION,
        tracks: [],
        clock: engine.clock,
      }),
    )

    this.timelineManagers.forEach((manager, timelineId) => {
      const isPlaying = engine.getNodeOptionNode(timelineId, 'isPlaying')
      const timelineDurationS = engine.getNodeOptionNode(timelineId, 'timelineDurationS')
      const playHeadPositionNode = engine.getNodeOptionNode(timelineId, 'playheadPositionMs')

      engine.getStore().subscribe(
        (state) => getTimelineTracks(state, timelineId),
        (tracks) => {
          manager.setTracks(tracks)
        },
        {
          equalityFn: isEqual,
          fireImmediately: true,
        },
      )

      engine.subscribeToParamValue(isPlaying.id, (isPlaying) => {
        if (isPlaying) {
          manager.play()
        } else {
          manager.pause()
        }
      })

      engine.subscribeToParamValue<number>(timelineDurationS.id, (timelineDurationS) => {
        if (timelineDurationS !== undefined && timelineDurationS > 0) {
          manager.setDurationMs(timelineDurationS * 1000)
        }
      })

      manager.onUpdate((changed) => {
        engine.setParamValue(playHeadPositionNode.id, manager.getPositionMs())

        const changedTrackIds = Object.keys(changed)
        if (changedTrackIds.length > 0) {
          const allTracks = getTimelineTracks(engine.getStoreState(), timelineId)
          const tracks = getKeyframeTracks(allTracks)

          const paramTargetNodeIds: string[] = []
          const paramValues: ParamValue[] = []

          for (const trackId of changedTrackIds) {
            const targetNodeId =
              tracks.find((track) => track.id === trackId)?.targetNodeId ?? trackId
            const targetNode = engine.getNode(targetNodeId)
            const value = changed[trackId]

            if (targetNode?.nodeType === 'shot') {
              engine.fireShot(targetNodeId)
              continue
            }

            paramTargetNodeIds.push(targetNodeId)
            paramValues.push(value)
          }

          if (paramTargetNodeIds.length > 0) {
            engine.setMultipleParamValues(paramTargetNodeIds, paramValues)
          }
        }
      })
    })
  }

  onNewInput(engine: HedronEngine, newInput: InputNode, targetNode: ParamNode | ShotNode) {
    // Don't do anything if we're dealing with a vector component (e.g. x,y,z)
    if (isParamVectorComponent(targetNode, engine)) {
      return
    }

    // Input ID is only a child of the target node, we also need to make it a child of the timeline node so it shows up in the timeline UI
    engine.addChildToNode(DEFAULT_TIMELINE_ID, 'trackIds', newInput.id)

    engine.addOptionNodes(newInput.id, [
      {
        nodeType: 'param',
        key: 'zoomPxPerSecond',
        title: 'Track Zoom',
        valueType: 'number',
        defaultValue: 80,
        sliderMin: 10,
        sliderMax: 300,
      },
    ])

    if (isParamVector(targetNode)) {
      targetNode.childGroups.vectorComponentIds.forEach((nodeId) => {
        const childInput = engine.addInput(this.inputType, nodeId)!

        // Add vector components as children of parent track
        engine.addChildToNode(newInput.id, 'trackIds', childInput.id)
      })
    }

    if (targetNode.nodeType === 'param' && targetNode.inputProxyId) {
      engine.addOptionNodes(newInput.id, [ACT_AS_BLEND_CONFIG])
    }
  }

  /** Points each color track at the color or its blend, matching its "Act as Blend" toggle */
  private syncColorTracks(engine: HedronEngine) {
    this.unsubscribeColorSync?.()

    for (const trackId of getTrackIds(engine.getStoreState())) {
      const state = engine.getStoreState()
      const input = state.nodes[trackId] as InputNode | undefined
      if (input && getColorTrackTargets(state, input) && !getActAsBlendId(state, input)) {
        engine.addOptionNodes(trackId, [ACT_AS_BLEND_CONFIG])
      }
    }

    this.unsubscribeColorSync = engine.getStore().subscribe(
      getPendingRetargets,
      (pending) => {
        for (const [trackId, targetId] of pending) {
          engine.retargetInput(trackId, targetId)
        }
      },
      { equalityFn: isEqual, fireImmediately: true },
    )
  }
}
