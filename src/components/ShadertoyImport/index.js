import React from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'
import Button from '../Button'
import ViewHeader from '../ViewHeader'
import Input from '../Input'
import Row from '../Row'
import Col from '../Col'

const Wrapper = styled.div`
  display: flex;
  height: 100%;
  flex-direction: column;
`

const Description = styled.div`
  white-space: pre-wrap;
`

const renderShader = (shader, createSketch) => (
  <div>
    <h2>{shader.name}</h2>
    <Row><Col width='2rem'>author:</Col><Col width='8rem'>{shader.author}</Col></Row>
    <Row><Col width='2rem'>description:</Col><Col width='8rem'><Description>{shader.description}</Description></Col></Row>
    <br/>
    <h2>Import Config</h2>
    <Input name='isPost' label='Import as post effect?' type='checkbox' />
    <Input name='iTimeIsGlobalTime' label='iTime as global time ☒ or parameter ☐' type='checkbox' onChange />
    <br />
    <Button onClick={createSketch}>Create Sketch</Button>
  </div>
);

const ShadertoyImport = ({ getShadertoy, createSketch, shader }) => (
  <Wrapper>
    <ViewHeader>Shadertoy Import</ViewHeader>
    <form onSubmit={e => e.preventDefault()}>
      <Row>
        <Input name='importedSketchDirectory' label='Import Directory' />
      </Row>
      <Row>
        <Col>
          <Input name='shadertoyID' label='Shadertoy ID' />
        </Col>
        <Col>
          <Button onClick={getShadertoy}>Retrieve</Button>
        </Col>
      </Row>
      { shader &&  renderShader(shader, createSketch) }
    </form>
  </Wrapper>
)

ShadertoyImport.propTypes = {
  getShadertoy: PropTypes.func.isRequired,
  createSketch: PropTypes.func.isRequired,
  shader:PropTypes.object,
}

export default ShadertoyImport
