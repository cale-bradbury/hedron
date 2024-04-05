import { connect } from 'react-redux'
import ConnectedDevices from '../../components/ConnectedDevices'
import getConnectedDevices from '../../selectors/getConnectedDevices'
import getConnectedAudioInputs from '../../selectors/getConnectedAudioInputs'
import { audioSettingsUpdate } from '../../store/audio/actions'
import { reduxForm } from 'redux-form'

const mapStateToProps = (state, ownProps) => ({
  items: getConnectedDevices(state),
  audio: getConnectedAudioInputs(state)
})

const mapDispatchToProps = (dispatch, ownProps) => ({
  onChange: (values) => {
    console.error('values', values)
    dispatch(audioSettingsUpdate(ownProps.audio[0].id))
  },
})

const Device = reduxForm()(ConnectedDevices)

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  null,
  {
    areStatesEqual: (next, prev) => next.midi === prev.midi,
  }
)(Device)
