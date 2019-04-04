import uid from 'uid'
import path from 'path'

import { sketchCreate, sketchDelete, sketchUpdate, rSketchNodeOpenedToggle } from './actions'
import { rSceneSketchAdd, rSceneSketchRemove, sceneSketchSelect } from '../scenes/actions'
import { uNodeCreate, uNodeDelete, nodeUpdate } from '../nodes/actions'
import { engineSceneSketchAdd, engineSceneSketchDelete } from '../../engine/actions'
import getScene from '../../selectors/getScene'
import getSketch from '../../selectors/getSketch'
import getNode from '../../selectors/getNode'
import getModule from '../../selectors/getModule'
import getSketchParamIds from '../../selectors/getSketchParamIds'
import getSketchShotIds from '../../selectors/getSketchShotIds'
import getCurrentSceneId from '../../selectors/getCurrentSceneId'
import history from '../../history'
import getSketchesPath from '../../selectors/getSketchesPath'
import getModuleSketchIds from '../../selectors/getModuleSketchIds'
import {
  reloadSingleSketchModule, removeSketchFromScene,
  addSketchToScene, reloadSingleSketchConfig
} from '../../engine'
import { uMacroTargetParamLinkDelete } from '../macros/actions'

const generateParamFromConfig = (paramConfig, id, sketchId) => ({
  id,
  sketchId,
  title: paramConfig.title ? paramConfig.title : paramConfig.key,
  type: 'param',
  key: paramConfig.key,
  value: paramConfig.defaultValue,
  hidden: paramConfig.hidden === undefined ? false : paramConfig.hidden,
  min: paramConfig.defaultMin ? paramConfig.defaultMin : 0,
  max: paramConfig.defaultMax ? paramConfig.defaultMax : 1,
  defaultMin: paramConfig.defaultMin ? paramConfig.defaultMin : 0,
  defaultMax: paramConfig.defaultMax ? paramConfig.defaultMax : 1,
  inputLinkIds: [],
})

const paramDelete = (paramId, store) => {
  const state = store.getState()
  const param = getNode(state, paramId)
  param.connectedMacroIds.forEach(macroId => {
    store.dispatch(uMacroTargetParamLinkDelete(macroId, param.id))
  })
  store.dispatch(uNodeDelete(paramId))
}

const handleSketchCreate = (action, store) => {
  let uniqueId
  const state = store.getState()
  let { moduleId, sceneId } = action.payload

  if (!sceneId) {
    sceneId = getCurrentSceneId(state)
  }
  const uniqueSketchId = uid()
  const module = getModule(state, moduleId)
  const paramIds = []
  const inputLinkIds = []
  const shotIds = []

  store.dispatch(rSceneSketchAdd(sceneId, uniqueSketchId))

  if (module.params) {
    for (let i = 0; i < module.params.length; i++) {
      const param = module.params[i]

      uniqueId = uid()
      paramIds.push(uniqueId)
      store.dispatch(
        uNodeCreate(
          uniqueId,
          generateParamFromConfig(param, uniqueId, uniqueSketchId)
        )
      )
    }
  }

  if (module.shots) {
    for (let i = 0; i < module.shots.length; i++) {
      const shot = module.shots[i]
      uniqueId = uid()
      shotIds.push(uniqueId)
      store.dispatch(uNodeCreate(uniqueId, {
        id: uniqueId,
        value: 0,
        type: 'shot',
        title: shot.title,
        method: shot.method,
        sketchId: uniqueSketchId,
        inputLinkIds,
      }))
    }
  }

  store.dispatch(sketchCreate(uniqueSketchId, {
    title: module.defaultTitle,
    moduleId: moduleId,
    paramIds,
    shotIds,
  }))

  store.dispatch(sceneSketchSelect(sceneId, uniqueSketchId))
  store.dispatch(engineSceneSketchAdd(sceneId, uniqueSketchId, moduleId))

  history.push('/scenes/view/' + sceneId)
}

