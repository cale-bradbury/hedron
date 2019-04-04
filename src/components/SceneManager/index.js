import React from 'react'
import PropTypes from 'prop-types'
import Button from '../Button'
import RowComponent from '../Row'
import styled from 'styled-components'
import SceneThumb from '../SceneThumb'
import SceneThumbContainer from '../../containers/SceneThumb'
import ButtonWithInputIcons from '../ButtonWithInputIcons'
import theme from '../../utils/theme'

const Wrapper = styled.nav`
  margin-bottom: 2rem;
`

const Row = styled(RowComponent)`
  flex-wrap: wrap;
`

const Thumbs = styled.div`
  display: flex;
  flex-wrap: wrap;
`

const Panel = styled.div`
  padding: 0.5rem;
  padding-bottom: 0;
  background: ${theme.bgColorDark2};

  h4 {
    font-size: 0.7rem;
    text-transform: uppercase;
  }
`

const Col = styled.div`
  margin-right: 1rem;
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
`

const ActionButton = (props) => (
  <Col>
    <ButtonWithInputIcons {...props} />
  </Col>
)

const SceneManager = (
  {
    items, onAddClick, currentScene, onDeleteClick, onRenameClick, onChannelClick,
    onClearClick, onActiveClick, onOppositeClick, onSaveClick, onRandomClick,
 }
) => {
  const la = currentScene && currentScene.linkableActionIds
  return (
    <Wrapper>
      <Thumbs>
        {items.map(item => (
          <SceneThumbContainer
            key={item.id}
            id={item.id}
        />
      ))}
        <SceneThumb onClick={onAddClick}>+</SceneThumb>
      </Thumbs>
      {currentScene &&
      <Panel>
        <h4>Current scene: {currentScene.title}</h4>

        <Row>
          <ActionButton
            onClick={() => { onChannelClick(currentScene.id, 'A') }}
            color='channelA'
            linkableActionId={la.addToA}
            panelId='overview'
          >
            Add to A
          </ActionButton>

          <ActionButton
            onClick={() => { onChannelClick(currentScene.id, 'B') }}
            color='channelB'
            linkableActionId={la.addToB}
            panelId='overview'
          >
            Add to B
          </ActionButton>

          <ActionButton
            onClick={() => { onActiveClick(currentScene.id) }}
            linkableActionId={la.addToActive}
            panelId='overview'
          >
            Add to Active
          </ActionButton>

          <ActionButton
            onClick={() => { onOppositeClick(currentScene.id) }}
            linkableActionId={la.addToOpposite}
            panelId='overview'
          >
            Add to Opposite
          </ActionButton>

          <ActionButton
            onClick={() => { onClearClick(currentScene.id) }}
            linkableActionId={la.clear}
            panelId='overview'
          >
            Clear
          </ActionButton>

          <Col>
            <Button
              onClick={e => {
                e.stopPropagation()
                onRenameClick(currentScene.id)
              }
              }>Rename</Button>
          </Col>
          <Col>
            <Button color='danger' onClick={() => { onDeleteClick(currentScene.id) }}>Delete</Button>
          </Col>
          <Col>
            <Button onClick={() => { onSaveClick() }}>Save Png</Button>
            <Button onClick={() => { onRandomClick() }}>Randomize</Button>
          </Col>
        </Row>
      </Panel>
    }
    </Wrapper>
  )
}

SceneManager.propTypes = {
  currentScene: PropTypes.object,
  onAddClick: PropTypes.func.isRequired,
  onRenameClick: PropTypes.func.isRequired,
  onDeleteClick: PropTypes.func.isRequired,
  onChannelClick: PropTypes.func.isRequired,
  onClearClick: PropTypes.func.isRequired,
  onActiveClick: PropTypes.func.isRequired,
  onOppositeClick: PropTypes.func.isRequired,
  onSaveClick: PropTypes.func.isRequired,
  onRandomClick: PropTypes.func.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      title: PropTypes.string,
    })
  ),
}

export default SceneManager
