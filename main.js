import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';

let scene, camera, renderer;
let gui, gui_x, gui_y, gui_z;
let axisHelper;
let duck = null;

const display_settings = {
  show_grid_helper: true
};

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

const top_panel = [
  { x: 0, y: 8.5, z:  8.5, width: 36, height: 0.1, depth: 8.0, division: 3},
  { x: 0, y: 8.5, z: -8.5, width: 36, height: 0.1, depth: 8.0, division: 3},
];

let arm, deck;
let grid_helper;
let load_done = false;

const pointer =  new THREE.Vector2();
const raycaster = new THREE.Raycaster();
function onPointerMove(event) {
  pointer.x =  (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mousemoved_flag = true;
}
let INTERSECTED = null;
let mousemoved_flag = false;

const colliderGroup = new THREE.Group();

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

  window.addEventListener( 'pointermove', onPointerMove );

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshNormalMaterial();

  axisHelper = new THREE.AxesHelper(5);
  scene.add(axisHelper);

  const loader = new GLTFLoader();
  loader.load(
    './asset/ardea0.05_separate.glb',
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(0.01, 0.01, 0.01);
      arm = model.getObjectByName('Ardea_Arm');
      deck = model.getObjectByName('Ardea_Deck');
      duck = gltf.scene;
      scene.add(gltf.scene);
      load_done = true;
    },
    undefined,
    (error) => console.error(error)
  );

  for (let i = 0; i < top_panel.length; i++) {
    let dw = top_panel[i].width / top_panel[i].division;
    let edge_x = top_panel[i].x - top_panel[i].width/2;
    console.log(i);
    console.log(dw);
    for(let j = 0; j < top_panel[i].division; j++)  {
      let top_panel_mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1,1,1),
        new THREE.MeshBasicMaterial({transparent: true, opacity: 0})
      );
      let center_x = edge_x + dw * (j + 0.5);
      top_panel_mesh.scale.set(dw, top_panel[i].height, top_panel[i].depth);
      top_panel_mesh.position.set(center_x, top_panel[i].y, top_panel[i].z);
      colliderGroup.add(top_panel_mesh);
    }
    //let top_panel_obj1 = new THREE.Mesh(
    //  new THREE.BoxGeometry(1,1,1),
    //  new THREE.MeshBasicMaterial({transparent: true, opacity: 0})
    //)
    //top_panel_obj1.scale.set(top_panel[i].width, top_panel[i].height, top_panel[i].depth);
    //top_panel_obj1.position.set(top_panel[i].x, top_panel[i].y, top_panel[i].z);
    //top_panel_objects.add(top_panel_obj1);
    //colliderGroup.add(top_panel_obj1);
  }
  scene.add(colliderGroup);

  

  const light = new THREE.AmbientLight(0xFFFFFF, 1.0);
  scene.add(light);
  const directional_light = new THREE.DirectionalLight(0xFFFFFF, 1);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  grid_helper = new THREE.GridHelper(100, 10);
  scene.add(grid_helper);

  const controls = new OrbitControls(camera, renderer.domElement);

  // lil-gui による GUI
  gui = new GUI();
  gui.add(display_settings, 'show_grid_helper');
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

  grid_helper.visible = display_settings.show_grid_helper;
  if (load_done == true) {
    arm.position.x = arm_position.x;
    arm.rotation.copy(r);
    deck.rotation.copy(r);

    if (mousemoved_flag) {
      raycaster.setFromCamera(pointer, camera);
      //const intersects = raycaster.intersectObjects(scene.children);
      const intersects = raycaster.intersectObjects(colliderGroup.children);
      if (intersects.length > 0) {
        if (INTERSECTED != intersects[0].object) {
          if (INTERSECTED){
            INTERSECTED.material.color.set(INTERSECTED.store_color);
            INTERSECTED.material.opacity = 0;
          } 
          INTERSECTED = intersects[0].object;
          //INTERSECTED.currentHex = INTERSECTED.material.emmisive.getHex();
          INTERSECTED.store_color = INTERSECTED.material.color.clone();
          INTERSECTED.material.color.set(0xff0000);
          INTERSECTED.material.opacity = 0.3;
        }
      } else {
        if (INTERSECTED) {
          //INTERSECTED.material.emmisive.setHex(INTERSECTED.currentHex);
            INTERSECTED.material.color.set(INTERSECTED.store_color);
            INTERSECTED.material.opacity = 0;
        }
        INTERSECTED = null;
      }
      mousemoved_flag = false;
    }
  }
  renderer.render(scene, camera);
}

init();
