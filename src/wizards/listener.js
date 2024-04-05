import getSketchesPath from '../selectors/getSketchesPath'
import path from 'path'
import { wizardSettingsUpdate } from './actions';
let fs = require('fs')

const processShadertoy = (store, json) => {
  console.log(json);
  const current = store.getState().shadertoy;
  store.dispatch(wizardSettingsUpdate({
    shadertoy: {
      renderpass: json.renderpass,
      id: json.info.id,
      author: json.info.username,
      name: json.info.name,
      tags: json.info.tags,
      description: json.info.description,
      isPost: current ? current.isPost : true,
      iTimeIsGlobalTime: current ? current.iTimeIsGlobalTime : true,
      params: [],
    }
  }))
  console.log(store.getState());
}

const retrieveShadertoy = (action, store) => {
  const settings = store.getState().wizards;

  console.log(settings.shadertoyID);

  if (settings.shadertoyID) {
    fetch(`https://www.shadertoy.com/api/v1/shaders/${settings.shadertoyID}?key=ftnKMH`)
      .then(response => response.json())
      .then((json) => {
        console.log(json)
        processShadertoy(store, json.Shader);
      })
      .catch((error) => {
        console.error(error)
      })
  }
}

const createSketch = (action, store) => {
  var wizard = store.getState().wizards;
  var shadertoy = wizard.shadertoy;
  console.log(wizard);
  var config = {
    defaultTitle: shadertoy.name,
    author: shadertoy.author,
    source: `https://www.shadertoy.com/api/v1/shaders/${shadertoy.id}?key=ftnKMH`,
    tags: shadertoy.tags,
    description: shadertoy.description,
    params: shadertoy.params,
  }

  //Add iTime as the first parameter if they don't want to use system time
  if (!shadertoy.iTimeIsGlobalTime || 1 === 1) {
    config.params.unshift({
      key: 'iTime',
      title: 'iTime',
    });
  }

  config.params.unshift({
    key: 'iMouseX',
    title: 'iMouseX',
  })
  config.params.unshift({
    key: 'iMouseY',
    title: 'iMouseY',
  })

  var savePath = path.normalize(wizard.importedSketchDirectory);
  savePath = path.join(savePath, shadertoy.name);

  // Create directory if it does not exist
  if (!fs.existsSync(savePath)) {
    fs.mkdirSync(savePath, { recursive: true })
  }
  console.log(savePath);

  fs.writeFileSync(path.join(savePath, 'config.js'), `module.exports = ${JSON.stringify(config, null, '\t')}`, (e) => { if (e) window.console.log(e); })

  let baseShader = fs.readFileSync('src/wizards/shader.glsl', 'utf8');
  let baseSketch;
  if (wizard.isPost)
    baseSketch = fs.readFileSync('src/wizards/postSketch.js', 'utf8');
  else
    baseSketch = fs.readFileSync('src/wizards/baseSketch.js', 'utf8');

  for (let i = 0; i < shadertoy.renderpass.length; i++) {
    const element = shadertoy.renderpass[i];
    console.log(element);
  }

  let shaderCode = shadertoy.renderpass[0].code;
  shaderCode = shaderCode.replace('mainImage', 'mainShadertoy');
  shaderCode = shaderCode.replace(/texture\(/g, 'texture2D(');
  shaderCode = baseShader.replace(/##SHADER##/g, shaderCode);
  fs.writeFileSync(path.join(savePath, 'frag.glsl'), shaderCode)

  var safeName = shadertoy.name.replace(/\W/g, '')
  baseSketch = baseSketch.replace(/##SHADER_NAME##/g, safeName);
  fs.writeFileSync(path.join(savePath, 'index.js'), baseSketch)

  console.log(config);
}
export default (action, store) => {
  switch (action.type) {
    case 'RETRIEVE_SHADERTOY':
      retrieveShadertoy(action, store);
      break
    case 'CREATE_SHADERTOY_SKETCH':
      createSketch(action, store);
      break
  }
}
