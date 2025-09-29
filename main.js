import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';
import { placeNextTo,angleDiff, replaceWithLambertKeepColor } from './utils.js'
import { 
  reg, init_lighting, init_raycaster, init_helper,
  init_collider, point_collider,
 } from './setupModel.js'

const display_settings = {
  show_grid_helper: true,
  ambient_light_intensity: 0.4,
  directional_light_intensity: 1.0,
  directional_light_position_x: 1.0,
  directional_light_position_y: 2.0,
  directional_light_position_z: 3.0,

};

let need_initialize = false;
const init_settings = {
  additional_deck: 1,
  initialize() {
    need_initialize = true;
  },
};

const deck_visibility_settings = new Map();
const deck_settings = new Map();
const equipment_position_settings = new Map();

function init_gui(equipment_list) {
    function makeAdapter(key, selMap, onChange) {
      const ensure = () => selMap.get(key) ?? (selMap.set(key, {side: 'left', index: 0}), selMap.get(key));
      return {
        get side() { return ensure().side; },
        set side(v) {
          const cur = ensure(); 
          const next = { ...cur, side: v};
          selMap.set(key, next); onChange(next);
        },
        get index() { return ensure().index;},
        set index(v) {
          const cur = ensure();
          const next = {...cur, index: (v|0)};
          selMap.set(key, next); onChange(next);
        },
      };
    }
    const gui_obj = new GUI();
    gui_obj.add(display_settings, 'show_grid_helper');
    const gui_light_folder = gui_obj.addFolder('Light Settings');
    gui_light_folder.add(display_settings, 'ambient_light_intensity', 0.0, 5.0);
    gui_light_folder.add(display_settings, 'directional_light_intensity', 0.0, 100.0);
    gui_light_folder.add(display_settings, 'directional_light_position_x', -5.0, 5.0);
    gui_light_folder.add(display_settings, 'directional_light_position_y', -5.0, 5.0);
    gui_light_folder.add(display_settings, 'directional_light_position_z', -5.0, 5.0);

    const init_gui_folder = gui_obj.addFolder('Initialize');
    init_gui_folder.add(init_settings, 'additional_deck', 0, 3, 1);
    init_gui_folder.add(init_settings, 'initialize');

    const deck_folder = gui_obj.addFolder('Visibility');
    const params = {};
    for (const  [key, val] of deck_visibility_settings) {
        params[key] = val;
        deck_folder.add(params, key).onChange((v) => {
            deck_visibility_settings.set(key, v);
        });
    };

    const equipment_position_folder = gui_obj.addFolder('equipment position');
    for (const [key, val] of equipment_position_settings) {
      const obj_folder = equipment_position_folder.addFolder(key);
      const adapter = makeAdapter(key, equipment_position_settings, (entry) => {
        place_equipments(ctx, key, entry.side, entry.index);
      })
      obj_folder.add(adapter, 'side', ['left', 'right']).name('Side')
      obj_folder.add(adapter, 'index', 0, 18, 1).name('Index')
    };
    return gui_obj;
};


function createCtx() {
  // scene
  const scene = new THREE.Scene();
  //camera
  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.z = 10;
  camera.position.set(-10, -20, 20);
  // renderer
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  // handler
  //ambient_light
  const ambient_light = new THREE.AmbientLight(0xFFFFFF, display_settings.ambient_light_intensity);
  scene.add(ambient_light);
  // directional light
  const directional_light = new THREE.DirectionalLight(0xFFFFFF, display_settings.directional_light_intensity);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  // grid_helper
  const grid_helper = new THREE.GridHelper(100, 10);
  scene.add(grid_helper);
  // orbit contols
  const controls = new OrbitControls(camera, renderer.domElement);

  return {
    scene: scene,
    camera: camera,
    renderer: renderer,
    controls: controls,
    registry: new Map(),
    model_load_done_flag: false,
    raycaster: null,
    pointer: null,
    mousemoved_flag: false,
    INTERSECTED: null,
  };
}


