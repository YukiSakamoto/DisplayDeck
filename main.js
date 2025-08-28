import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import GUI from 'lil-gui';

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

function placeNextTo(prev, next, gap = 0) {
  prev.updateWorldMatrix(true, true);
  next.updateWorldMatrix(true, true);
  const prevBox = new THREE.Box3().setFromObject(prev);
  const nextBox = new THREE.Box3().setFromObject(next);
  const shiftX = (prevBox.max.x + gap) - nextBox.min.x;
  next.position.x += shiftX;
  next.updateWorldMatrix(true,true);
}

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

function init_gui() {
    gui = new GUI();
    gui.add(display_settings, 'show_grid_helper');
    gui.add(display_settings, 'ambient_light_intensity', 0.0, 5.0);
    gui.add(display_settings, 'directional_light_intensity', 0.0, 100.0);
    gui.add(display_settings, 'directional_light_position_x', -5.0, 5.0);
    gui.add(display_settings, 'directional_light_position_y', -5.0, 5.0);
    gui.add(display_settings, 'directional_light_position_z', -5.0, 5.0);

    const init_gui = gui.addFolder('Initialize');
    init_gui.add(init_settings, 'additional_deck', 0, 3, 1);
    init_gui.add(init_settings, 'initialize');

    const deck = gui.addFolder('Visibility');
    const params = {};
    for (const  [key, val] of deck_visibility_settings) {
        params[key] = val;
        deck.add(params, key).onChange((v) => {
            deck_visibility_settings.set(key, v);
        });
    };
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
  //window.addEventListener( 'pointermove', onPointerMove );
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

function init_raycaster(ctx) {
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  ctx.raycaster = raycaster;
  ctx.pointer = pointer;
  function onPointerMove(event) {
    ctx.pointer.x =  (event.clientX / window.innerWidth) * 2 - 1;
    ctx.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    ctx.mousemoved_flag = true;
  }
  window.addEventListener('pointermove', onPointerMove);
}


const reg = {
    /**
     * register object and add it to Scene
     * @param {*} ctx
     * @param {string} id   一意なID（"box/main" のような階層名推奨）
     * @param {THREE.Object3D} obj
     */
    add(ctx, id, obj) {
        if (ctx.registry.has(id)) {
            throw new Error(`Duplicate id : ${id}`);
        }
        obj.userData.id = id;
        ctx.registry.set(id, obj);
        ctx.scene.add(obj);
    },
    attach(ctx, id, obj) {
        if (ctx.registry.has(id)) {
            throw new Error(`Duplicate id : ${id}`);
        }
        obj.userData.id = id;
        ctx.registry.set(id, obj);
        ctx.scene.attach(obj);
    },
    /**
     * Get registered object
     * @param {*} ctx
     * @param {string} id
     * @returns {THREE.Object3D}
     */
    get(ctx, id) {
        const obj = ctx.registry.get(id);
        if (!obj) {
            throw new Error(`Not found: ${id}`);
        }
        return obj;
    },
    /**
     * 条件に合う全オブジェクトを配列で取得（タグ絞り込みなどに）
     * @param {*} ctx
     * @param {(o:THREE.Object3D)=>boolean} [predicate]
     * @returns {THREE.Object3D[]}
     */
    all(ctx, predicate) {
        const arr = Array.from(ctx.registry.values());
        return predicate ? arr.filter(predicate) : arr;
    },
    /**
     * Scene から除去し、レジストリからも削除
     * （disposeは用途に応じて別途ユーティリティで）
     * @param {*} ctx
     * @param {string} id
     */
    remove(ctx, id) {
        const obj = this.get(ctx, id);
        ctx.scene.remove(obj);
        ctx.registry.delete(id);
    },

    remove_all(ctx) {
      //ctx.registry.keys((key) => {
      //  console.log(key);
      //  this.remove(ctx, key);
      //})
      for (const id of Array.from(ctx.registry.keys())) {
        this.remove(ctx, id);  // ← scene.remove + registry.delete を一元処理
      }
    },

    extract_and_attach_to_scene(ctx, parent_model, extract_name_list) {
        const picked = []
        ctx.scene.add(parent_model);
        extract_name_list.forEach(name => {
            let obj = parent_model.getObjectByName(name);
            this.attach(ctx, name, obj);
            picked.push(obj);
        });
        ctx.scene.remove(parent_model);

        return picked;
    },
};

function init_lighting(ctx) {
    const ambient_light = new THREE.AmbientLight(0xFFFFFF, display_settings.ambient_light_intensity);
    const directional_light = new THREE.DirectionalLight(0xFFFFFF, display_settings.directional_light_intensity);
    directional_light.position.set(1, 2, 3);
    reg.add(ctx, "light:ambient", ambient_light);
    reg.add(ctx, "light:directional", directional_light);
}

function init_helper(ctx) {
  const axisHelper = new THREE.AxesHelper(5);
  reg.add(ctx, "helper:axis", axisHelper);
}

function init_collider(ctx, n_additional_deck = 1) {
  const top_panel = [
    { x: 0, y: 8.5, z:  8.5, width: 36, height: 0.1, depth: 8.0, division: 3},
    { x: 0, y: 8.5, z: -8.5, width: 36, height: 0.1, depth: 8.0, division: 3},
  ];
  const collider_group = new THREE.Group();
  const dx = 12 / 6;
  for(let i = 0; i < top_panel.length; i++) {
    let x = dx / 2;
    for(let j = 0; j < (3+n_additional_deck) * 6; j++) {
      let top_panel_mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({transparent: true, opacity: 0})
      );
      top_panel_mesh.position.set(x, top_panel[i].y, top_panel[i].z);
      top_panel_mesh.scale.set(dx, top_panel[i].height, top_panel[i].depth);
      collider_group.add(top_panel_mesh);
      x += dx;
    }
    //top_panel_mesh.scale.set(top_panel[i].width, top_panel[i].height, top_panel[i].depth);
  }
  let collider_box = new THREE.Box3().setFromObject(collider_group);
  let center = new THREE.Vector3();
  collider_box.getCenter(center);
  center.y = 0;
  collider_group.position.sub(center);
  reg.add(ctx, "Collider", collider_group);
}

