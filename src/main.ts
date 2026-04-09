import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import { placeNextTo, replaceWithLambertKeepColor } from './utils'
import {
  reg, init_lighting, init_raycaster, init_helper,
  init_collider, point_collider,
} from './setupModel'
import type { Ctx } from './setupModel';
import {
  HEALTH_POLL_MS,
  checkHealth, discoverServers, fetchTrolleyPosition,
} from './api';
import {
  ASSET_BASE,
  MODEL_SCALE, GRID_SIZE, GRID_DIVISIONS,
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, CAMERA_INITIAL_POSITION,
  display_settings, equipment_status, arm_status,
} from './config';
import type { EquipmentStatus, EquipmentStatusList } from './config';
import { place_arm, place_equipments } from './placement';
import {
  setPositionIndexMax, clearTable, clearDiscoverTable,
  refreshStatusTable, refreshTableArmPosition,
  insertControlTable, reflect_table2, init_arm,
} from './ui/table';

let need_initialize = false;
const init_settings = {
  additional_deck: 1,
  initialize() {
    need_initialize = true;
  },
};

const deck_visibility_settings: Map<string,boolean> = new Map();


function init_gui(equipment_list:EquipmentStatusList) {
    const gui_obj = new GUI();
    gui_obj.add(display_settings, 'show_grid_helper');
    const gui_light_folder = gui_obj.addFolder('Light Settings');
    gui_light_folder.add(display_settings, 'ambient_light_intensity', 0.0, 5.0)
      .onChange((v: number) => {
        const light = reg.get(ctx, 'light:ambient');
        if (light instanceof THREE.AmbientLight) light.intensity = v;
      });
    gui_light_folder.add(display_settings, 'directional_light_intensity', 0.0, 100.0)
      .onChange((v: number) => {
        const light = reg.get(ctx, 'light:directional');
        if (light instanceof THREE.DirectionalLight) light.intensity = v;
      });
    gui_light_folder.add(display_settings, 'directional_light_position_x', -5.0, 5.0)
      .onChange((v: number) => {
        const light = reg.get(ctx, 'light:directional');
        if (light instanceof THREE.DirectionalLight) light.position.x = v;
      });
    gui_light_folder.add(display_settings, 'directional_light_position_y', -5.0, 5.0)
      .onChange((v: number) => {
        const light = reg.get(ctx, 'light:directional');
        if (light instanceof THREE.DirectionalLight) light.position.y = v;
      });
    gui_light_folder.add(display_settings, 'directional_light_position_z', -5.0, 5.0)
      .onChange((v: number) => {
        const light = reg.get(ctx, 'light:directional');
        if (light instanceof THREE.DirectionalLight) light.position.z = v;
      });

    const init_gui_folder = gui_obj.addFolder('Initialize');
    init_gui_folder.add(init_settings, 'additional_deck', 0, 3, 1);
    init_gui_folder.add(init_settings, 'initialize');

    const deck_folder = gui_obj.addFolder('Visibility');
    const params: Record<string,boolean> = {};
    for (const  [key, val] of deck_visibility_settings) {
        params[key] = val;
        deck_folder.add(params, key).onChange((v: boolean) => {
            deck_visibility_settings.set(key, v);
        });
    };

    return gui_obj;
};

const threeArea = document.getElementById('three-area');
if (!threeArea) {
  throw new Error("Missing #three-area");
}
const serverHealthEl = document.getElementById('server-health');
const serverLatest = document.getElementById('update-time');

let healthPollId: number | null = null;

function updateServerHealth(text: string, ok: boolean) {
  if (!serverHealthEl) return;
  serverHealthEl.textContent = `Server: ${text}`;
  serverHealthEl.style.color = ok ? '#0a7d2a' : '#b00020';
}


async function fetchServerHealth() {
  try {
    const health = await checkHealth();
    if (!health.ok) {
      updateServerHealth(`NG (${health.status})`, false);
      return;
    }
    updateServerHealth('OK', true);

    // 機器一覧の取得
    try {
      const servers = await discoverServers();
      if (serverLatest) {
        serverLatest.textContent = `Latest: ${new Date().toLocaleString()}`;
      }
      clearDiscoverTable();
      for (const server of servers) {
        const { ip, port } = server.address;
        const exist = refreshStatusTable(ip, port, server.status);
        if (!exist) {
          reflect_table2(server.name, server.type, ip, port, server.status);
        }
      }
    } catch (e) {
      console.error('Discover failed:', e);
    }

    // アームの位置取得
    if (arm_status.sila2_uri) {
      try {
        const { ip, port } = arm_status.sila2_uri;
        const arm_position = await fetchTrolleyPosition(ip, port);
        place_arm(ctx, true, arm_position);
        refreshTableArmPosition(ip, port, arm_position);
      } catch (e) {
        console.error('Trolley position failed:', e);
      }
    }
  } catch {
    updateServerHealth('NG (network)', false);
  }
}

