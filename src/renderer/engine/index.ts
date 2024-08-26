import { uid } from 'uid'
import { EngineScene } from './EngineScene'
import { BoxGeometry, Mesh, MeshBasicMaterial, MeshNormalMaterial } from 'three'
import { render } from './renderer'

export const engineScenes = new Map<string, EngineScene>()
let debugScene: EngineScene | undefined

export const addScene = (sceneId: string): EngineScene => {
  const newScene = new EngineScene()
  engineScenes.set(sceneId, newScene)

  // renderer.setSize()
  // if (shouldSetPost) renderer.setPostProcessing()

  return newScene
}

export const createDebugScene = (): void => {
  const id = uid()
  const scene = addScene(id)
  const geom = new BoxGeometry(1, 1, 1)
  const mat = new MeshNormalMaterial()
  const mesh = new Mesh(geom, mat)
  scene.scene.add(mesh)

  debugScene = scene

  console.log(scene)
}

export const run = async (sketch): void => {
  createDebugScene()

  const thing = await import('http://127.0.0.1:3000/test-sketch/index.js')

  const testSketch = new thing.TestSketch()

  // if (debugScene) {
  //   debugScene.scene.add(sketch.root)
  // }

  const loop = (): void => {
    requestAnimationFrame(loop)
    if (debugScene) {
      // const cube = debugScene.scene.children[0]
      // cube.rotation.x += 0.1
      // cube.rotation.y += 0.1

      debugScene.scene.add(testSketch.root)

      render(debugScene)
    }
  }

  loop()
}
