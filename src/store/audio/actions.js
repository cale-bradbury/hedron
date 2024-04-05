export function audioUpdateDevices(devices) {
    return {
        type: 'AUDIO_UPDATE_DEVICES',
        payload: {
            devices,
        },
    }
}

export function audioSettingsUpdate(id) {
    return {
        type: 'AUDIO_SETTINGS_UPDATE',
        payload: {
            id,
        },
    }
}
