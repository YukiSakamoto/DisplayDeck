import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

type SideAB = 'A' | 'B';

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
    sila2_uri: {ip: "172.18.0.4", port: 50052 }
  },
  {
    id: "thermal_cycler", 
    object_attribute: {file: `${ASSET_BASE}/automated_thermal_cycler.glb`, width: 1, offset_z: 2 },
    position: { side: "A", position_index: 8},
    sila2_uri: {ip:"172.18.0.5", port:50052 },
  },
  {
    id: "sealer", 
    object_attribute: {file: `${ASSET_BASE}/275-HS4T00-00.glb`, width: 1, offset_z: 2},
    position: {side: "B", position_index: 12},
  }
];

type ArmPosition = {
  position_index: number;
};
type ArmStatus = {
  id: string;
  position: ArmPosition;
  sila2_uri?: EquipmentSila2Uri;
};

const arm_status: ArmStatus = {
  id: "arm-server",
  position: {position_index: 0 },
  sila2_uri: {ip:"172.18.0.6", port: 50052},
};

let need_initialize = false;
const init_settings = {
  additional_deck: 1,
  initialize() {
    need_initialize = true;
  },
};

const deck_visibility_settings: Map<string,boolean> = new Map();

function refreshStatusTable(ip: string, port: number, health: number) {
  const ipaddress_string: string = `${ip}:${port}`;
  if (tableBody) {
    for(const row of Array.from(tableBody.rows)) {
      const addressCell = row.querySelector<HTMLTableCellElement>('td[data-col="address"]')
      if (addressCell?.textContent == ipaddress_string) {
        const statusCell = row.querySelector<HTMLTableCellElement>('td[data-col="status"]');
        if (statusCell) {
          statusCell.textContent = `${health}`;
          return true;
        }
      }
    }
  }
  return false;
}

function refreshTableArmPosition(ip: string, port: number, position: number) {
  const ipaddress_string: string = `${ip}:${port}`;
  if (tableBody) {
    for (const row of Array.from(tableBody.rows)) {
      const addressCell = row.querySelector<HTMLTableCellElement>('td[data-col="address"]')
      if (addressCell?.textContent == ipaddress_string) {
        const positionCell = row.querySelector<HTMLTableCellElement>('td[data-col="position"]');
        const positionSelect = positionCell?.querySelector<HTMLSelectElement>('select');
        if (positionSelect) {
          positionSelect.value = String(position);
        }
      }
    }
  }
}

function insertControlTable(object_name: string, visible: boolean, lr: SideAB, index: number, width: number, uri?: EquipmentSila2Uri) {
  // テーブルが操作された時に、モデルの位置を反映する
  const reflect_position = function(elem: Event) {
    // この行の中のすべての要素を取得する。
    const select = elem.currentTarget as HTMLSelectElement;
    if (!(select instanceof HTMLSelectElement)) return;
    const currentRow = select.closest('tr');
    if (currentRow) {
      const objectName = currentRow.cells[0].textContent;
      let visible = null;
      const visible_checkbox = currentRow.cells[1].querySelector<HTMLInputElement>('input[type="checkbox"]');
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
      }
    }
  };

  if (!tableBody) return;
  const row = tableBody.insertRow();
  row.dataset.objectIndex = String(0);

  // オブジェクト名
  const nameCell = row.insertCell();
  nameCell.textContent = object_name;
  nameCell.dataset.col = "name";

  // 表示・非表示のチェックボックスのセル
  const visibilityCell = row.insertCell();
  visibilityCell.dataset.col = "visibility";
  const visibilityInput = document.createElement('input');
  visibilityInput.type = 'checkbox';
  visibilityInput.checked = visible;
  visibilityInput.addEventListener('change', (e) => {
    reflect_position(e);
  })
  visibilityCell.appendChild(visibilityInput);

  // Left/Rightのドロップボックスのセル
  const lrCell = row.insertCell();
  lrCell.dataset.col = "lr";
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
  posCell.dataset.col = "position";
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
  widthCell.dataset.col = "width";
  widthCell.textContent = String(width);
  posSelect.addEventListener('change', (e) => { reflect_position(e); });
  posCell.appendChild(posSelect);

  const addressCell = row.insertCell();
  addressCell.dataset.col = "address";
  if (uri != undefined) {
    addressCell.textContent = `${uri.ip}:${uri.port}`;
  }
  // status
  const statusCell = row.insertCell();
  statusCell.dataset.col = "status";
  statusCell.dataset.role = "pending-status"; //保留中の印をつけておく
  statusCell.textContent = "";
  // reset button
  const resetbuttonCell = row.insertCell();
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', () => {
    if (uri != undefined) {
      EquipmentReset(uri.ip, uri.port);
    } 
  });
  resetbuttonCell.appendChild(resetButton);
}

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
const tableBody = document.querySelector<HTMLTableSectionElement>('#object-control-table tbody');
const tableBody2 = document.querySelector<HTMLTableSectionElement>('#object-control-table2 tbody');
const serverHealthEl = document.getElementById('server-health');
const serverLatest = document.getElementById('update-time');

