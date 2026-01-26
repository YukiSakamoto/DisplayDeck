import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type Ctx = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  registry: Map<string, THREE.Object3D>;
  model_load_done_flag: boolean;
  raycaster: THREE.Raycaster | null;
  pointer: THREE.Vector2 | null;
  mousemoved_flag: boolean;
  INTERSECTED: THREE.Mesh | null;
};

export const reg = {
    /**
     * register object and add it to Scene
     * @param {*} ctx
     * @param {string} id   一意なID（"box/main" のような階層名推奨）
     * @param {THREE.Object3D} obj
     */
    add(ctx:Ctx, id: string, obj: THREE.Object3D) {
        if (ctx.registry.has(id)) {
            throw new Error(`Duplicate id : ${id}`);
        }
        obj.userData.id = id;
        ctx.registry.set(id, obj);
        ctx.scene.add(obj);
    },
    attach(ctx: Ctx, id: string, obj: THREE.Object3D) {
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
    get(ctx: Ctx, id: string) {
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
    all(ctx: Ctx, predicate?: (o:THREE.Object3D)=>boolean) {
        const arr = Array.from(ctx.registry.values());
        return predicate ? arr.filter(predicate) : arr;
    },
    /**
     * Scene から除去し、レジストリからも削除
     * （disposeは用途に応じて別途ユーティリティで）
     * @param {*} ctx
     * @param {string} id
     */
    remove(ctx:Ctx, id:string) {
        const obj = this.get(ctx, id);
        ctx.scene.remove(obj);
        ctx.registry.delete(id);
    },

    remove_all(ctx:Ctx) {
      //ctx.registry.keys((key) => {
      //  console.log(key);
      //  this.remove(ctx, key);
      //})
      for (const id of Array.from(ctx.registry.keys())) {
        this.remove(ctx, id);  // ← scene.remove + registry.delete を一元処理
      }
    },

    extract_and_attach_to_scene(ctx:Ctx, parent_model: THREE.Object3D, extract_name_list: string[]) {
        const picked: THREE.Object3D[] = []
        ctx.scene.add(parent_model);
        extract_name_list.forEach(name => {
            let obj = parent_model.getObjectByName(name);
            if (!obj) {return;}
            this.attach(ctx, name, obj);
            picked.push(obj);
        });
        ctx.scene.remove(parent_model);

        return picked;
    },
};

export function init_lighting(ctx:Ctx, ambient_light_intensity:number, directional_light_intensity:number) {
    const ambient_light = new THREE.AmbientLight(0xFFFFFF, ambient_light_intensity);
    const directional_light = new THREE.DirectionalLight(0xFFFFFF, directional_light_intensity);
    directional_light.position.set(1, 2, 3);
    reg.add(ctx, "light:ambient", ambient_light);
    reg.add(ctx, "light:directional", directional_light);
}

export function init_raycaster(ctx:Ctx) {
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  ctx.raycaster = raycaster;
  ctx.pointer = pointer;
  function onPointerMove(event:PointerEvent) {
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    if (!ctx.pointer){
      throw new Error("ctx pointer is not asigned");
    }
    ctx.pointer.x =  ( (event.clientX - rect.left) / rect.width) * 2 - 1;
    ctx.pointer.y = -( (event.clientY - rect.top) / rect.height) * 2 + 1;
    ctx.mousemoved_flag = true;
  }
  window.addEventListener('pointermove', onPointerMove);
}

export function init_helper(ctx:Ctx) {
  const axisHelper = new THREE.AxesHelper(5);
  reg.add(ctx, "helper:axis", axisHelper);
}

export function init_collider(ctx:Ctx, n_additional_deck = 1) {
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
      top_panel_mesh.name = `${i == 0 ? "A":"B"}-${j}`;
      top_panel_mesh.scale.set(dx, top_panel[i].height, top_panel[i].depth);
      top_panel_mesh.userData.index = j;
      collider_group.add(top_panel_mesh);
      x += dx;
    }
  }
  let collider_box = new THREE.Box3().setFromObject(collider_group);
  let center = new THREE.Vector3();
  collider_box.getCenter(center);
  center.y = 0;
  collider_group.position.sub(center);
  collider_group.updateWorldMatrix(true, true);
  reg.add(ctx, "Collider", collider_group);
}

type HighlightMesh = THREE.Mesh & {
  userData: THREE.Mesh['userData'] & { store_color?: THREE.Color };
};

function getColorMaterial(
  mesh: THREE.Mesh
): (THREE.Material & { color: THREE.Color; opacity: number }) | null {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat && 'color' in mat && typeof (mat as any).opacity === 'number') {
    return mat as THREE.Material & { color: THREE.Color; opacity: number };
  }
  return null;
}

export function point_collider(ctx: Ctx, scene_id: string) {
  if (!ctx.raycaster || !ctx.pointer) return;
  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const intersects = ctx.raycaster.intersectObjects(reg.get(ctx, scene_id).children);
  const hit = intersects[0]?.object;

  if (hit instanceof THREE.Mesh) {
    const mesh = hit as HighlightMesh;
    const mat = getColorMaterial(mesh);
    if (!mat) return;

    if (ctx.INTERSECTED && ctx.INTERSECTED !== mesh) {
      const prev = ctx.INTERSECTED as HighlightMesh;
      const prevMat = getColorMaterial(prev);
      if (prevMat && prev.userData.store_color) {
        prevMat.color.set(prev.userData.store_color);
      }
      if (prevMat) prevMat.opacity = 0;
    }

    if (ctx.INTERSECTED !== mesh) {
      ctx.INTERSECTED = mesh;
      mesh.userData.store_color = mat.color.clone();
      mat.color.set(0xff0000);
      mat.opacity = 0.3;
    }
  } else if (ctx.INTERSECTED) {
    const prev = ctx.INTERSECTED as HighlightMesh;
    const prevMat = getColorMaterial(prev);
    if (prevMat && prev.userData.store_color) {
      prevMat.color.set(prev.userData.store_color);
      prevMat.opacity = 0;
    }
    ctx.INTERSECTED = null;
  }

  ctx.mousemoved_flag = false;
}
