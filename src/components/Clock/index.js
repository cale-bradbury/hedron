import React from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'
import Button from '../Button'
import InputLinkMidiControl from '../../containers/InputLinkMidiControl'

const Wrapper = styled.div`
  height: 48px;
  color: white;
  display: flex;
`

const Col = styled.div`
  margin-right: 0.5rem;
`

const Top = styled.div`
  font-size: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
`

const TapButton = styled(Button)`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
`

const Bottom = styled.div`
  text-align: center;
  margin-bottom: 0.25rem;
`

const Item = ({ title, onClick, linkableActionId, color }) =>
  <Col>
    <Button onClick={onClick} color={color}>{title}</Button>
    <InputLinkMidiControl linkableActionId={linkableActionId} />
  </Col>

const Clock = ({ beat, bar, phrase, bpm, onResetClick, onTapTempoClick, onTapTempoId }) => (
  <Wrapper>
    <Col>
      <Top>{beat} - {bar} - {phrase}</Top>
      <Bottom>{bpm}</Bottom>
      <Button onMouseDown={(e)=>{
                            e.stopPropagation(); 
                            onResetClick()
                          }}>Reset</Button>
    </Col>
    <Col>
      <TapButton onMouseDown={(e)=>{
                              e.stopPropagation(); 
                              onTapTempoClick();
                             }}>Tap<br />Tempo</TapButton>
    </Col>
  </Wrapper>
)

Clock.propTypes = {
  beat: PropTypes.number.isRequired,
  bar: PropTypes.number.isRequired,
  phrase: PropTypes.number.isRequired,
  bpm: PropTypes.number,
  onResetClick: PropTypes.func.isRequired,
  onTapTempoClick: PropTypes.func.isRequired,
}

export default Clock
