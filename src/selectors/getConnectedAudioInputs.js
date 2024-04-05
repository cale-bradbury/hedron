export default (state) =>
    state.audio.connectedDeviceIds.map(id => state.audio.devices[id])
