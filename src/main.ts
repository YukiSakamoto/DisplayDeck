import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
//import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
//import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';
import { placeNextTo,angleDiff, replaceWithLambertKeepColor } from './utils'
import {
  reg, init_lighting, init_raycaster, init_helper,
  init_collider, point_collider,
} from './setupModel'
import type { Ctx } from './setupModel';

const ASSET_BASE = `${import.meta.env.BASE_URL}asset/`;

type DisplaySettings = {
  show_grid_helper: boolean;
  ambient_light_intensity: number;
  directional_light_intensity: number;
  directional_light_position_x: number;
  directional_light_position_y: number;
  directional_light_position_z: number;
};

const display_settings: DisplaySettings = {
  show_grid_helper: true,
  ambient_light_intensity: 0.4,
  directional_light_intensity: 1.0,
  directional_light_position_x: 1.0,
  directional_light_position_y: 2.0,
  directional_light_position_z: 3.0,
};

type SideLR = 'left' | 'right';
type SideAB = 'A' | 'B';
function side_lr2AB(side: string): SideAB | null
{
  let lowercase = side.toLowerCase();
  if ("Left".toLowerCase() === lowercase) {
    return "A";
  } else if ("Right".toLowerCase() === lowercase) {
    return "B";
  }
  return null;
}
function side_AB2lr(side: string): SideLR | null
{
  let lowercase = side.toLowerCase();
  if ("A".toLowerCase() === lowercase) {
    return "left";
  } else if ("B".toLowerCase() === lowercase) {
    return "right";
  }
  return null;
}

type EquipmentPosition = {
  side: SideAB;
  position_index: number;
};
type EquipmentObjectAttribute = {
  file: string;
  width: number;
  offset_x? : number;
  offset_z? : number;
};
type EquipmentSila2Uri = {
  ip: string;
  port: number;
};
type EquipmentStatus = {
  id: string;
  object_attribute: EquipmentObjectAttribute;
  position: EquipmentPosition;
  sila2_uri?: EquipmentSila2Uri;
}
type EquipmentStatusList = EquipmentStatus[];
const equipment_status: EquipmentStatusList = [
  { 
    id: "peeler", 
    object_attribute: {file: `${ASSET_BASE}/Xpeel_v2.glb`, width: 2, offset_x: 0, offset_z: 2},
    position: {  side: "A", position_index: 5,  },
    sila2_uri: {ip: "100.84.15.10", port: 8080}
  },
  { 
    id: "centrifuge", 
    object_attribute: {file: `${ASSET_BASE}/Microplate_Centrifuge_v2.glb`, width: 2, offset_z: 3},
    position: { side: "B", position_index: 6},
  },
  {
    id: "thermal_cycler", 
    object_attribute: {file: `${ASSET_BASE}/automated_thermal_cycler.glb`, width: 1, offset_z: 2 },
    position: { side: "A", position_index: 8},
  },
  {
    id: "sealer", 
    object_attribute: {file: `${ASSET_BASE}/275-HS4T00-00.glb`, width: 1, offset_z: 2},
    position: {side: "B", position_index: 12},
  }
];


let need_initialize = false;
const init_settings = {
  additional_deck: 1,
  initialize() {
    need_initialize = true;
  },
};

const deck_visibility_settings: Map<string,boolean> = new Map();
const deck_settings = new Map();
const equipment_position_settings = new Map();

