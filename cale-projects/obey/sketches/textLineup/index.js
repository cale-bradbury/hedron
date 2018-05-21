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

      var g = new THREE.TextGeometry("< next up", {
        size: 1,
        height: 1,
        font: font,
        style: 'normal',
        weight: 'normal'
      });
      var mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffffff"),
        transparent: true,
        opacity: .7
      });
      this.nextUp = new THREE.Mesh(g, mat);
      this.group.add(this.nextUp);

    });
    this.colorPhase = 0;
    this.scale = 0;
    this.selected = -1;
    this.nextUpOffset = 0;
  }

  lerp(v0, v1, t) {
    return (1 - t) * v0 + t * v1;
  }

  update(params, time, delta, allParams) {
    if (this.names.length == 0) //font not laoded yet
      return;
    var selected = Math.floor(params.selected * this.names.length * .9999);
    var smoothing = params.smoothing;
    if (this.scale != params.scale || this.selected != selected) {
      this.scale = params.scale;
      this.selected = selected;
      this.geometries[selected].computeBoundingBox();
      var size = new THREE.Vector3(0, 0, 0);
      this.geometries[selected].boundingBox.getSize(size);
      this.nextUpOffset = size.x * this.scale;
    }

    for (var i = 0; i < this.names.length; i++) {
      this.names[i].scale.set(this.scale, this.scale, params.thickness);
      var opacity = params.opacity;
      var hue = params.colorHue;
      var position = {
        x: params.xStep * i,
        y: params.yStep * i,
        z: params.zStep * i
      }
      if (i == selected) {
        opacity = params.selectedOpacity;
        position.x += params.selectedX;
        position.y += params.selectedY;
        position.z += params.selectedZ;
        hue += params.selectedHueOffset + 360;
        hue %= 360;
      }
      this.materials[i].opacity = this.lerp(this.materials[i].opacity, opacity, smoothing);
      position.x = this.lerp(this.names[i].position.x, position.x, smoothing);
      position.y = this.lerp(this.names[i].position.y, position.y, smoothing);
      position.z = this.lerp(this.names[i].position.z, position.z, smoothing);
      this.names[i].position.set(position.x, position.y, position.z);

      this.names[i].material.color.setHex(new THREE.Color("hsl(" + hue + ", " + Math.round(params.colorSat) + "%, " + Math.round(params.colorLight) + "%)").getHex());
    }
    this.group.position.set(params.xPos, params.yPos, params.zPos);
    this.group.rotation.set(params.xRot, params.yRot, params.zRot);

    this.nextUp.scale.set(params.scale * .7, params.scale * .7, params.thickness);
    this.nextUp.position.set(this.lerp(this.nextUp.position.x, this.names[selected].position.x + this.nextUpOffset + params.nextOffset, smoothing),
      this.lerp(this.nextUp.position.y, this.names[selected].position.y, smoothing),
      this.lerp(this.nextUp.position.z, this.names[selected].position.z, smoothing));
    this.nextUp.material = this.materials[selected];
    //this.nextUp.position.x += params.colorSat;

  }

}

module.exports = TextLineup
