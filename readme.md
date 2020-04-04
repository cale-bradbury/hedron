# <img src='http://nudibranchrecords.github.io/hedron/title.gif' alt='Hedron' />

Perform live shows with your three.js creations.

![Hedron UI](http://nudibranchrecords.github.io/hedron/ui.gif)

## Features

- 📥 Import [three.js](https://github.com/mrdoob/three.js/) sketches on the fly
- 🎊 Compose scenes with multiple sketches
- 🔊 Control parameters using audio, MIDI and BPM based LFO
- 🕹️ Call functions using audio, MIDI and BPM based sequencer
- ⚡ Define macros to control multiple variables at once
- ⏲️ Control timing using MIDI clock input or tap the tempo
- 🎚️ Create many scenes and crossfade between them
- ✨ Apply post processing effects
- 🔍 Preview and compose scenes before displaying them to the audience
- 💡 Use MIDI Learn to quickly assign controls
- 🔥 Hot reload your sketches on code changes, without affecting the rest of the scene
- 🔧 Different UI controls based on value type (e.g. float, boolean, string)
- ⚙️ Support for multiple MIDI control modes (abs, rel1, rel2, rel3)
- 📽️ Easily send output picture to external display
- 💾 Save / load using JSON project files

## Hedron in action
[![Polyop](http://nudibranchrecords.github.io/hedron/polyop-creator.jpg)](https://vimeo.com/310779808)
[![Netgrind @ Halifax Pride](http://nudibranchrecords.github.io/hedron/netgrind-halifax-pride.jpg)](https://www.netgrindgames.com/)
[![Craig Lowe](http://nudibranchrecords.github.io/hedron/craig-lowe-euphoria.jpg)](https://www.youtube.com/watch?v=d64dCoW9Y1c)

## Getting Started

### Install
Download the latest [release](https://github.com/nudibranchrecords/hedron/releases) or
[build from source](#build-from-source).

### Load example project
1. Download the latest example projects zip from the [releases](https://github.com/nudibranchrecords/hedron/releases) page. If you've compiled from source, you'll already have the example projects, found in `/example-projects`.
2. In Hedron, choose "Load Existing Project". Select one of the project JSON files included in the example projects folder (`logo.json` is a good start!).
4. Play it some music, tap BPM, experiment with the controls
5. 👽

## User Guide
Head to the [User Guide](/docs/user-guide/index.md) to learn how to use Hedron.

## Creating Sketches
Head to the [Creating Sketches Guide](/docs/dev/index.md) to learn how to create sketches.

## Get in touch
Made something awesome in Hedron you'd like to share? Need help or have some cool ideas? Let's talk! Find Alex on Twitter: [@funtriangles](https://twitter.com/funtriangles), or email: [alex@funwithtriangles.net](mailto:https://twitter.com/funtriangles).

## Contributing to Hedron

If you are having fun with Hedron, we'd love you to help with development. See the repo [issues](https://github.com/nudibranchrecords/hedron/issues) for what needs doing. We're particularly looking for developers who know about:

- React/Redux
- three.js/WebGL
- Javascript performance
- Spout/Syphon/C++ ([related issue](https://github.com/nudibranchrecords/hedron/issues/21))
- Audio analysis ([related issue](https://github.com/nudibranchrecords/hedron/issues/8))

### How to contribute

- Fork a branch from dev
- Make changes
- Make a pull request to dev

Don't worry too much if the tests aren't passing, we can work on that together. :)

### Build From Source
Build from source for the latest features (expect bugs!). This also gives you some extra development features such as setting a default project that will always load on start.

1. Make sure [Node.js](https://nodejs.org/en/) and [Yarn](https://yarnpkg.com/en/docs/install) are installed on your machine. (_Hedron 0.6.0 has been tested with Node 12.14.1 and Yarn 1.21.1_)
2. Open terminal and run the commands below.
```bash
$ git clone https://github.com/nudibranchrecords/hedron.git
$ cd hedron
$ yarn
$ yarn start
```

`yarn start` opens the app in dev mode, you'll probably want to close the dev tools on the right hand side of the window.

Run `yarn dist` to package up the app for best performance and no dev tools. Once the build is complete, you'll find the app inside `/dist`.

**Note for Windows users:** Hedron doesn't seem to play nice inside of Windows Subsystem for Linux (WSL). So just install Node and Yarn natively and work like that. If you do get it working with WSL, please let us know via the issues!

### Dev scripts
| script | description |
|--|--|
| `yarn start` | Run in dev mode |
| `yarn dist` | Package the app |
| `yarn lint` | Run linting |
| `yarn test` | Run pre deployment tests (including linting) |
| `yarn test:dev` | Run tests on file changes (does not include linting) |

### Acknowledgements
Hedron has been created using some amazing open-source libraries. Most notably:

- [three.js](https://github.com/mrdoob/three.js/)
- [postprocessing](https://github.com/vanruesc/postprocessing)
- [React](https://github.com/facebook/react)
- [Redux](https://github.com/reduxjs/redux)