const HEALTH_ENDPOINT = 'http://localhost:8000/health';
const HEALTH_POLL_MS = 60_000;
const RESET_ENDPOINT = 'http://localhost:8000/reset';
let healthPollId: number | null = null;
const DISCOVER_ENDPOINT = 'http://localhost:8000/sila/discover';
const GET_TROLLEY_POSITION_ENDPOINT = 'http://localhost:8000/sila/trolley-position';

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
  // reset button
  const resetbuttonCell = row.insertCell();
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', () => {
    if (address != undefined) {
      EquipmentReset(address, port);
    };
  })
  resetbuttonCell.appendChild(resetButton);
}

async function fetchServerHealth() {
  try {
    const res = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) {
      updateServerHealth(`NG (${res.status})`, false);
      return;
    }
    updateServerHealth('OK', true);

    // 機器一覧の取得
    try {
      const res2 = await fetch(DISCOVER_ENDPOINT, { cache: 'no-store' });
      if (!res2.ok) throw new Error(`Discover HTTP ${res2.status}`);
      const data = await res2.json();
      if (serverLatest) {
        serverLatest.textContent = `Latest: ${new Date().toLocaleString()}`;
      }
      if (tableBody2) tableBody2.replaceChildren();
      for (const server of data["servers"]) {
        const address = server["address"]["ip"];
        const port = server["address"]["port"];
        const status = server["status"];
        const exist = refreshStatusTable(address, port, status);
        if (!exist) {
          reflect_table2(server["name"], server["type"], address, port, status);
        }
      }
    } catch (e) {
      console.error('Discover failed:', e);
    }

    // アームの位置取得
    if (arm_status.sila2_uri) {
      try {
        const { ip, port } = arm_status.sila2_uri;
        const endpoint_uri = `${GET_TROLLEY_POSITION_ENDPOINT}?ip=${ip}&port=${port}&insecure=true`;
        const res_trolley = await fetch(endpoint_uri, { cache: 'no-store' });
        if (!res_trolley.ok) throw new Error(`Trolley Position ${res_trolley.status}`);
        const data = await res_trolley.json();
        const arm_position = data["server"]["position"];
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

async function EquipmentReset(ip: string, port: number) {
  try {
    const reset_uri = `${RESET_ENDPOINT}?ip=${ip}&port=${String(port)}&insecure=true`
    const res = await fetch(reset_uri, {cache: 'no-store'});
    if (res.ok) {
      alert(`Sent Reset Signal to ${ip}:${String(port)}`);
    } else {
    console.log(res);
      alert(`Sent Reset Signal to ${ip}:${String(port)}, but maybe Failed. ${await res.text()}`);
    }
  } catch {
      alert(`Sent Reset Signal to ${ip}:${String(port)}, but Failed`);
  }
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
}

function init_equipments(ctx:Ctx, equipment_info: EquipmentStatus ) {
  const loader = new GLTFLoader();
  const left_right = equipment_info.position.side;
  const index = equipment_info.position.position_index;
  const width = equipment_info.object_attribute.width;
  const uri = equipment_info.sila2_uri;

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
  insertControlTable(equipment_info.id, true, left_right, index, width, uri);
}

function place_arm(ctx: Ctx, visible: boolean, index: number) {
  try{
    const arm_obj = reg.get(ctx, "Arm");
    if (visible == false) {
      arm_obj.visible = false;
      return;
    }
    index = Number(index);
    const collider_group = reg.get(ctx, "Collider");
    const collider = collider_group.getObjectByName(`A-${index}`);
    if (!collider) return;
    let x_pos = collider.position.x - 5;  // modified position by adequate offset.
    arm_obj.position.x = x_pos;
  } catch {
    console.log("Arm not found");
  }
}

function init_arm(ctx: Ctx, equipment_info: ArmStatus) {
  const reflect_arm_position = function(elem: Event) {
    const select = elem.currentTarget as HTMLSelectElement;
    if (!(select instanceof HTMLSelectElement)) return;
    const currentRow = select.closest('tr');
    if (currentRow) {
      const objectName = currentRow.cells[0].textContent;
      let visible = true;
      const visible_checkbox = currentRow.cells[1].querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (visible_checkbox) {
        visible = visible_checkbox.checked;
      }

      const index_dropdown = currentRow.cells[3].querySelector('select');
      let index_value: number | null = null;
      if (index_dropdown) {
        const parsed = Number(index_dropdown.value);
        if (!Number.isNaN(parsed)) {
          index_value = parsed;
          place_arm(ctx, visible, index_value);
        }
      }
    }

  };
  if (!tableBody) return;
  const row = tableBody.insertRow();
  row.dataset.objectIndex = String(0);
  // オブジェクト名
  const nameCell = row.insertCell();
  nameCell.textContent = "Arm";
  nameCell.dataset.col = "name";

  const visibilityCell = row.insertCell();
  visibilityCell.dataset.col = "visibility";
  const visibilityInput = document.createElement('input');
  visibilityInput.type = 'checkbox';
  visibilityInput.checked = true;
  visibilityInput.addEventListener('change', (e) => {
    reflect_arm_position(e);
  });
  visibilityCell.appendChild(visibilityInput);

  // left or rightのカラム
  const lrCell = row.insertCell();

  // position
  const posCell = row.insertCell();
  posCell.dataset.col = "position";
  const posSelect = document.createElement('select');
  for(let i = 0; i < 18; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i}`;
    if (i == 0) {
      opt.selected = true;
    }
    posSelect.appendChild(opt);
  }
  posSelect.addEventListener('change', (e) => {reflect_arm_position(e);});
  posCell.appendChild(posSelect);
  // 機器の幅の行（空欄）
  const widthCell = row.insertCell();

  // ipアドレス
  const addressCell = row.insertCell();
  addressCell.dataset.col = "address";
  if (arm_status.sila2_uri != undefined) {
    addressCell.textContent = `${arm_status.sila2_uri.ip}:${arm_status.sila2_uri.port}`;
  }
  // status
  const statusCell = row.insertCell();
  statusCell.dataset.col = "status";
  statusCell.dataset.role = "pending-status";
  statusCell.textContent = "";
  //reset button
  const resetbuttonCell = row.insertCell();
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', () => {
    if (arm_status.sila2_uri != undefined) {
      EquipmentReset(arm_status.sila2_uri.ip, arm_status.sila2_uri.port);
    }
  })
  resetbuttonCell.appendChild(resetButton);
}

function place_equipments(ctx: Ctx, object_id: string, left_right: SideAB, index: number, visible: boolean = true) {
  try {
    //console.log(object_id, left_right, index, visible, width);
    const obj = reg.get(ctx, object_id);
    if (visible == false) {
      obj.visible = false;
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
  init_arm(ctx, arm_status);
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

  // Reset
  if (need_initialize) {
    cleanup();
    console.log('----- initialize -----');
    setup(init_settings.additional_deck);
  }
  if (ctx.model_load_done_flag == true && ctx.mousemoved_flag) {
    console.log("mouse moved");
    point_collider(ctx, "Collider");
  }

  ctx.renderer.render(ctx.scene, ctx.camera);
}

animate();
