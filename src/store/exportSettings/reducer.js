const defaultState = {
  gifWidth: 1920,
  gifHeight: 1080,
  gifBPM: 120,
  gifFPS: 30,
  gifBeats: 4,
  gifWarmup: 0,
  gifGenerate: 1,
  gifName: 'gifName',
  gifPath: '~/gif',
}

const exportSettingsReducer = (state = defaultState, action) => {
  const p = action.payload

  switch (action.type) {
    case 'EXPORT_SETTINGS_UPDATE': {
      return {
        ...state,
        ...p.items,
      }
    }
    default:
      return state
  }
}

export default exportSettingsReducer
