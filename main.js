import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';

let scene, camera, renderer;
let gui, gui_x, gui_y, gui_z;
let axisHelper, axisHelper_absolute = null;
let duck = null;

const arm_position = {
  x: 0.0
};

const euler_angle = {
  x: 0.0,
  y: 0.0,
  z: 0.0,
  type: 'XYZ',
  reset: function(){
    this.x = 0.0; this.y = 0.0; this.z = 0.0;
    gui_x.updateDisplay();
    gui_y.updateDisplay();
    gui_z.updateDisplay();
  },
  gimbal_lock: function() {
    this.reset();
    if (this.type[1] == 'X') {
      this.x = 90;
    } else if (this.type[1] == 'Y') {
      this.y = 90;
    } else if (this.type[1] == 'Z') {
      this.z = 90;
    }
    gui_x.updateDisplay();
    gui_y.updateDisplay();
    gui_z.updateDisplay();
  }
};


let arm, deck;
let load_done = false;
function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.z = 10;
  camera.position.set(-10, -20, 20);

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshNormalMaterial();

  axisHelper = new THREE.AxesHelper(5);
  scene.add(axisHelper);

  axisHelper_absolute = new THREE.AxesHelper(1);
  scene.add(axisHelper_absolute);

  const loader = new GLTFLoader();
  loader.load(
    './asset/ardea0.05_separate.glb',
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(0.01, 0.01, 0.01);
      arm = model.getObjectByName('Ardea_Arm');
      deck = model.getObjectByName('Ardea_Deck');
      model.traverse((child) => {console.log(child.name)});
      duck = gltf.scene;
      scene.add(gltf.scene);
      load_done = true;
    },
    undefined,
    (error) => console.error(error)
  );

  const light = new THREE.AmbientLight(0xFFFFFF, 1.0);
  scene.add(light);
  const directional_light = new THREE.DirectionalLight(0xFFFFFF, 1);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  const gridhelper = new THREE.GridHelper(100, 10);
  scene.add(gridhelper);

  const controls = new OrbitControls(camera, renderer.domElement);

  // lil-gui による GUI
  gui = new GUI();
  const euler_angle_folder = gui.addFolder('Euler Angle');
  gui_x = euler_angle_folder.add(euler_angle, 'x', -180, 180).name('Rotate X');
  gui_y = euler_angle_folder.add(euler_angle, 'y', -180, 180).name('Rotate Y');
  gui_z = euler_angle_folder.add(euler_angle, 'z', -180, 180).name('Rotate Z');
  euler_angle_folder.add(euler_angle, 'type', ['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX']);
  euler_angle_folder.add(euler_angle, 'gimbal_lock').name('Gimbal Lock');
  euler_angle_folder.add(euler_angle, 'reset').name('Reset');

  const arm_folder = gui.addFolder('Arm Position');
  const arm_x = arm_folder.add(arm_position, 'x', -200, 400).name('Arm Position');

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const x_rad = euler_angle.x * Math.PI / 180;
  const y_rad = euler_angle.y * Math.PI / 180;
  const z_rad = euler_angle.z * Math.PI / 180;
  const r = new THREE.Euler(x_rad, y_rad, z_rad, euler_angle.type);
  if (duck != null) {
    duck.rotation.copy(r);
  }
  axisHelper.rotation.copy(r);
  if (load_done == true) {
    arm.position.x = arm_position.x;
  }

  renderer.render(scene, camera);
}

init();