function insertControlTable(object_name: string, visible: boolean, lr: SideAB, index: number, width: number) {
  // テーブルが操作された時に、モデルの位置を反映する
  const reflect_position = function(elem: Event) {
    // この行の中のすべての要素を取得する。
    const select = elem.currentTarget as HTMLSelectElement;
    if (!(select instanceof HTMLSelectElement)) return;
    const currentRow = select.closest('tr');
    if (currentRow) {
      console.log(currentRow);
      const objectName = currentRow.cells[0].textContent;
      //console.log(objectName);
      let visible = null;
      const visible_checkbox = currentRow.cells[1].querySelector<HTMLInputElement>('input[type="checkbox"]');
      console.log(visible_checkbox);
      if (visible_checkbox) {
        visible = visible_checkbox.checked;
      }
      const lr_dropdown = currentRow.cells[2].querySelector('select');
      let lr_value: SideAB|null = null;
      if (lr_dropdown) {
        const v = lr_dropdown.value;
        if (v === 'A' || v === 'B') {
          lr_value = v;
        }
      }
      const index_dropdown = currentRow.cells[3].querySelector('select');
      let index_value: number | null = null;
      if (index_dropdown) {
        const parsed = Number(index_dropdown.value);
        if (!Number.isNaN(parsed)) {
          index_value = parsed;
        }
      }
      console.log(`CurrentRow: ${objectName} ${visible} ${lr_value} ${index_value}`);
      if (visible != null && lr_value != null && index_value != null) {
        place_equipments(ctx, objectName, lr_value, index_value, visible);

        // 一元化したテーブルの方を書き換える
        for(let i = 0; i < equipment_status.length; i++) {
          if(equipment_status[i].id == objectName) {
            if (lr_value === 'A' || lr_value === 'B') {
              equipment_status[i].position.side = lr_value;
            }
            equipment_status[i].position.position_index = index_value;
          }
        }
        console.log(equipment_status);
      }
    }
  };

  if (!tableBody) return;
  const row = tableBody.insertRow();
  row.dataset.objectIndex = String(0);

  row.insertCell().textContent = object_name;
  // 表示・非表示のチェックボックスのセル
  const visibilityCell = row.insertCell();
  const visibilityInput = document.createElement('input');
  visibilityInput.type = 'checkbox';
  visibilityInput.checked = visible;
  visibilityInput.addEventListener('change', (e) => {
    reflect_position(e);
  })
  visibilityCell.appendChild(visibilityInput);

  // Left/Rightのドロップボックスのセル
  const lrCell = row.insertCell();
  const lrSelect = document.createElement('select');
  const lr_options = [
    {name: 'A', value: 'A'},
    {name: 'B', value: 'B'},
  ];
  let i = 0;
  lr_options.forEach(options => {
    // 新しいオプション（ドロップダウン内の1要素）
    const opt = document.createElement('option');
    // 新しいオプションのvalueとして、lr_optionsの中のvalueの値を保存しておく
    opt.value = options.value;
    opt.textContent = options.name;
    if (options.value == lr) {
      opt.selected = true;
    }
    lrSelect.appendChild(opt);
  });
  lrSelect.addEventListener('change', (e) => { reflect_position(e);});
  lrCell.appendChild(lrSelect);

  // 板の中での位置の数字を選択するところ
  const posCell = row.insertCell();
  const posSelect = document.createElement('select');
  for(let i = 0; i < 18; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i}`;
    if (i == index) {
      opt.selected = true;
    }
    posSelect.appendChild(opt);
  }
  // 機器の幅（区画何枚分を取るか）
  const widthCell = row.insertCell();
  widthCell.textContent = String(width);
  posSelect.addEventListener('change', (e) => { reflect_position(e); });
  posCell.appendChild(posSelect);
}

function init_gui(equipment_list:EquipmentStatusList) {
    //function makeAdapter(key, selMap, onChange) {
    //  const ensure = () => selMap.get(key) ?? (selMap.set(key, {side: 'left', index: 0}), selMap.get(key));
    //  return {
    //    get side() { return ensure().side; },
    //    set side(v) {
    //      const cur = ensure(); 
    //      const next = { ...cur, side: v};
    //      selMap.set(key, next); onChange(next);
    //    },
    //    get index() { return ensure().index;},
    //    set index(v) {
    //      const cur = ensure();
    //      const next = {...cur, index: (v|0)};
    //      selMap.set(key, next); onChange(next);
    //    },
    //  };
    //}
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
    const params: Record<string,boolean> = {};
    for (const  [key, val] of deck_visibility_settings) {
        params[key] = val;
        deck_folder.add(params, key).onChange((v: boolean) => {
            deck_visibility_settings.set(key, v);
        });
    };

    return gui_obj;
};

const objects = [];
const threeArea = document.getElementById('three-area');
if (!threeArea) {
  throw new Error("Missing #three-area");
}
const tableBody = document.querySelector<HTMLTableSectionElement>('#object-control-table tbody');
const tableBody2 = document.querySelector<HTMLTableSectionElement>('#object-control-table2 tbody');
const serverHealthEl = document.getElementById('server-health');
const serverLatest = document.getElementById('update-time');

const HEALTH_ENDPOINT = 'http://localhost:8000/health';
const HEALTH_POLL_MS = 60_000;
let healthPollId: number | null = null;
const DISCOVER_ENDPOINT = 'http://localhost:8000/sila/discover';
const DISCOVER_POLL_MS = 60_000;
let discoverPollID: number | null = null;

function updateServerHealth(text: string, ok: boolean) {
  if (!serverHealthEl) return;
  serverHealthEl.textContent = `Server: ${text}`;
  serverHealthEl.style.color = ok ? '#0a7d2a' : '#b00020';
}

function reflect_table2(server_name: string, type: string, address: string, port: number, status: number) {
  if (!tableBody2) return;
  const row = tableBody2.insertRow();
  row.dataset.objectIndex = String(0);
  // name
  row.insertCell().textContent = server_name;
  // visible
  row.insertCell();
  // type
  row.insertCell().textContent = type;
  // address
  row.insertCell().textContent = address;
  // port
  row.insertCell().textContent = String(port);
  //status
  row.insertCell().textContent = String(status);
}

async function fetchServerHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
    if (res.ok) { // 生存確認OK
      updateServerHealth('OK', true);
      fetch(DISCOVER_ENDPOINT, {cache: 'no-store'})
        .then((res2) => {
          if (!res2.ok) {
            throw new Error(`Discover HTTP ${res2.status}`);
          } 
          return res2.json();
        })
        .then(data => {
          //console.log(data);
          if (serverLatest) {
            serverLatest.textContent = `Latest: ${new Date().toLocaleString()}`;
          }
          if (tableBody2) {
            tableBody2.replaceChildren();
          }
          for(let i = 0; i < data["servers"].length; i++) {
            let server_data = data["servers"][i]
            let address = server_data["address"]["ip"];
            let port = server_data["address"]["port"];
            console.log(data["servers"][i]);
            reflect_table2(
              data["servers"][i]["name"],
              data["servers"][i]["type"],
              address,
              port,
              data["servers"][i]["status"]
            );
          }
        })
    } else {
      updateServerHealth(`NG (${res.status})`, false);
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
    75, threeArea.clientWidth / threeArea.clientHeight, 0.1, 1000
  );
  camera.position.z = 10;
  camera.position.set(-10, -20, 20);
  // renderer
  const renderer = new THREE.WebGLRenderer();
  //renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setSize(threeArea.clientWidth, threeArea.clientHeight);
  //document.body.appendChild(renderer.domElement);
  threeArea.appendChild(renderer.domElement);
  window.addEventListener('resize', () => {
    const width = threeArea.clientWidth;
    const height = threeArea.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  
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


function init_model2(ctx: Ctx, n_additional_deck: number = 1) {
    ctx.model_load_done_flag = false;
    const model_file = `${ASSET_BASE}/Ardea_Lightweight.named.glb`;
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

function init_equipments(ctx:Ctx, equipment_info: EquipmentStatus ) {
  const loader = new GLTFLoader();
  const left_right = equipment_info.position.side;
  const index = equipment_info.position.position_index;
  const width = equipment_info.object_attribute.width;

  console.log(equipment_info);
  loader.load(equipment_info.object_attribute.file, (gltf) => {
    const model = gltf.scene;
    model.scale.set(10,10,10);
    model.userData.initY ??= model.rotation.y;
    model.userData.rotate ??= 0;
    model.userData.object_attribute = equipment_info.object_attribute;
    reg.add(ctx, equipment_info.id, model);
    // モデルを配置する
    place_equipments(ctx, equipment_info.id, left_right, index);
  });
  // 画面下部の登録に表示する。
  insertControlTable(equipment_info.id, true, left_right, index, width);
}

function place_equipments(ctx: Ctx, object_id: string, left_right: SideAB, index: number, visible: boolean = true) {
  try {
    //console.log(object_id, left_right, index, visible, width);
    const obj = reg.get(ctx, object_id);
    if (visible == false) {
      obj.visible = false;
      console.log(visible);
      return;
    } else {
      obj.visible = true;
    }
    const width = obj.userData.object_attribute.width ?? 1;
    index = Number(index);
    const dRad = angleDiff(obj.rotation.y, obj.userData.initY || 0);
    if (left_right == 'B' && obj.userData.rotate % 2 == 1) {
      obj.rotateY(Math.PI); // left
      obj.userData.rotate += 1;
    } else if (left_right == 'A' && obj.userData.rotate % 2 == 0) {
      obj.rotateY(Math.PI); // right
      obj.userData.rotate += 1;
    }

    let offset_z = obj.userData.object_attribute.offset_z ?? 0;
    let offset_x = obj.userData.object_attribute.offset_x ?? 0;
    console.log(`${object_id} placement ${offset_z} ${offset_x}`);
    if (left_right == 'A') {
      offset_z *= -1;
    }

    const collider_group = reg.get(ctx, "Collider");
    const collider = collider_group.getObjectByName(`${left_right}-${index}`);
    if (!collider) return;
    let x_pos = collider.position.x;

    if (width % 2 == 0) {
      // 位置は、原則、オブジェクトの真ん中が乗っかる板の番号。
      // もし偶数のときは、その次のパネルとの中央位置を扱う方が良い。
      const collider2 = collider_group.getObjectByName(`${left_right}-${index + 1}`);
      if (!collider2) return;
      let x_pos2 = collider2.position.x;
      x_pos = (x_pos + x_pos2) / 2;
    }
    const rel = new THREE.Vector3(x_pos + offset_x, collider.position.y, collider.position.z + offset_z);
    console.log(`position ${collider.position.x}, ${collider.position.y}, ${collider.position.z}`);
    const world = rel.clone();
    collider_group.localToWorld(world);
    const parent = obj.parent ?? ctx.scene;
    parent.updateWorldMatrix(true, true);
    parent.worldToLocal(world);
    obj.position.copy(world);
    
  } catch {
    // pass;
  }
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
  // 右上のGUIのセットアップ
  gui = init_gui(equipment_status);
}

function cleanup() {
  gui.destroy();
  deck_visibility_settings.clear();
  reg.remove_all(ctx);
  if (!tableBody){ return; }
  tableBody.innerHTML = '';
  need_initialize = false;
}


function animate() {
  requestAnimationFrame(animate);

  // light settings
  let ambient_light = reg.get(ctx, "light:ambient");
  if ( (ambient_light instanceof THREE.AmbientLight) != true ) { return; }
  ambient_light.intensity = display_settings.ambient_light_intensity;
  let directional_light = reg.get(ctx, "light:directional");
  if ((directional_light instanceof THREE.DirectionalLight) != true) { return; }
  directional_light.intensity = display_settings.directional_light_intensity;
  directional_light.position.x = display_settings.directional_light_position_x;
  directional_light.position.y = display_settings.directional_light_position_y;
  directional_light.position.z = display_settings.directional_light_position_z;

  // Reset
  if (need_initialize) {
    cleanup();
    console.log('----- initialize -----');
    setup(init_settings.additional_deck);
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
