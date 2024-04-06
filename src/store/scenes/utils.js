import uid from 'uid'
import { uSceneSelectChannel, sceneClearChannel } from './actions'
import { randomizeAll } from '../../engine/actions'

export const generateSceneLinkableActionIds = id => ({
  addToA: {
    action: uSceneSelectChannel(id, 'A'),
    id: uid(),
    title: 'Add to A',
  },
  addToB: {
    action: uSceneSelectChannel(id, 'B'),
    id: uid(),
    title: 'Add to B',
  },
  addToActive: {
    action: uSceneSelectChannel(id, 'active'),
    id: uid(),
    title: 'Add to Active',
  },
  addToOpposite: {
    action: uSceneSelectChannel(id, 'opposite'),
    id: uid(),
    title: 'Add to Opposite',
  },
  randomize: {
    action: randomizeAll(),
    id: uid(),
    title: 'Randomize Values',
  },
  clear: {
    action: sceneClearChannel(id),
    id: uid(),
    title: 'Clear',
  },
})
