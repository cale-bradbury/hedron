import { connect } from 'react-redux'
import ImportComponent from '../../components/ShadertoyImport'
import { wizardSettingsUpdate, retrieveShadertoy, createShadertoySketch } from '../../wizards/actions'
import uiEventEmitter from '../../utils/uiEventEmitter'
import { reduxForm } from 'redux-form'

const mapStateToProps = (state, ownProps) => ({
  initialValues: state.wizards,
  enableReinitialize: true,
  shader: state.wizards.shadertoy
})

const mapDispatchToProps = (dispatch, ownProps) => ({
  getShadertoy: (s) => {
    dispatch(retrieveShadertoy())
  },
  createSketch: (s) => {
    dispatch(createShadertoySketch())
  },
  onChange: (values) => {
    dispatch(wizardSettingsUpdate(values))
    uiEventEmitter.emit('repaint')
  },
})

const ShadertoyImport = reduxForm({
  form: 'shadertoy',
})(ImportComponent)

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(ShadertoyImport)
