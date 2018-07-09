import React from 'react'
import styled from 'styled-components'
import ViewHeader from '../ViewHeader'
import Input from '../Input'
import Button from '../Button'
import Row from '../Row'
import Col from '../Col'

const Wrapper = styled.div`
  display: flex;
  height: 100%;
  flex-direction: column;
`

const ExportSettings = ({onSaveClick}) => (
  <Wrapper>
    <ViewHeader>Settings</ViewHeader>
    <form onSubmit={e => e.preventDefault()}>
      <h2>Gif :)</h2>
      <Row>
        <Col width='8rem'>
          <Input name='gifFrames' label='Frames' type='number' />
        </Col>
        <Col width='8rem'>
          <Input name='gifWarmup' label='Warmup Frames' type='number' />
        </Col>
      </Row>
      <Row>
        <Col width='8rem'>
          <Input name='gifWidth' label='Width' type='number' />
        </Col>
        <Col width='8rem'>
          <Input name='gifHeight' label='Height' type='number' />
        </Col>
      </Row>
      <Row>
        <Col width='16rem'>
          <Input name='gifName' label='Name' type='text' />
        </Col>
      </Row>
      <Row>
        <Col width='8rem'>
          <Input name='gifGenerate' label='Batch Generate' type='number' />
        </Col>
      </Row>
      <Row>
         <Col width='16rem'>
          <Input name='gifPath' label='Path' type='text' />
        </Col>
      </Row>
      <Row>
        <Col width='8rem'>
          <Button name='gifSave' size='large' onClick={onSaveClick} >Save</Button>
        </Col>
      </Row>
    </form>
  </Wrapper>
)

export default ExportSettings
