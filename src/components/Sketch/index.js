import React from 'react'
import PropTypes from 'prop-types'
import SketchParam from '../../containers/SketchParam'
import Shot from '../../containers/Shot'
import Button from '../Button'
import SceneHeader from '../../containers/SceneHeader'
import ViewSubheader from '../ViewSubheader'
import Items from '../Items'
import Item from '../Item'
import styled from 'styled-components'

const Wrapper = styled.div`
  display: flex;
  height: 100%;
  flex-direction: column;
`

const Bottom = styled.div`
  margin-top: auto;
  padding-top: 3rem;
  padding-bottom: 0.5rem;
  flex: 0 0 2rem;

  & > div {
    display: flex;
    text-align: right;
    justify-content: space-between;
  }
`

const ActionButton = styled(Button)`
  margin-left: 0.5rem;
`

const DeleteButton = styled(Button)`
  margin-right: auto;
`

const Sketch = ({ title, params, shots, onDeleteClick, sketchId,
  onRenameClick, onReloadFileClick }) => (
    <Wrapper>
      <SceneHeader
        onButtonClick={e => {
          e.stopPropagation()
          onRenameClick(sketchId)
        }}
        buttonText='Rename'>
        {title}
      </SceneHeader>

      {params.length > 0 &&
        <div>
          <ViewSubheader>Params</ViewSubheader>
          <Items>
            {params.map((id, index) => (
              <Item key={id}>
                <SketchParam nodeId={id} index={index} />
              </Item>
            ))}
          </Items>
        </div>
      }

      {shots.length > 0 &&
        <div>
          <ViewSubheader>Shots</ViewSubheader>
          <Items>
            {shots.map((id, index) => (
              <Item key={id}>
                <Shot nodeId={id} index={index} />
              </Item>
            ))}
          </Items>
        </div>
      }

      <Bottom>
        <div>
          <DeleteButton color='danger' onClick={() => { onDeleteClick(sketchId) }}>Delete Sketch</DeleteButton>
          <ActionButton onClick={() => { onReloadFileClick(sketchId) }}>Reload File</ActionButton>
        </div>
      </Bottom>
    </Wrapper>
)

Sketch.propTypes = {
  title: PropTypes.string.isRequired,
  sketchId: PropTypes.string.isRequired,
  params: PropTypes.arrayOf(
    PropTypes.string
  ).isRequired,
  shots: PropTypes.arrayOf(
    PropTypes.string
  ).isRequired,
  onDeleteClick: PropTypes.func.isRequired,
  onRenameClick: PropTypes.func.isRequired,
  onReloadFileClick: PropTypes.func.isRequired,
}

export default Sketch
