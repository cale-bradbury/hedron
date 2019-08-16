import { connect } from 'react-redux'
import SceneManager from '../../components/SceneManager'
import getCurrentScene from '../../selectors/getCurrentScene'
import {
  uSceneDelete, rSceneSelectChannel,
  uSceneSelectChannel, sceneClearChannel,
}
  from '../../store/scenes/actions'
import { uiEditingOpen } from '../../store/ui/actions'

const mapStateToProps = (state, ownProps) => (
  {
    currentScene: getCurrentScene(state),
  }
)

const mapDispatchToProps = (dispatch, ownProps) => (
  {
    onDeleteClick: sceneId => {
      dispatch(uSceneDelete(sceneId))
    },
    onClearClick: sceneId => {
      dispatch(sceneClearChannel(sceneId))
    },
    onActiveClick: sceneId => {
      dispatch(uSceneSelectChannel(sceneId, 'active'))
    },
    onOppositeClick: sceneId => {
      dispatch(uSceneSelectChannel(sceneId, 'opposite'))
    },
    onRenameClick: sceneId => {
      dispatch(uiEditingOpen('sceneTitle', sceneId))
    },
    onChannelClick: (sceneId, channel) => {
      dispatch(rSceneSelectChannel(sceneId, channel))
    },
  }
)

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SceneManager)