function point_collider(ctx, scene_id) {
  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const intersects = ctx.raycaster.intersectObjects(reg.get(ctx, scene_id).children);
  if (intersects.length > 0) {
    if (ctx.INTERSECTED != intersects[0].object) {
      if (ctx.INTERSECTED) {
        ctx.INTERSECTED.material.color.set(ctx.INTERSECTED.store_color);
        ctx.INTERSECTED.material.opacity = 0;
      }
      ctx.INTERSECTED = intersects[0].object;
      ctx.INTERSECTED.store_color = ctx.INTERSECTED.material.color.clone();
      ctx.INTERSECTED.material.color.set(0xff0000);
      ctx.INTERSECTED.material.opacity = 0.3;
    }
  } else {
    if (ctx.INTERSECTED) {
      ctx.INTERSECTED.material.color.set(ctx.INTERSECTED.store_color);
      ctx.INTERSECTED.material.opacity = 0;
    }
    ctx.INTERSECTED = null;
  }
  ctx.mousemoved_flag = false;
}

function setup_collider(ctx, obj, collider_group, division = 6) {
  obj.updateWorldMatrix(true, true);
  const objBox = new THREE.Box3().setFromObject(obj);
  console.log(obj);
  console.log('-----');
  console.log(objBox);
  let x_length = objBox.max.x - objBox.min.x;
  let y_length = objBox.max.y - objBox.min.y;
  let z_length = objBox.max.z - objBox.min.z;
  y_length = 0.5;

  let dx = x_length / division;
  let x_center = objBox.min.x + x_length / 2;
  let z_center = objBox.min.z + z_length / 2;
  let y_pos = objBox.max.y + 0.1;
  for(let i = 0; i < division; i++) {
    let x_pos = objBox.min.x + dx * (i + 0.5);
    let collider_mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({transparent: true, opacity: 0})
    );
    collider_mesh.scale.set(dx, y_length, z_length);
    collider_mesh.position.set(x_pos, y_pos, z_center);
    collider_group.add(collider_mesh);
  }
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
        //setup_collider(ctx, left_one, collider_group,  6);
        //setup_collider(ctx, right_one, collider_group, 6);
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

let gui;
const ctx = createCtx();
init_model2(ctx);
init_helper(ctx);
init_collider(ctx);
init_raycaster(ctx);
init_lighting(ctx);
init_gui();
console.log(ctx);

function animate() {
    requestAnimationFrame(animate);
    let ambient_light = reg.get(ctx, "light:ambient");
    ambient_light.intensity = display_settings.ambient_light_intensity;

    let directional_light = reg.get(ctx, "light:directional");
    directional_light.intensity = display_settings.directional_light_intensity;
    directional_light.position.x = display_settings.directional_light_position_x;
    directional_light.position.y = display_settings.directional_light_position_y;
    directional_light.position.z = display_settings.directional_light_position_z;

    if (need_initialize) {
      gui.destroy();
      deck_visibility_settings.clear();
      reg.remove_all(ctx);
      need_initialize = false;
      console.log('update');
      console.log('remove done');
      init_model2(ctx,init_settings.additional_deck );
      init_helper(ctx);
      init_lighting(ctx);
      init_gui();
      init_collider(ctx, init_settings.additional_deck );
    }

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