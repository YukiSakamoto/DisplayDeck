import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';

let scene, camera, renderer;
let gui, gui_x, gui_y, gui_z;
let axisHelper;
let ambient_light;
let directional_light;
let duck = null;

const display_settings = {
  show_grid_helper: true,
  ambient_light_intensity: 0.4,
  directional_light_intensity: 1.0,
  directional_light_position_x: 1.0,
  directional_light_position_y: 2.0,
  directional_light_position_z: 3.0,
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

const left_visibility = {
  left_1: true,
  left_2: true,
  left_3: true
};
const right_visibility = {
  right_1: true,
  right_2: true,
  right_3: true
};
const arm_visibility = {
  arm: true,
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

const deckGroup = new THREE.Group();

const left_obj = [];
const right_obj = [];
const arm_obj = [];

function replaceWithLambertKeepColor(root, { keepMap = false, keepAlpha = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;

    const toLambert = (mat) => {
      // 退避（後で元に戻したい場合用）
      o.userData._origMaterial ??= [];
      o.userData._origMaterial.push(mat);

      const params = {};

      // 色を継承（必須）
      if (mat && mat.color) params.color = mat.color.clone();
      else params.color = new THREE.Color(0x808080); // 色が無い場合のデフォ

      // 任意：ベースカラーテクスチャを継承
      if (keepMap && mat && mat.map) params.map = mat.map;

      // 任意：透明度系を継承
      if (keepAlpha && mat) {
        if (mat.transparent) params.transparent = true;
        if (typeof mat.opacity === 'number') params.opacity = mat.opacity;
        if (mat.alphaMap) params.alphaMap = mat.alphaMap;
      }

      // 裏面表示設定なども継承しておくと画が崩れにくい
      params.side = (mat && mat.side != null) ? mat.side : THREE.FrontSide;

      return new THREE.MeshLambertMaterial(params);
    };

    if (Array.isArray(o.material)) {
      o.material = o.material.map(toLambert);
    } else {
      o.material = toLambert(o.material);
    }

    o.material.needsUpdate = true;
  });
}

// 元に戻す（退避しておいたマテリアルに戻す）
function restoreOriginalMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.userData._origMaterial) return;

    const restoreOne = (idx) => {
      const orig = o.userData._origMaterial[idx];
      if (Array.isArray(o.material)) {
        o.material[idx]?.dispose?.(); // いまのLambertを破棄
        o.material[idx] = orig;
      } else {
        o.material?.dispose?.();
        o.material = orig;
      }
    };

    if (Array.isArray(o.material)) {
      for (let i = 0; i < o.material.length; i++) restoreOne(i);
    } else {
      restoreOne(0);
    }

    o.material.needsUpdate = true;
    delete o.userData._origMaterial;
  });
}

function init_model2() {
  const loader = new GLTFLoader();
  loader.load(
    './asset/Ardea_Lightweight.named.glb',
    (gltf) => {
      const model = gltf.scene;
      scene.add(model);
      model.scale.set(10, 10, 10);
      const left_name_list = ['Left-1', 'Left-2', 'Left-3'];
      const right_name_list = ['Right-1', 'Right-2', 'Right-3'];
      left_name_list.forEach((name, index) => {
        let obj = model.getObjectByName(name);
        scene.attach(obj);
        left_obj.push(obj);
        //deckGroup.add(obj);

      });
      right_name_list.forEach((name, index) => {
        let obj = model.getObjectByName(name);
        scene.attach(obj);
        right_obj.push(obj);
        //deckGroup.add(obj);
      });
      {
        let obj = model.getObjectByName('Arm');
        scene.attach(obj);
        arm_obj.push(obj);
        //deckGroup.add(obj);
      }
      
      scene.remove(model);
      scene.add(deckGroup);
      //replaceAllWithBasic(scene);
      //replaceAllWithBasicKeepColorMap(scene);
      replaceWithLambertKeepColor(scene, {keepMap: false, keepAlpha: false});
      load_done = true;
    },
    undefined,
    (error) => console.error(error)
  );
};

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

  init_model2();

  ambient_light = new THREE.AmbientLight(0xFFFFFF, display_settings.ambient_light_intensity);
  scene.add(ambient_light);
  directional_light = new THREE.DirectionalLight(0xFFFFFF, display_settings.directional_light_intensity);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  grid_helper = new THREE.GridHelper(100, 10);
  scene.add(grid_helper);

  const controls = new OrbitControls(camera, renderer.domElement);

  // lil-gui による GUI
  gui = new GUI();
  gui.add(display_settings, 'show_grid_helper');
  gui.add(display_settings, 'ambient_light_intensity', 0.0, 5.0);
  gui.add(display_settings, 'directional_light_intensity', 0.0, 100.0);
  gui.add(display_settings, 'directional_light_position_x', -5.0, 5.0);
  gui.add(display_settings, 'directional_light_position_y', -5.0, 5.0);
  gui.add(display_settings, 'directional_light_position_z', -5.0, 5.0);

  const left_visibility_folder = gui.addFolder('LeftVisibility');
  left_visibility_folder.add(left_visibility, 'left_1');
  left_visibility_folder.add(left_visibility, 'left_2');
  left_visibility_folder.add(left_visibility, 'left_3');

  const right_visibility_folder = gui.addFolder('RightVisibility');
  right_visibility_folder.add(right_visibility, 'right_1');
  right_visibility_folder.add(right_visibility, 'right_2');
  right_visibility_folder.add(right_visibility, 'right_3');

  const arm_visibility_folder = gui.addFolder('Arm');
  arm_visibility_folder.add(arm_visibility, 'arm');

  const arm_folder = gui.addFolder('Arm Position');
  const arm_x = arm_folder.add(arm_position, 'x', -5, 30).name('Arm Position');
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const x_rad = euler_angle.x * Math.PI / 180;
  const y_rad = euler_angle.y * Math.PI / 180;
  const z_rad = euler_angle.z * Math.PI / 180;
  const r = new THREE.Euler(x_rad, y_rad, z_rad, euler_angle.type);
  ambient_light.intensity = display_settings.ambient_light_intensity;
  directional_light.intensity = display_settings.directional_light_intensity;
  directional_light.position.set(
    display_settings.directional_light_position_x,
    display_settings.directional_light_position_y,
    display_settings.directional_light_position_z,
  );

  grid_helper.visible = display_settings.show_grid_helper;
  if (load_done == true) {
    left_obj[0].visible = left_visibility.left_1;
    left_obj[1].visible = left_visibility.left_2;
    left_obj[2].visible = left_visibility.left_3;
    right_obj[0].visible = right_visibility.right_1;
    right_obj[1].visible = right_visibility.right_2;
    right_obj[2].visible = right_visibility.right_3;
    arm_obj[0].visible = arm_visibility.arm;

    arm_obj[0].position.x = arm_position.x;

    if (mousemoved_flag) {
      raycaster.setFromCamera(pointer, camera);
      //const intersects = raycaster.intersectObjects(scene.children);
      const intersects = raycaster.intersectObjects(deckGroup.children);
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
