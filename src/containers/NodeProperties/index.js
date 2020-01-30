import { connect } from 'react-redux'
import NodeProperties from '../../components/NodeProperties'
import { uiAuxToggleOpen } from '../../store/ui/actions'
import getIsAuxOpen from '../../selectors/getIsAuxOpen'
import getNode from '../../selectors/getNode'
import { getType } from '../../valueTypes'

const mapStateToProps = (state, ownProps) => {
  const node = getNode(state, ownProps.nodeId)
  const valueType = getType(node.valueType)
  return {
    type: node.type,
    displayValue: node.parentNodeId !== undefined && node.type !== 'linkableAction',
    advancedIsOpen: getIsAuxOpen(state, ownProps.nodeId),
    AdvancedControlComponent: valueType && valueType.AdvancedControlComponent,
  }
}

const mapDispatchToProps = (dispatch, ownProps) => ({
  onAdvancedClick: () => {
    dispatch(uiAuxToggleOpen(ownProps.nodeId))
  },
})

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(NodeProperties)