const handleSketchDelete = (action, store) => {
  let state = store.getState()
  let { id, sceneId } = action.payload
  if (!sceneId) {
    sceneId = getCurrentSceneId(state)
  }
  const paramIds = getSketchParamIds(state, id)

  store.dispatch(rSceneSketchRemove(sceneId, id))

  for (let i = 0; i < paramIds.length; i++) {
    paramDelete(paramIds[i], store)
  }

  const shotIds = getSketchShotIds(state, id)

  for (let i = 0; i < shotIds.length; i++) {
    store.dispatch(uNodeDelete(shotIds[i]))
  }

  store.dispatch(sketchDelete(id))

  state = store.getState()
  const currentScene = getScene(state, sceneId)
  const sketchIds = currentScene.sketchIds
  const newSceneSketchId = sketchIds[sketchIds.length - 1] || false
  store.dispatch(sceneSketchSelect(sceneId, newSceneSketchId))
  store.dispatch(engineSceneSketchDelete(sceneId, id))
  history.push('/scenes/view/' + sceneId)
}

const handleSketchNodeOpenedToggle = (action, store) => {
  const state = store.getState()
  const node = getNode(state, action.payload.nodeId)
  store.dispatch(rSketchNodeOpenedToggle(node.sketchId, node.id))
}

const sketchReimport = (sketchId, store) => {
  const state = store.getState()
  const sketch = getSketch(state, sketchId)
  const sketchModule = getModule(state, sketch.moduleId)
  let paramIds = sketch.paramIds
  let shotIds = sketch.shotIds
  const sketchParams = {}
  const sketchShots = {}

  const moduleParams = sketchModule.params
  const moduleShots = sketchModule.shots

  // loop through current params (backwards because we might delete some!)
  for (let i = paramIds.length - 1; i > -1; i--) {
    const param = getNode(state, paramIds[i])
    const found = moduleParams.find(moduleParam => moduleParam.key === param.key)

    if (found) {
      sketchParams[param.key] = param
    } else {
      // if param doesnt match with new params, remove the node
      paramIds = paramIds.filter(id => param.id !== id)
      paramDelete(param.id, store)
    }
  }

  // loop through current shots (backwards because we might delete some!)
  for (let i = shotIds.length - 1; i > -1; i--) {
    const shot = getNode(state, shotIds[i])
    const found = moduleShots.find(moduleShot => moduleShot.method === shot.method)

    if (found) {
      sketchShots[shot.method] = shot
    } else {
      // if shot doesnt match with new shots, remove the node
      shotIds = shotIds.filter(id => shot.id !== id)
      store.dispatch(uNodeDelete(shot.id))
    }
  }

  // Look through the loaded module's params for new ones
  for (let i = 0; i < moduleParams.length; i++) {
    const moduleParam = moduleParams[i]
    const sketchParam = sketchParams[moduleParam.key]

    if (!sketchParam) {
      // If module param doesnt exist in sketch, it needs to be created
      const uniqueId = uid()
      paramIds = [
        ...paramIds.slice(0, i), uniqueId, ...paramIds.slice(i),
      ]
      store.dispatch(
        uNodeCreate(
          uniqueId,
          generateParamFromConfig(moduleParam, uniqueId, sketchId)
        )
      )
    } else {
      // If param does exist, some properties may have changed (e.g. title, defaultMin, defaultMax, hidden)
      const id = sketchParam.id
      store.dispatch(nodeUpdate(id, {
        title: moduleParam.title ? moduleParam.title : moduleParam.key,
        defaultMin: moduleParam.defaultMin ? moduleParam.defaultMin : 0,
        defaultMax: moduleParam.defaultMax ? moduleParam.defaultMax : 1,
        hidden: moduleParam.hidden === undefined ? false : moduleParam.hidden,
      }))
    }
  }

  // Look through the loaded module's shots for new ones
  for (let i = 0; i < moduleShots.length; i++) {
    const moduleShot = moduleShots[i]
    const sketchShot = sketchShots[moduleShot.method]

    if (!sketchShot) {
      // If module shot doesnt exist in sketch, it needs to be created
      const uniqueId = uid()
      shotIds = [
        ...shotIds.slice(0, i), uniqueId, ...shotIds.slice(i),
      ]
      store.dispatch(uNodeCreate(uniqueId, {
        id: uniqueId,
        value: 0,
        type: 'shot',
        title: moduleShot.title,
        method: moduleShot.method,
        sketchId: sketchId,
        inputLinkIds: [],
      }))
    } else {
      // If param does exist, the title may still change
      const id = sketchShot.id
      store.dispatch(nodeUpdate(id, { title: sketchShot.title }))
    }
  }

  store.dispatch(sketchUpdate(sketchId, { paramIds, shotIds }))
}

