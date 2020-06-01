export function wizardSettingsUpdate(items) {
  return {
    type: 'WIZARD_UPDATE',
    payload: { items },
  }
}

export function retrieveShadertoy() {
  return {
    type: 'RETRIEVE_SHADERTOY'
  }
}

export function createShadertoySketch() {
  return {
    type: 'CREATE_SHADERTOY_SKETCH'
  }
}
