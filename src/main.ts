import { mount } from 'svelte';
import { get } from 'svelte/store';
import App from './App.svelte';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import GUI from 'lil-gui';
import { placeNextTo, replaceWithLambertKeepColor, statusLabel, statusClass } from './utils'
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
  equipmentRows, armRow, discoveredServers,
  serverHealth, lastUpdate, positionIndexMax,
} from './stores';

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

// --- CSS2DRenderer (ステータスラベルのオーバーレイ) ---
const css2dRenderer = new CSS2DRenderer();
css2dRenderer.setSize(threeArea.clientWidth, threeArea.clientHeight);
css2dRenderer.domElement.style.position = 'absolute';
css2dRenderer.domElement.style.top = '0';
css2dRenderer.domElement.style.left = '0';
css2dRenderer.domElement.style.pointerEvents = 'none';
threeArea.appendChild(css2dRenderer.domElement);

const labelDivs = new Map<string, HTMLDivElement>();

function createEquipmentLabel(id: string, object: THREE.Object3D): void {
  const div = document.createElement('div');
  div.className = 'object-label';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'label-name';
  nameSpan.textContent = id;

  const statusSpan = document.createElement('span');
  statusSpan.className = 'label-status';
  statusSpan.textContent = 'Unknown';

  div.appendChild(nameSpan);
  div.appendChild(statusSpan);
  labelDivs.set(id, div);

  const label = new CSS2DObject(div);

  // オブジェクトのワールド空間バウンディングボックスの上端にラベルを配置
  object.updateWorldMatrix(true, true);
  const worldBox = new THREE.Box3().setFromObject(object);
  const labelWorldPos = new THREE.Vector3(
    (worldBox.min.x + worldBox.max.x) / 2,
    worldBox.max.y + 3.0,
    (worldBox.min.z + worldBox.max.z) / 2,
  );
  label.position.copy(object.worldToLocal(labelWorldPos));

  object.add(label);
}

function updateLabel(id: string, status: number | string | null | undefined): void {
  const div = labelDivs.get(id);
  if (!div) return;
  const text = statusLabel(status) || 'Unknown';
  const statusSpan = div.querySelector<HTMLElement>('.label-status');
  if (statusSpan) {
    statusSpan.textContent = text;
    statusSpan.className = `label-status ${statusClass(status)}`.trim();
  }
}

let healthPollId: number | null = null;

