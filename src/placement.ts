import * as THREE from 'three';
import { reg } from './setupModel';
import type { Ctx } from './setupModel';
import { ARM_X_OFFSET } from './config';
import type { SideAB } from './config';

export function place_arm(ctx: Ctx, visible: boolean, index: number) {
  try {
    const arm_obj = reg.get(ctx, "Arm");
    if (visible == false) {
      arm_obj.visible = false;
      return;
    }
    index = Number(index);
    const collider_group = reg.get(ctx, "Collider");
    const collider = collider_group.getObjectByName(`A-${index}`);
    if (!collider) return;
    arm_obj.position.x = collider.position.x + ARM_X_OFFSET;
  } catch {
    // pass
  }
}

export function place_equipments(ctx: Ctx, object_id: string, left_right: SideAB, index: number, visible: boolean = true) {
  try {
    const obj = reg.get(ctx, object_id);
    if (visible == false) {
      obj.visible = false;
      return;
    } else {
      obj.visible = true;
    }
    const width = obj.userData.object_attribute.width ?? 1;
    index = Number(index);
    if (left_right == 'B' && obj.userData.rotate % 2 == 1) {
      obj.rotateY(Math.PI); // left
      obj.userData.rotate += 1;
    } else if (left_right == 'A' && obj.userData.rotate % 2 == 0) {
      obj.rotateY(Math.PI); // right
      obj.userData.rotate += 1;
    }

    let offset_z = obj.userData.object_attribute.offset_z ?? 0;
    let offset_x = obj.userData.object_attribute.offset_x ?? 0;
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
      x_pos = (x_pos + collider2.position.x) / 2;
    }
    const rel = new THREE.Vector3(x_pos + offset_x, collider.position.y, collider.position.z + offset_z);
    const world = rel.clone();
    collider_group.localToWorld(world);
    const parent = obj.parent ?? ctx.scene;
    parent.updateWorldMatrix(true, true);
    parent.worldToLocal(world);
    obj.position.copy(world);
  } catch {
    // pass
  }
}
