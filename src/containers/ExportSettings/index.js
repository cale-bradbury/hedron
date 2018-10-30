import { connect } from 'react-redux'
import ExportSettingsComponent from '../../components/ExportSettings'
import { exportSettingsUpdate } from '../../store/exportSettings/actions'
import uiEventEmitter from '../../utils/uiEventEmitter'
import { reduxForm } from 'redux-form'
import { beginSaveSequence } from '../../engine/renderer'

const mapStateToProps = (state, ownProps) => ({
  initialValues: state.exportSettings,
  enableReinitialize: true,
})

const mapDispatchToProps = (dispatch, ownProps) => ({
  onChange: (values) => {
    dispatch(exportSettingsUpdate(values))
    // uiEventEmitter.emit('repaint')
  },
  onSaveClick: () => {
    console.log(ownProps)
    beginSaveSequence(ownProps.gifPath + '\\' + ownProps.gifName)
  },
})

const ExportSettings = reduxForm({
  form: 'exportSettings',
})(ExportSettingsComponent)

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ExportSettings)
