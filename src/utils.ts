
import * as THREE from 'three';

export const STATUS_LABELS: Record<number, string> = {
  0: 'Not connected',
  1: 'Idle',
  2: 'Running',
  3: 'Error',
};

export const STATUS_CLASSES: Record<number, string> = {
  1: 'status-idle',
  2: 'status-running',
  3: 'status-error',
};

export function statusLabel(status: number | string | null | undefined): string {
  if (status == null || status === '') return '';
  const n = Number(status);
  return STATUS_LABELS[n] ?? String(status);
}

export function statusClass(status: number | string | null | undefined): string {
  if (status == null || status === '') return '';
  return STATUS_CLASSES[Number(status)] ?? '';
}

export function placeNextTo(prev: THREE.Object3D, next: THREE.Object3D, gap = 0) {
  prev.updateWorldMatrix(true, true);
  next.updateWorldMatrix(true, true);
  const prevBox = new THREE.Box3().setFromObject(prev);
  const nextBox = new THREE.Box3().setFromObject(next);
  const shiftX = (prevBox.max.x + gap) - nextBox.min.x;
  next.position.x += shiftX;
  next.updateWorldMatrix(true,true);
}

export function angleDiff(a: number, b: number) {
  const TWO_PI = Math.PI * 2;
  let d = (a - b) % TWO_PI;
  if (d >  Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

type ReplaceOptions = {
  keepMap? : boolean;
  keepAlpha? : boolean
};
export function replaceWithLambertKeepColor(root: THREE.Object3D, { keepMap = false, keepAlpha = true }: ReplaceOptions = {}) {
  root.traverse((o: THREE.Object3D) => {
    if (!(o instanceof THREE.Mesh)) return;

    const toLambert = (mat: THREE.Material) => {
      const matAny = mat as THREE.Material & {
          color?: THREE.Color;
          map?: THREE.Texture;
          opacity?: number;
          transparent?: boolean;
          alphaMap?: THREE.Texture;
          side?: THREE.Side;
      };
      // 退避（後で元に戻したい場合用）
      o.userData._origMaterial ??= [];
      o.userData._origMaterial.push(mat);

      const params: THREE.MeshLambertMaterialParameters = {};

      // 色を継承（必須）
      if (matAny.color) params.color = matAny.color.clone();
      else params.color = new THREE.Color(0x808080); // 色が無い場合のデフォ

      // 任意：ベースカラーテクスチャを継承
      if (keepMap && mat && matAny.map) params.map = matAny.map;

      // 任意：透明度系を継承
      if (keepAlpha && mat) {
        if (mat.transparent) params.transparent = true;
        if (typeof mat.opacity === 'number') params.opacity = mat.opacity;
        if (matAny.alphaMap) params.alphaMap = matAny.alphaMap;
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