/** HEDRON TIP **
  The config.js defines how the sketch file is used by Hedron.
**/

module.exports = {
  // Default title when sketch is loaded in (can be changed by user)
  defaultTitle: 'worleyWorld',
  // Params are values between 0 and 1 that can be manipulated by the user
  // these values are sent to the sketch every frame
  // e.g. Speed, scale, colour
  params: [
    {
      key: 'xPos', // needs to be unique
      defaultValue: .5,
      min: -.05,
      max: .05
    },
    {
      key: 'yPos',
      defaultValue: .5,
      min: -.05,
      max: .05
    },
    {
      key: 'zPos',
      defaultValue: .5,
      min: -.05,
      max: .05
    },
    {
      key: 'yRot', // needs to be unique
      defaultValue: .5,
      min: -.1,
      max: .1
    },
    {
      key: 'yLook',
      defaultValue: .5,
      min: -2,
      max: 2
    },
    {
      key: 'm0', // needs to be unique
      defaultValue: .5,
      min: 0,
      max: 1
    },
    {
      key: 'm1',
      defaultValue: .5,
      min: 0,
      max: 1
    },
    {
      key: 'm2',
      defaultValue: .5,
      min: 0,
      max: 1
    },
    {
      key: 'm3',
      defaultValue: .5,
      min: 0,
      max: 1
    },
    {
      key: 'opacity',
      defaultValue: .5,
      min: 0,
      max: 1
    }
  ],
  // Shots are single functions that can fire, as opposed to values that change
  // e.g. Explosions, Pre-defined animations
  shots: [
    {
      method: 'mirrorX', // needs to be unique
      title: 'mirror X' // should be human
    },
    {
      method: 'mirrorXInvert', // needs to be unique
      title: 'mirror X Invert' // should be human
    },
    {
      method: 'mirrorXNone', // needs to be unique
      title: 'no mirror X' // should be human
    }
  ]
}
