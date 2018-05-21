/** HEDRON TIP **
  The config.js defines how the sketch file is used by Hedron.
**/

module.exports = {
  // Default title when sketch is loaded in (can be changed by user)
  defaultTitle: 'textLineup',
  // Params are values between 0 and 1 that can be manipulated by the user
  // these values are sent to the sketch every frame
  // e.g. Speed, scale, colour
  params: [
    {
      key: 'xPos', // needs to be unique
      defaultValue: .5,
      min: -3000,
      max: 3000
    },
    {
      key: 'yPos',
      defaultValue: .5,
      min: -3000,
      max: 3000
    },
    {
      key: 'zPos',
      defaultValue: .5,
      min: -3000,
      max: 0
    },

    {
      key: 'rotX', // needs to be unique
      defaultValue: .5,
      min: -3.1415,
      max: 3.1415
    },
    {
      key: 'rotY',
      defaultValue: .5,
      min: -3.1415,
      max: 3.1415
    },
    {
      key: 'rotZ', // needs to be unique
      defaultValue: .5,
      min: -3.1415,
      max: 3.1415
    },
    {
      key: 'xStep', // needs to be unique
      defaultValue: .5, // must be between 0 and 1
      min: -5,
      max: 5
    },
    {
      key: 'yStep',
      defaultValue: .5,
      min: -5,
      max: 5
    },
    {
      key: 'zStep',
      defaultValue: .5,
      min: -5,
      max: 5
    },
    {
      key: 'colorHue',
      defaultValue: 0.6
    },
    {
      key: 'colorSat',
      defaultValue: 0.5
    },
    {
      key: 'colorLight',
      defaultValue: 0.5
    },
    {
      key: 'thickness',
      defaultValue: 0.4,
      min: .0001,
      max: 1
    },
    {
      key: 'scale',
      defaultValue: 0.3,
      min: .0001,
      max: 3
    }

  ],
  // Shots are single functions that can fire, as opposed to values that change
  // e.g. Explosions, Pre-defined animations
  shots: [
    {
      method: 'invertFirst', // needs to be unique
      title: 'invert first' // should be human
    }
  ]
}