// Reload the index file for a sketch module but not the config
const moduleReloadFile = (moduleId, state) => {
  const sketchesPath = getSketchesPath(state)
  const moduleFilePathArray = getModule(state, moduleId).filePathArray
  const moduleSketchIds = getModuleSketchIds(state, moduleId)

  const modulePath = path.join(sketchesPath, moduleFilePathArray.join('/'), moduleId)

  // Reload updated module into app
  reloadSingleSketchModule(modulePath, moduleId, moduleFilePathArray)

  // Loop all sketches that are of this module, remove them from webGL scene and add them again
  moduleSketchIds.forEach(obj => {
    // These funcs only affect the scene, not the application state, so won't destroy params etc
    removeSketchFromScene(obj.sceneId, obj.sketchId)
    addSketchToScene(obj.sceneId, obj.sketchId, moduleId)
  })
}

const handleModuleReloadFile = (action, store) => {
  const state = store.getState()
  moduleReloadFile(action.payload.moduleId, state)
}

// Reload config file and update params for all sketches using that module
// Also reloads module
const handleConfigReloadFile = (action, store) => {
  const state = store.getState()
  const moduleId = action.payload.moduleId
  const sketchesPath = getSketchesPath(state)
  const moduleSketchIds = getModuleSketchIds(state, moduleId)
  const moduleFilePathArray = getModule(state, moduleId).filePathArray
  const modulePath = path.join(sketchesPath, moduleFilePathArray.join('/'), moduleId)

  moduleSketchIds.forEach(obj => {
    reloadSingleSketchConfig(modulePath, moduleId, moduleFilePathArray)
    sketchReimport(obj.sketchId, store)
  })

  moduleReloadFile(moduleId, state)
}

// Reload config file and update params for just one sketch using that module
// Also reloads module
const handleSketchReimport = (action, store) => {
  const state = store.getState()
  const sketchId = action.payload.id
  const sketch = getSketch(state, sketchId)
  const moduleId = sketch.moduleId

  const sketchesPath = getSketchesPath(state)
  const moduleFilePathArray = getModule(state, moduleId).filePathArray
  const modulePath = path.join(sketchesPath, moduleFilePathArray.join('/'), moduleId)

  reloadSingleSketchConfig(modulePath, moduleId, moduleFilePathArray)
  sketchReimport(sketchId, store)
  moduleReloadFile(moduleId, state)
}

export default (action, store) => {
  switch (action.type) {
    case 'U_SKETCH_CREATE':
      handleSketchCreate(action, store)
      break
    case 'U_SKETCH_DELETE':
      handleSketchDelete(action, store)
      break
    case 'U_SKETCH_NODE_OPENED_TOGGLE':
      handleSketchNodeOpenedToggle(action, store)
      break
    case 'U_SKETCH_RELOAD_FILE':
      handleSketchReimport(action, store)
      break
    case 'FILE_SKETCH_MODULE_CHANGED':
      handleModuleReloadFile(action, store)
      break
    case 'FILE_SKETCH_CONFIG_CHANGED':
      handleConfigReloadFile(action, store)
      break
  }
}
