const defaultState = {
	gifWidth: 1920,
	gifHeight: 1080,
	gifFrames: 60,
	gifWarmup: 0,
	gifGenerate: 1,
	gifName: "gifName"
}

const exportSettingsReducer = (state = defaultState, action) => {
  const p = action.payload

  switch (action.type) {
    case 'EXPORT_SETTINGS_UPDATE': {
      return {
        ...state,
        ...p.items
      }
    }
    default:
      return state
  }
}

export default exportSettingsReducer
