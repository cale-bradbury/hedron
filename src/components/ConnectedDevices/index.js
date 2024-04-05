import React from 'react'
import Device from '../../containers/Device'
import styled from 'styled-components'
import PropTypes from 'prop-types'
import Input from '../Input'
import Select from '../../containers/Select'


const Wrapper = styled.div`
  padding: 0.5rem;
  border: 1px solid #111;
  margin-bottom: 0.5rem;
  display: flex;
  height: 2.5rem;
  align-items: center;
`

const ConnectedDevices = ({ items, audio }) => (
  <div>
    <h6>Connected Audio Devices</h6>
    <ul>
      <Wrapper>
        <form onSubmit={e => e.preventDefault()}>
          <Input
            name='audioChannel'
            id={`audioChannel`}
            label='Audio Input Channel'
            component={Select}
            layout='compact'
            options={
              audio.map((item, index) => ({ value: item.id, label: item.title }))
            }
          />
        </form>
      </Wrapper>
    </ul>
    <h6>Connected MIDI Devices</h6>
    <ul>
      {items.map(item => {
        return (
          <li key={item.id}>
            <Device id={item.id} />
          </li>
        )
      })}
    </ul>
  </div>
)

ConnectedDevices.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
  })),
  audio: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }))
}

export default ConnectedDevices
