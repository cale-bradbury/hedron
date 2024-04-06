/* eslint-disable no-unused-expressions */

import listen from 'redux-action-listeners'
import { createStore, applyMiddleware, combineReducers } from 'redux'
import { uSketchCreate } from '../src/store/sketches/actions'

import sketchesReducer from '../src/store/sketches/reducer'
import availableModulesReducer from '../src/store/availableModules/reducer'
import nodesReducer from '../src/store/nodes/reducer'
import scenesReducer from '../src/store/scenes/reducer'

import sketchesListener from '../src/store/sketches/listener'
import scenesListener from '../src/store/scenes/listener'
import nodesListener from '../src/store/nodes/listener'
import macrosListener from '../src/store/macros/listener'

import renderer from '../src/engine/renderer'
import {
  uSceneCreate, uScenesReorder, uSceneSketchesReorder, uSceneDelete, uSceneSettingsUpdate,
} from '../src/store/scenes/actions'

import { MockUid } from './utils/MockUid'

const mockUid = new MockUid(['scene', 'sketch'])

jest.mock('uid', () => () => mockUid.getNewId())

jest.mock('../src/engine/renderer', () => ({
  setPostProcessing: jest.fn(),
  channelUpdate: jest.fn(),
}))

const rootListener = {
  types: 'all',

  handleAction (action, dispatched, store) {
    nodesListener(action, store)
    sketchesListener(action, store)
    scenesListener(action, store)
    macrosListener(action, store)
  },
}

test('(mock) Scenes - Add/Delete/Reorder scenes', () => {
  let ppCalled = 0

  const rootReducer = combineReducers(
    {
      nodes: nodesReducer,
      availableModules: availableModulesReducer,
      sketches: sketchesReducer,
      scenes: scenesReducer,
      router: () => ({
        location: {
          pathname: 'scenes/addSketch/scene_02',
        },
      }),
    }
  )

  const store = createStore(rootReducer, {
    availableModules: {
      foo: {
        defaultTitle: 'Foo',
        params: [
          {
            key: 'speed',
            title: 'Speed',
            defaultValue: 0.5,
            defaultMin: -1,
            defaultMax: 1,
          },
        ],
        shots: [],
      },
    },
    nodes: {
      sceneCrossfader: {
        value: 0,
      },
    },
    sketches: {},
    scenes: {
      currentSceneId: false,
      sceneIds: [],
      items: {},
      channels: {
        A: false,
        B: false,
      },
    },
  }, applyMiddleware(listen(rootListener)))

  let state

  state = store.getState()

  // 'sketches start empty'
  expect(state.sketches).toEqual({})

  // setting this flag keeps scene Ids neat
  mockUid.currentMockName = 'scene'
  store.dispatch(uSceneCreate())
  state = store.getState()

  // After creating scene, id is added
  expect(state.scenes.sceneIds).toEqual(['scene_1'])
  expect(state.scenes.items).toHaveProperty('scene_1')

  mockUid.currentMockName = 'scene'
  store.dispatch(uSceneCreate())
  mockUid.currentMockName = 'scene'
  store.dispatch(uSceneCreate())

  state = store.getState()

  // After creating scene, id is added
  expect(state.scenes.sceneIds).toEqual(['scene_1', 'scene_2', 'scene_3'])
  expect(state.scenes.items).toHaveProperty('scene_1')
  expect(state.scenes.items).toHaveProperty('scene_2')
  expect(state.scenes.items).toHaveProperty('scene_3')

  mockUid.currentMockName = 'sketch'
  store.dispatch(uSketchCreate('foo', 'scene_1'))
  mockUid.currentMockName = 'sketch'
  store.dispatch(uSketchCreate('foo', 'scene_1'))
  mockUid.currentMockName = 'sketch'
  store.dispatch(uSketchCreate('foo', 'scene_1'))
  ppCalled += 3

  state = store.getState()

  // After adding some sketches, number of sketches should be correct
  expect(Object.keys(state.sketches).length).toEqual(3)
  expect(state.scenes.items.scene_1.sketchIds).toEqual(['sketch_1', 'sketch_2', 'sketch_3'])

  store.dispatch(uScenesReorder(0, 2))
  state = store.getState()

  // After reordering, scenes will be in new order
  expect(state.scenes.sceneIds).toEqual(['scene_2', 'scene_3', 'scene_1'])

  ppCalled++
  // After reordering, postprocessing is reset
  expect(renderer.setPostProcessing).toHaveBeenCalledTimes(ppCalled)

  store.dispatch(uSceneSketchesReorder('scene_1', 0, 2))
  state = store.getState()

  // After sketch reordering, sketches will be in new order
  expect(state.scenes.items.scene_1.sketchIds).toEqual(['sketch_2', 'sketch_3', 'sketch_1'])

  ppCalled++
  // After sketch reordering, postprocessing is reset
  expect(renderer.setPostProcessing).toHaveBeenCalledTimes(ppCalled)

  store.dispatch(uSceneDelete('scene_1'))
  state = store.getState()

  // After scene deleted, scene is removed from lists
  expect(state.scenes.sceneIds).toEqual(['scene_2', 'scene_3'])
  expect(state.scenes.items.scene_1).toBeUndefined()

  // After scene deleted, related sketches are removed
  expect(Object.keys(state.sketches).length).toEqual(0)

  ppCalled++
  // After scene deleted, postprocessing only called once for the scene, not 3 times (per sketch)
  expect(renderer.setPostProcessing).toHaveBeenCalledTimes(ppCalled)

  store.dispatch(uSceneSettingsUpdate('scene_2', { globalPostProcessingEnabled: true }))
  state = store.getState()

  // After scene global postprocessing is enabled, property is set
  expect(state.scenes.items.scene_2.settings.globalPostProcessingEnabled).toBeTruthy

  ppCalled++
  // After scene global postprocessing reset
  expect(renderer.setPostProcessing).toHaveBeenCalledTimes(ppCalled)
})
