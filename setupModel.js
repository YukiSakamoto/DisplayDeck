import * as THREE from 'three';

export const reg = {
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

export function init_lighting(ctx, ambient_light_intensity, directional_light_intensity) {
    const ambient_light = new THREE.AmbientLight(0xFFFFFF, ambient_light_intensity);
    const directional_light = new THREE.DirectionalLight(0xFFFFFF, directional_light_intensity);
    directional_light.position.set(1, 2, 3);
    reg.add(ctx, "light:ambient", ambient_light);
    reg.add(ctx, "light:directional", directional_light);
}

export function init_raycaster(ctx) {
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

export function init_helper(ctx) {
  const axisHelper = new THREE.AxesHelper(5);
  reg.add(ctx, "helper:axis", axisHelper);
}

export function init_collider(ctx, n_additional_deck = 1) {
  const top_panel = [
    { x: 0, y: 8.5, z:  8.5, width: 36, height: 0.1, depth: 8.0, division: 3},  // left
    { x: 0, y: 8.5, z: -8.5, width: 36, height: 0.1, depth: 8.0, division: 3},  // right
  ];
  const collider_group = new THREE.Group();
  const dx = 12 / 6;
  for(let i = 0; i < top_panel.length; i++) {
    let x = dx / 2;
    for(let j = 0; j < (3+n_additional_deck) * 6; j++) {
      let top_panel_mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({transparent: false, opacity: 0})
      );
      top_panel_mesh.position.set(x, top_panel[i].y, top_panel[i].z);
      top_panel_mesh.name = `${i == 0 ? "left":"right"}-${j}`;
      top_panel_mesh.scale.set(dx, top_panel[i].height, top_panel[i].depth);
      top_panel_mesh.userData.index = j;
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
  collider_group.updateWorldMatrix(true, true);
  reg.add(ctx, "Collider", collider_group);
}

export function point_collider(ctx, scene_id) {
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