async function fetchServerHealth() {
  try {
    const health = await checkHealth();
    if (!health.ok) {
      serverHealth.set({ text: `NG (${health.status})`, ok: false });
      return;
    }
    serverHealth.set({ text: 'OK', ok: true });

    // 機器一覧の取得
    try {
      const servers = await discoverServers();
      lastUpdate.set(new Date().toLocaleString());
      discoveredServers.set([]);

      const currentRows = get(equipmentRows);
      const currentArm = get(armRow);

      for (const server of servers) {
        const { ip, port } = server.address;
        const addrStr = `${ip}:${port}`;

        // 登録済み機器のステータスを更新
        const inEquipments = currentRows.some(r => `${r.ip}:${r.port}` === addrStr);
        const inArm = currentArm?.ip != null && `${currentArm.ip}:${currentArm.port}` === addrStr;

        if (inEquipments) {
          equipmentRows.update(rows =>
            rows.map(r => `${r.ip}:${r.port}` === addrStr ? { ...r, status: server.status } : r)
          );
        } else if (inArm) {
          armRow.update(r => r ? { ...r, status: server.status } : r);
        } else {
          // 未登録サーバーはdiscoverテーブルへ
          discoveredServers.update(list => [
            ...list,
            { name: server.name, type: server.type, ip, port, status: server.status },
          ]);
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
        armRow.update(r => r ? { ...r, position: arm_position } : r);
      } catch (e) {
        console.error('Trolley position failed:', e);
      }
    }
  } catch {
    serverHealth.set({ text: 'NG (network)', ok: false });
  }
}

function startServerHealthPolling() {
  if (healthPollId !== null) return;
  fetchServerHealth().catch(() => {
    serverHealth.set({ text: 'NG (network)', ok: false });
  });
  healthPollId = window.setInterval(() => {
    fetchServerHealth().catch(() => {
      serverHealth.set({ text: 'NG (network)', ok: false });
    });
  }, HEALTH_POLL_MS);
}


function createCtx(): Ctx
{
  const scene = new THREE.Scene();
  if (!threeArea) {
    throw new Error("Missing #three-area");
  }

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV, threeArea.clientWidth / threeArea.clientHeight, CAMERA_NEAR, CAMERA_FAR
  );
  camera.position.set(CAMERA_INITIAL_POSITION.x, CAMERA_INITIAL_POSITION.y, CAMERA_INITIAL_POSITION.z);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(threeArea.clientWidth, threeArea.clientHeight);
  threeArea.appendChild(renderer.domElement);
  window.addEventListener('resize', () => {
    const width = threeArea.clientWidth;
    const height = threeArea.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    css2dRenderer.setSize(width, height);
  });

  const ambient_light = new THREE.AmbientLight(0xFFFFFF, display_settings.ambient_light_intensity);
  scene.add(ambient_light);
  const directional_light = new THREE.DirectionalLight(0xFFFFFF, display_settings.directional_light_intensity);
  directional_light.position.set(1, 2, 3);
  scene.add(directional_light);
  const grid_helper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS);
  scene.add(grid_helper);
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
    positionIndexMax.set(6 * (3 + n_additional_deck));
    ctx.model_load_done_flag = false;
    const model_file = `${ASSET_BASE}/Ardea_Lightweight.named.glb`;
    const obj_name_list = ['Left-1', 'Left-2', 'Left-3', 'Right-1', 'Right-2', 'Right-3', 'Arm'];
    const loader = new GLTFLoader();
    loader.load(model_file, (gltf) => {
        const model = gltf.scene;
        model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
        const model_objects = reg.extract_and_attach_to_scene(ctx, model, obj_name_list)
        replaceWithLambertKeepColor(ctx.scene, {keepMap:false, keepAlpha:true});

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

        // Arm ラベル（最終位置確定後に生成）
        createEquipmentLabel('Arm', reg.get(ctx, 'Arm'));

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
    place_equipments(ctx, equipment_info.id, left_right, index);
    createEquipmentLabel(equipment_info.id, model);
  });

  equipmentRows.update(rows => [
    ...rows,
    {
      id: equipment_info.id,
      visible: true,
      side: left_right,
      position_index: index,
      width,
      ip: uri?.ip,
      port: uri?.port,
    },
  ]);
}


let gui: GUI;
const ctx = createCtx();

const controlArea = document.getElementById('control-area');
if (controlArea) {
  controlArea.innerHTML = '';
  mount(App, { target: controlArea, props: { ctx } });
}

setup();
startServerHealthPolling();

// store の status 変化をラベルに反映
equipmentRows.subscribe(rows => {
  rows.forEach(row => updateLabel(row.id, row.status));
});
armRow.subscribe(arm => {
  if (arm) updateLabel('Arm', arm.status);
});

function setup(additional_deck: number = 1) {
  init_model2(ctx, additional_deck);
  init_helper(ctx);
  init_collider(ctx, additional_deck);
  init_raycaster(ctx);
  init_lighting(ctx, display_settings.ambient_light_intensity, display_settings.directional_light_intensity);

  for (let i = 0; i < equipment_status.length; i++) {
    init_equipments(ctx, equipment_status[i]);
  }

  // アームの行をstoreに追加
  armRow.set({
    visible: true,
    position: arm_status.position.position_index,
    ip: arm_status.sila2_uri?.ip,
    port: arm_status.sila2_uri?.port,
  });

  gui = init_gui(equipment_status);
}

function cleanup() {
  gui.destroy();
  deck_visibility_settings.clear();
  labelDivs.forEach(div => div.remove());
  labelDivs.clear();
  reg.remove_all(ctx);
  equipmentRows.set([]);
  armRow.set(null);
  discoveredServers.set([]);
  need_initialize = false;
}


function animate() {
  requestAnimationFrame(animate);

  if (need_initialize) {
    cleanup();
    setup(init_settings.additional_deck);
  }
  if (ctx.model_load_done_flag == true && ctx.mousemoved_flag) {
    point_collider(ctx, "Collider");
  }

  ctx.renderer.render(ctx.scene, ctx.camera);
  css2dRenderer.render(ctx.scene, ctx.camera);
}

animate();
