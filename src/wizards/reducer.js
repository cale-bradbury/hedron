const defaultState = {
  importedSketchDirectory: "shadertoySketches",
  shadertoyID: "Ms3cR4",
}

const wizardsReducer = (state = defaultState, action) => {
  const p = action.payload

  switch (action.type) {
    case 'WIZARD_UPDATE': {
      return {
        ...state,
        ...p.items,
      }
    }
    default:
      return state
  }
}

export default wizardsReducer
