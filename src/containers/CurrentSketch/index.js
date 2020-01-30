import { connect } from 'react-redux'
import CurrentSketchComponent from '../../components/CurrentSketch'
import { uSketchDelete, uSketchReloadFile } from '../../store/sketches/actions'
import getSelectedSketchId from '../../selectors/getSelectedSketchId'
import { uiEditingOpen } from '../../store/ui/actions'

const mapStateToProps = (state, ownProps) => {
  const sketchId = getSelectedSketchId(state)

  if (sketchId) {
    return {
      isSketch: true,
      title: state.sketches[sketchId].title,
      sketchId: sketchId,
    }
  } else {
    return {
      isSketch: false,
    }
  }
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onDeleteClick: sketchId => dispatch(uSketchDelete(sketchId)),
    onRenameClick: sketchId => {
      dispatch(uiEditingOpen('sketchTitle', sketchId))
    },
    onReloadFileClick: sketchId => dispatch(uSketchReloadFile(sketchId)),
  }
}

const CurrentSketch = connect(
  mapStateToProps,
  mapDispatchToProps
)(CurrentSketchComponent)

export default CurrentSketch
