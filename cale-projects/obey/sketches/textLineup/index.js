const THREE = require('three')

class TextLineup {

  constructor() {

    var nameStrings = [
      'nidia',
      'jerico',
      'benjamin',
      'dj fadzwa'
    ];

    this.names = [];
    this.geometries = [];
    this.materials = [];

    this.root = new THREE.Group()
    this.group = new THREE.Group()
    this.group.scale.set(100, 100, 100);
    this.root.add(this.group)

    var loader = new THREE.FontLoader();

    loader.load('D:\\Personal\\hedron\\hedron\\cale-projects\\obey\\fonts\\helvetiker_regular.typeface.json', (font) => {
      for (var i = 0; i < nameStrings.length; i++) {
        var g = new THREE.TextGeometry(nameStrings[i], {
          size: 1,
          height: 1,
          font: font,
          style: 'normal',
          weight: 'normal'
        });
        this.geometries.push(g);
        var mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color("#ffffff"),
          transparent: true,
          opacity: .7
        });
        this.materials.push(mat);
        var m = new THREE.Mesh(g, mat);
        this.group.add(m);
        this.names.push(m);
      }

    });
    this.colorPhase = 0;
    this.invert = false;
  }

  lerp(v0, v1, t) {
    return (1 - t) * v0 + t * v1;
  }

  invertFirst() {
    console.log("First");
    this.invert = !this.invert;
  }

  update(params, time, delta, allParams) {
    if (this.names.length == 0) //font not laoded yet
      return;

    for (var i = 0; i < this.names.length; i++) {
      this.names[i].position.set(params.xStep * i, params.yStep * i, params.zStep * i);
    }
    this.group.position.set(params.xPos, params.yPos, params.zPos);

  }

}

module.exports = TextLineup
