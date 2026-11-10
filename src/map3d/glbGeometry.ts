import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  glbMarkerLodCount,
  glbMarkerModelUrl,
  glbMarkerYawAlign,
  isGlbMarkerModel,
} from "@/lib/modelCatalog";
import type { PrimitiveType } from "@/lib/types";
import { publicUrl } from "@/lib/publicUrl";

const loader = new GLTFLoader();
const prototypeCache = new Map<string, Promise<THREE.BufferGeometry>>();

/**
 * Keep positions only. Imported materials, UVs, and vertex colors are
 * discarded — including aircraft liveries — so the playground
 * MeshPhysicalMaterial is the only surface.
 */
function positionOnly(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  if (!position) {
    throw new Error("GLB mesh is missing position attribute");
  }
  const clean = new THREE.BufferGeometry();
  clean.setAttribute("position", position.clone());
  if (source !== geometry) source.dispose();
  return clean;
}

/** Translate and scale that grounds `geometry` and makes its longest axis 1. */
function unitGroundMatrix(geometry: THREE.BufferGeometry): THREE.Matrix4 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const matrix = new THREE.Matrix4();
  if (!box) return matrix;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const translation = new THREE.Matrix4().makeTranslation(
    -center.x,
    -box.min.y,
    -center.z,
  );
  const scale = new THREE.Matrix4().makeScale(
    1 / maxDim,
    1 / maxDim,
    1 / maxDim,
  );
  return scale.multiply(translation);
}

function finalizeGrounded(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): void {
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  const seated = geometry.boundingBox;
  if (seated) geometry.translate(0, -seated.min.y, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/** Center on XZ, sit on y=0, and normalize the longest axis to 1. */
function normalizeUnitGrounded(geometry: THREE.BufferGeometry): void {
  finalizeGrounded(geometry, unitGroundMatrix(geometry));
}

/**
 * Ground every level with the detailed mesh's size so a coarser LOD does not
 * grow to fill the unit box after its wingtips disappear.
 */
export function groundMarkerLods(
  sources: readonly THREE.BufferGeometry[],
): THREE.BufferGeometry[] {
  if (!sources.length) return [];
  const matrix = unitGroundMatrix(sources[0]!);
  return sources.map((source) => {
    const geometry = source.clone();
    finalizeGrounded(geometry, matrix);
    return geometry;
  });
}

function geometriesFromScene(scene: THREE.Object3D): THREE.BufferGeometry[] {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const prepared = positionOnly(mesh.geometry);
    prepared.applyMatrix4(mesh.matrixWorld);
    parts.push(prepared);
  });
  return parts;
}

function mergedSceneGeometry(
  scene: THREE.Object3D,
  yawAlign = 0,
): THREE.BufferGeometry {
  const parts = geometriesFromScene(scene);
  if (!parts.length) {
    throw new Error("No meshes found in model");
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) {
    throw new Error("Failed to merge model meshes");
  }
  if (yawAlign) merged.rotateY(yawAlign);
  return merged;
}

/** Merge a GLB scene into one grounded unit mesh with imported materials removed. */
export function markerGeometryFromScene(
  scene: THREE.Object3D,
  yawAlign = 0,
): THREE.BufferGeometry {
  const merged = mergedSceneGeometry(scene, yawAlign);
  normalizeUnitGrounded(merged);
  return merged;
}

async function loadPrototype(
  url: string,
  yawAlign: number,
): Promise<THREE.BufferGeometry> {
  const cacheKey = `${url}@${yawAlign}`;
  const cached = prototypeCache.get(cacheKey);
  if (cached) return cached;

  const pending = new Promise<THREE.BufferGeometry>((resolve, reject) => {
    loader.load(
      publicUrl(url),
      (gltf) => {
        try {
          resolve(mergedSceneGeometry(gltf.scene, yawAlign));
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => reject(error),
    );
  });

  prototypeCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    prototypeCache.delete(cacheKey);
    throw error;
  }
}

/** Returns a disposable clone of the cached unit marker geometry. */
export async function loadMarkerModelGeometry(
  id: PrimitiveType,
): Promise<THREE.BufferGeometry> {
  const levels = await loadMarkerModelLods(id);
  const detailed = levels[0];
  if (!detailed) {
    throw new Error(`Model "${id}" did not produce a mesh`);
  }
  for (let i = 1; i < levels.length; i++) levels[i]?.dispose();
  return detailed;
}

/**
 * Authored LOD chain, finest first. Levels share the detailed mesh's scale.
 * Models without extra LODs return a one-element list.
 */
export async function loadMarkerModelLods(
  id: PrimitiveType,
): Promise<THREE.BufferGeometry[]> {
  if (!isGlbMarkerModel(id)) {
    throw new Error(`Model "${id}" is not a GLB marker asset`);
  }
  const yaw = glbMarkerYawAlign(id);
  const count = glbMarkerLodCount(id);
  const prototypes = await Promise.all(
    Array.from({ length: count }, (_, level) =>
      loadPrototype(glbMarkerModelUrl(id, level), yaw),
    ),
  );
  return groundMarkerLods(prototypes);
}
