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
      min: -.01,
      max: .01
    },
    {
      key: 'yPos',
      defaultValue: .5,
      min: -.01,
      max: .01
    },
    {
      key: 'zPos',
      defaultValue: .5,
      min: -.01,
      max: .01
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