function init_model2(ctx, n_additional_deck = 1) {
    ctx.model_load_done_flag = false;
    const model_file = './asset/Ardea_Lightweight.named.glb';
    const obj_name_list = ['Left-1', 'Left-2', 'Left-3', 'Right-1', 'Right-2', 'Right-3', 'Arm'];
    const loader = new GLTFLoader();
    loader.load(model_file, (gltf) => {
        const model = gltf.scene;
        model.scale.set(10, 10, 10);
        const collider_group = new THREE.Group();
        const model_objects = reg.extract_and_attach_to_scene(ctx, model, obj_name_list)
        replaceWithLambertKeepColor(ctx.scene, {keepMap:false, keepAlpha:true});

        // Object clone and Layout modificaton
        let left_one = reg.get(ctx, "Left-2");
        let right_one = reg.get(ctx, "Right-2");
        for(let i = 0; i < n_additional_deck; i++) {
            const left_clone = reg.get(ctx, 'Left-2').clone();
            const right_clone = reg.get(ctx, 'Right-2').clone();
            const left_new_id = `Left-2:${i}`
            const right_new_id = `Right-2:${i}`

            reg.add(ctx, left_new_id, left_clone);
            reg.add(ctx, right_new_id, right_clone);
            model_objects.push(left_clone);
            model_objects.push(right_clone);

            placeNextTo(left_one, left_clone);
            placeNextTo(right_one, right_clone);

            left_one = left_clone;
            right_one = right_clone;
        }
        placeNextTo(left_one, reg.get(ctx, 'Left-3'));
        placeNextTo(right_one, reg.get(ctx, 'Right-3'));

        const model_group = new THREE.Group();
        reg.add(ctx, "model", model_group);
        model_objects.forEach((obj) => {
          obj.updateWorldMatrix(true, true);
          model_group.attach(obj)
        })
        const box = new THREE.Box3().setFromObject(model_group);
        const center = new THREE.Vector3();
        box.getCenter(center);
        center.y = 0;
        console.log(center);
        model_group.position.sub(center);

        ctx.model_load_done_flag = true;
    });
    obj_name_list.forEach( (name) => { deck_visibility_settings.set(name, true); });
    for(let i = 0; i < n_additional_deck; i++) {
        deck_visibility_settings.set(`Left-2:${i}`, true);
        deck_visibility_settings.set(`Right-2:${i}`, true);
    }
    deck_settings.set("arm_position", 0);
}

function init_equipments(ctx, model_file, object_id, left_right = "left", index = 0, width = 1) {
    const loader = new GLTFLoader();
    loader.load(model_file, (gltf) => {
        const model = gltf.scene;
        model.scale.set(10,10,10);
        reg.add(ctx, object_id, model);
        model.userData.initY ??= model.rotation.y;
        model.userData.rotate ??= 0;

        place_equipments(ctx, object_id, left_right, index);
    });
    equipment_position_settings.set(object_id, {side: left_right, index: index});
}

function place_equipments(ctx, object_id, left_right, index) {
  try {
    const obj = reg.get(ctx, object_id);

    const dRad = angleDiff(obj.rotation.y, obj.userData.initY || 0);
    if (left_right == 'right' && obj.userData.rotate % 2 == 1) {
      obj.rotateY(Math.PI);
      obj.userData.rotate += 1;
    } else if (left_right == 'left' && obj.userData.rotate % 2 == 0) {
      obj.rotateY(Math.PI);
      obj.userData.rotate += 1;
    }
    let z_position_modifier = 2.0;  //XXX this is dirty HACK
    const collider_group = reg.get(ctx, "Collider");
    const collider = collider_group.getObjectByName(`${left_right}-${index}`);
    const rel = new THREE.Vector3(collider.position.x, collider.position.y, collider.position.z / z_position_modifier);
    const world = rel.clone();
    collider_group.localToWorld(world);
    const parent = obj.parent ?? ctx.scene;
    parent.updateWorldMatrix(true, true);
    parent.worldToLocal(world);
    obj.position.copy(world);
    //obj.position.set(collider.position.x, collider.position.y, collider.position.z);
  } catch {
    // pass;
  }
}

let gui;
const ctx = createCtx();
setup();
gui = init_gui();

function setup(additional_deck = 1) {
  init_model2(ctx, additional_deck);
  init_helper(ctx);
  init_collider(ctx, additional_deck);
  init_raycaster(ctx);
  init_lighting(ctx, display_settings.ambient_light_intensity, display_settings.directional_light_intensity);
  init_equipments(ctx, './asset/Xpeel_v2.glb', "peeler", 'left', 2);
  init_equipments(ctx, './asset/Microplate_Centrifuge_v2.glb', "centifuge", 'right', 4);
  init_equipments(ctx, './asset/automated_thermal_cycler.glb', 'thermal_cycler', 'right', 8);
  gui = init_gui();
}

function cleanup() {
  gui.destroy();
  deck_visibility_settings.clear();
  reg.remove_all(ctx);
  need_initialize = false;
}


function animate() {
  requestAnimationFrame(animate);

  // light settings
  let ambient_light = reg.get(ctx, "light:ambient");
  ambient_light.intensity = display_settings.ambient_light_intensity;
  let directional_light = reg.get(ctx, "light:directional");
  directional_light.intensity = display_settings.directional_light_intensity;
  directional_light.position.x = display_settings.directional_light_position_x;
  directional_light.position.y = display_settings.directional_light_position_y;
  directional_light.position.z = display_settings.directional_light_position_z;

  // Reset
  if (need_initialize) {
    cleanup();
    setup(display_settings.n_additional_deck);
  }
  // Arm position
  if (ctx.model_load_done_flag === true) {
      reg.get(ctx, "Arm").position.x = deck_settings.get("arm_position");
      deck_visibility_settings.forEach((val, key) => {
          reg.get(ctx, key).visible = val;
      });
  }
  if (ctx.model_load_done_flag == true && ctx.mousemoved_flag) {
    console.log("mouse moved");
    point_collider(ctx, "Collider");
  }

  ctx.renderer.render(ctx.scene, ctx.camera);
}

animate();