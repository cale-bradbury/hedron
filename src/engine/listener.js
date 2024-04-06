import * as engine from './'
import * as renderer from './renderer'

const handleAddScene = (action) => {
  const { sceneId } = action.payload
  engine.addScene(sceneId)
}

const handleRemoveScene = (action) => {
  const { sceneId } = action.payload
  engine.removeScene(sceneId)
}

const handleAddSketch = (action) => {
  const { sceneId, sketchId, moduleId } = action.payload
  engine.addSketchToScene(sceneId, sketchId, moduleId)
}

const handleDeleteSketch = (action) => {
  const { sceneId, sketchId } = action.payload
  engine.removeSketchFromScene(sceneId, sketchId)
}

export const handleShotFired = (action) => {
  engine.fireShot(action.payload.sketchId, action.payload.method)
}

export const handleSaveImage = (action) => {
  renderer.saveSequence()
}
export const handleRandomizeAll = (action, store) => {
  let keys = Object.keys(store.getState().sketches)
  for (let i = 0; i < keys.length; i++) {
    engine.fireShot(keys[i], 'randomize')
  }
}

export default (action, store) => {
  switch (action.type) {
    case 'ENGINE_SCENE_SKETCH_ADD':
      handleAddSketch(action, store)
      break
    case 'ENGINE_SCENE_SKETCH_DELETE':
      handleDeleteSketch(action, store)
      break
    case 'ENGINE_SCENE_ADD':
      handleAddScene(action, store)
      break
    case 'ENGINE_SCENE_REMOVE':
      handleRemoveScene(action, store)
      break
    case 'NODE_SHOT_FIRED':
      handleShotFired(action, store)
      break
    case 'SAVE_IMAGE':
      handleSaveImage(action, store)
      break
    case 'RANDOMIZE_ALL':
      handleRandomizeAll(action, store)
      break
  }
}
