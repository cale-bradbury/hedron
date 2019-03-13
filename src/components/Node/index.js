import React from 'react'
import PropTypes from 'prop-types'
import ParamBar from '../../containers/ParamBar'
import NodeSelect from '../../containers/NodeSelect'
import NodeInputIcons from '../../containers/NodeInputIcons'
import styled from 'styled-components'
import { PanelContext } from '../../context'
import theme from '../../utils/theme'

const Wrapper = styled.div`
  border: 1px solid ${theme.lineColor1};
  border-radius: 3px;
  color: ${theme.textColorLight1};
  fill: ${theme.textColorLight1};
  padding: 0.25rem;
  display: flex;
  flex-direction: column;

  ${props => {
    switch (props.theme) {
      case 'panel':
        return `border-color: ${theme.bgColorDark3};`
      case 'light':
        return `border-color: ${theme.lineColor2};`
    }
  }}
  

  ${props => props.isOpen && `
    border-color: white;
  `}
`

const Main = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Inner = styled.div`
  margin-bottom: 0.25rem;
  width: 50%;
`

const Title = styled.div`
  width: 50%;
  border-bottom: 1px dotted ${theme.bgColorDark3};
  display: flex;
  align-items: center;
  height: 16px;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
  font-size: 0.5rem;
  z-index: 1;

  ${props => {
    switch (props.theme) {
      case 'light':
        return `border-color: ${theme.lineColor2};`
    }
  }}
`

const Select = styled(NodeSelect)`
  flex: 1;
`

const Node = ({ title, nodeId, isOpen, onParamBarClick, type, panelId, theme }) => (
  <PanelContext.Consumer>
    {panelIdCtx => {
      const computedTheme = theme || (panelIdCtx !== undefined ? 'panel' : 'sketch')
      panelId = panelId || panelIdCtx

      let inner

      switch (type) {
        case 'select':
          inner = (
            <Select nodeId={nodeId} />
          )
          break
        case 'slider':
        default:
          inner = (
            <ParamBar
              nodeId={nodeId}
              onMouseDown={onParamBarClick}
              type={type}
              theme={computedTheme}
            />
          )
      }

      return (
        <Wrapper isOpen={isOpen} theme={computedTheme}>
          <Main>
            <Title theme={theme}>{title}</Title>
            <Inner>
              {inner}
            </Inner>
          </Main>
          <NodeInputIcons nodeId={nodeId} panelId={panelId} />
        </Wrapper>
      )
    }}
  </PanelContext.Consumer>
)

Node.propTypes = {
  title: PropTypes.string.isRequired,
  nodeId: PropTypes.string.isRequired,
  isOpen: PropTypes.bool,
  onParamBarClick: PropTypes.func,
  type: PropTypes.string,
  panelId: PropTypes.string,
  theme: PropTypes.string,
}

export default Node
