function getMainLine(src) {
  const lines = src.split('\n');
  const output = [];
  let mainLine = -1;
  for (let i = 0; i < lines.length; i++) {
    output.push(i+': '+ lines[i]);
    mainLine = i;
  }
  //console.log(output.join('\n'));
  return mainLine;
}

export default function mapGLErrorToISFLine(error, glsl, isf) {
  const glslMainLine = getMainLine(glsl);
  const isfMainLine = getMainLine(isf);
  const regex = /ERROR: (\d+):(\d+): (.*)/g;
  const matches = regex.exec(error.message);
  const glslErrorLine = matches[2];
  const isfErrorLine = parseInt(glslErrorLine, 10) + isfMainLine - glslMainLine;
  return isfErrorLine;
}
