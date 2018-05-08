import React from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'

const Wrapper = styled.div`
  width: 100%;
  position: relative;

  > canvas {
    position: absolute;
    left: 0;
    top:0;
    height: 100%;
    width: 100%;
  }
`

class Viewer extends React.Component {
  render () {
    return (
      <Wrapper innerRef={this.props.containerElRef} />
    )
  }
}

Viewer.propTypes = {
  containerElRef: PropTypes.func
}

export default Viewer
