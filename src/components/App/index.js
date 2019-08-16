import React from 'react'
import PropTypes from 'prop-types'
import CurrentScene from '../CurrentScene'
import Macros from '../../containers/Macros'
import Settings from '../../containers/Settings'
import Overview from '../Overview'
import { Route } from 'react-router'
import styled from 'styled-components'
import PanelDragger from '../PanelDragger'
import MidiLearn from '../../containers/MidiLearn'
import EditingOverlay from '../../containers/EditingOverlay'
import ErrorOverlay from '../../containers/ErrorOverlay'
import AboutOverlay from '../../containers/AboutOverlay'
import MainViewOuter from '../../containers/MainViewOuter'
import ParamPropertiesPanel from '../../containers/ParamPropertiesPanel'
import MacroPropertiesPanel from '../../containers/MacroPropertiesPanel'
import Home from '../../containers/Home'
import ScenesNav from '../ScenesNav'

const Wrapper = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #333;
  color: white;
`

const Left = styled.div`
  flex: 0 0 ${props => props.width}%;
  position: relative;
  padding: 0.5rem;
`

const Right = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`

const Bar = styled.div`
  display: flex;
  flex-direction: column;
  flex: 0 0 3rem;
  background: #111;
  height: 100%;
`
const App = ({ stats, leftWidth, onLeftDrag, onWrapperClick, sketchId, macroId }) => (
  <Wrapper onMouseDown={onWrapperClick}>
    <Left width={leftWidth}>
      <Overview stats={stats} />
      <PanelDragger onHandleDrag={onLeftDrag} position={leftWidth} />
    </Left>
    <Right>
      <MainViewOuter>
        <Route path='/' exact component={Home} />
        <Route path='/scenes' component={CurrentScene} />
        <Route path='/macros' component={Macros} />
        <Route path='/settings' component={Settings} />
      </MainViewOuter>

      <Route path='/scenes' render={() => <ParamPropertiesPanel sketchId={sketchId} />} />
      <Route path='/macros' component={MacroPropertiesPanel} />
    </Right>
    <Bar>
      <Route path='/scenes' component={ScenesNav} />
    </Bar>
    <MidiLearn />
    <EditingOverlay />
    <ErrorOverlay />
    <AboutOverlay />
  </Wrapper>
)

export default App

App.propTypes = {
  stats: PropTypes.object.isRequired,
  leftWidth: PropTypes.number.isRequired,
  onLeftDrag: PropTypes.func.isRequired,
  onWrapperClick: PropTypes.func.isRequired,
  sketchId: PropTypes.oneOfType([
    PropTypes.string, PropTypes.bool,
  ]).isRequired,
  macroId: PropTypes.string,
}
