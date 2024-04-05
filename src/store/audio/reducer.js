const defaultState = {
    devices: {},
    connectedDeviceIds: [],
}

const audioReducer = (state = defaultState, action) => {
    const p = action.payload

    switch (action.type) {
        case 'AUDIO_UPDATE_DEVICES': {
            console.log('add devices')
            console.log(p.devices);
            return {
                ...state,
                devices: {
                    ...p.devices,
                },
                connectedDeviceIds: Object.keys(p.devices),
            }
        }
        default:
            return state
    }
}

export default audioReducer
