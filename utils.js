
import * as THREE from 'three';

export function placeNextTo(prev, next, gap = 0) {
  prev.updateWorldMatrix(true, true);
  next.updateWorldMatrix(true, true);
  const prevBox = new THREE.Box3().setFromObject(prev);
  const nextBox = new THREE.Box3().setFromObject(next);
  const shiftX = (prevBox.max.x + gap) - nextBox.min.x;
  next.position.x += shiftX;
  next.updateWorldMatrix(true,true);
}

export function angleDiff(a, b) {
  const TWO_PI = Math.PI * 2;
  let d = (a - b) % TWO_PI;
  if (d >  Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

export function replaceWithLambertKeepColor(root, { keepMap = false, keepAlpha = true } = {}) {
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