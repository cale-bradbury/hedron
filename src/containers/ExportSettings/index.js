import { connect } from 'react-redux'
import ExportSettingsComponent from '../../components/ExportSettings'
import { exportSettingsUpdate } from '../../store/exportSettings/actions'
import uiEventEmitter from '../../utils/uiEventEmitter'
import { reduxForm } from 'redux-form'

const mapStateToProps = (state, ownProps) => ({
  initialValues: state.exportSettings,
  enableReinitialize: true
})

const mapDispatchToProps = (dispatch, ownProps) => ({
  onChange: (values) => {
    dispatch(exportSettingsUpdate(values))
    //uiEventEmitter.emit('repaint')
  }
})

const ExportSettings = reduxForm({
  form: 'exportSettings'
})(ExportSettingsComponent)

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ExportSettings)