function startServerHealthPolling() {
  if (!serverHealthEl || healthPollId !== null) return;
  fetchServerHealth().catch(() => {
    updateServerHealth('NG (network)', false);
  });
  healthPollId = window.setInterval(() => {
    fetchServerHealth().catch(() => {
      updateServerHealth('NG (network)', false);
    });
  }, HEALTH_POLL_MS);
}


function createCtx(): Ctx
{
  // scene
  const scene = new THREE.Scene();
  if (!threeArea) {
    throw new Error("Missing #three-area");
  }
  
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV, threeArea.clientWidth / threeArea.clientHeight, CAMERA_NEAR, CAMERA_FAR
  );
  camera.position.set(CAMERA_INITIAL_POSITION.x, CAMERA_INITIAL_POSITION.y, CAMERA_INITIAL_POSITION.z);
  // renderer
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(threeArea.clientWidth, threeArea.clientHeight);
  threeArea.appendChild(renderer.domElement);
  window.addEventListener('resize', () => {
    const width = threeArea.clientWidth;
    const height = threeArea.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  
  const ambient_light = new THREE.AmbientLight(0xFFFFFF, display_settings.ambient_light_intensity);
  scene.add(ambient_light);
  // directional light
  const directional_light = new THREE.DirectionalLight(0xFFFFFF, display_settings.directional_light_intensity);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  // grid_helper
  const grid_helper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
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


function init_model2(ctx: Ctx, n_additional_deck: number = 1) {
    setPositionIndexMax(6 * (3 + n_additional_deck));
    ctx.model_load_done_flag = false;
    const model_file = `${ASSET_BASE}/Ardea_Lightweight.named.glb`;
    const obj_name_list = ['Left-1', 'Left-2', 'Left-3', 'Right-1', 'Right-2', 'Right-3', 'Arm'];
    const loader = new GLTFLoader();
    loader.load(model_file, (gltf) => {
        const model = gltf.scene;
        model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
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
        model_group.position.sub(center);

        ctx.model_load_done_flag = true;
    });
    obj_name_list.forEach( (name) => { deck_visibility_settings.set(name, true); });
    for(let i = 0; i < n_additional_deck; i++) {
        deck_visibility_settings.set(`Left-2:${i}`, true);
        deck_visibility_settings.set(`Right-2:${i}`, true);
    }
}

function init_equipments(ctx:Ctx, equipment_info: EquipmentStatus ) {
  const loader = new GLTFLoader();
  const left_right = equipment_info.position.side;
  const index = equipment_info.position.position_index;
  const width = equipment_info.object_attribute.width;
  const uri = equipment_info.sila2_uri;

  loader.load(equipment_info.object_attribute.file, (gltf) => {
    const model = gltf.scene;
    model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    model.userData.initY ??= model.rotation.y;
    model.userData.rotate ??= 0;
    model.userData.object_attribute = equipment_info.object_attribute;
    reg.add(ctx, equipment_info.id, model);
    // モデルを配置する
    place_equipments(ctx, equipment_info.id, left_right, index);
  });
  // 画面下部の登録に表示する。
  insertControlTable(ctx, equipment_info.id, true, left_right, index, width, uri);
}




let gui: GUI;
const ctx = createCtx();
setup();
startServerHealthPolling();

function setup(additional_deck: number = 1) {
  // まずはArdeaのモデルをセットアップする
  init_model2(ctx, additional_deck);
  init_helper(ctx);
  // 天板を直接選ぶのが難しいので、天板にコライダー（衝突判定用のオブジェクト）を作る
  init_collider(ctx, additional_deck);
  init_raycaster(ctx);
  init_lighting(ctx, display_settings.ambient_light_intensity, display_settings.directional_light_intensity);

  // 実験機器のセットアップ
  for (let i = 0; i < equipment_status.length; i++) {
    init_equipments(ctx, equipment_status[i]);
  }
  init_arm(ctx);
  // 右上のGUIのセットアップ
  gui = init_gui(equipment_status);
}

function cleanup() {
  gui.destroy();
  deck_visibility_settings.clear();
  reg.remove_all(ctx);
  clearTable();
  need_initialize = false;
}


function animate() {
  requestAnimationFrame(animate);

  // Reset
  if (need_initialize) {
    cleanup();
    setup(init_settings.additional_deck);
  }
  if (ctx.model_load_done_flag == true && ctx.mousemoved_flag) {
    point_collider(ctx, "Collider");
  }

  ctx.renderer.render(ctx.scene, ctx.camera);
}

animate();
