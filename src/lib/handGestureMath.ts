import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { NormalizedLandmark } from "@mediapipe/hands";

export type Point2D = { x: number; y: number };

export function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface FingerStates {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** A finger counts as "extended" if its tip sits noticeably farther from the wrist than its middle (PIP) joint does. Cheap, orientation-tolerant heuristic. */
function isFingerExtended(landmarks: NormalizedLandmark[], tipIdx: number, pipIdx: number): boolean {
  const wrist = landmarks[0];
  return dist(landmarks[tipIdx], wrist) > dist(landmarks[pipIdx], wrist) * 1.15;
}

export function getFingerStates(landmarks: NormalizedLandmark[]): FingerStates {
  return {
    index: isFingerExtended(landmarks, 8, 6),
    middle: isFingerExtended(landmarks, 12, 10),
    ring: isFingerExtended(landmarks, 16, 14),
    pinky: isFingerExtended(landmarks, 20, 18),
  };
}

export function isFist(f: FingerStates): boolean {
  return !f.index && !f.middle && !f.ring && !f.pinky;
}

export function isPeaceSign(f: FingerStates): boolean {
  return f.index && f.middle && !f.ring && !f.pinky;
}

/**
 * Pinch = thumb tip close to index tip, relative to the hand's own scale
 * (wrist-to-middle-knuckle distance) so it works regardless of how close the
 * hand is to the camera. Gated on `fingers` so a closed fist — whose thumb
 * also rests near the curled index — is always read as a fist first, never
 * misread as a pinch.
 */
export function isPinching(landmarks: NormalizedLandmark[], fingers: FingerStates): boolean {
  if (isFist(fingers)) return false;
  const handSize = dist(landmarks[0], landmarks[9]) || 0.1;
  const pinchDist = dist(landmarks[4], landmarks[8]);
  return pinchDist < handSize * 0.35;
}

// Standard 21-point MediaPipe hand landmark skeleton edges, used to draw the overlay.
export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // pinky + palm
];

// --- landmark smoothing ---

export type HandLabel = "Left" | "Right";

// Lower = smoother but laggier, higher = snappier but jumpier.
const LANDMARK_SMOOTHING = 0.4;

export function smoothLandmarkList(prev: NormalizedLandmark[] | null, next: NormalizedLandmark[]): NormalizedLandmark[] {
  if (!prev || prev.length !== next.length) {
    return next.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
  }
  return next.map((p, i) => ({
    x: prev[i].x + (p.x - prev[i].x) * LANDMARK_SMOOTHING,
    y: prev[i].y + (p.y - prev[i].y) * LANDMARK_SMOOTHING,
    z: (prev[i].z ?? 0) + ((p.z ?? 0) - (prev[i].z ?? 0)) * LANDMARK_SMOOTHING,
  }));
}

// Small per-frame deltas below this are treated as noise rather than intentional movement.
export const ZOOM_DEADZONE = 0.002;
export const PAN_DEADZONE = 0.0015;
export const ROTATE_DEADZONE = 0.0015;

export const ZOOM_SENSITIVITY = 6;
export const PAN_SENSITIVITY = 1.6;
export const ROTATE_SENSITIVITY = 6;

export function zoomCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  distanceDelta: number,
  minDistance: number,
  maxDistance: number
) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = offset.length();
  const scale = 1 - distanceDelta * ZOOM_SENSITIVITY;
  const newDistance = THREE.MathUtils.clamp(distance * scale, minDistance, maxDistance);
  offset.setLength(newDistance);
  camera.position.copy(controls.target).add(offset);
}

export function panCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, dx: number, dy: number) {
  camera.updateMatrixWorld();
  const distance = camera.position.distanceTo(controls.target);
  const panSpeed = distance * PAN_SENSITIVITY;

  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

  const panOffset = new THREE.Vector3();
  panOffset.addScaledVector(right, -dx * panSpeed);
  panOffset.addScaledVector(up, dy * panSpeed);

  camera.position.add(panOffset);
  controls.target.add(panOffset);
}

export function rotateCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, dx: number, dy: number) {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= dx * ROTATE_SENSITIVITY;
  spherical.phi -= dy * ROTATE_SENSITIVITY;

  const EPS = 0.001;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, EPS, Math.PI - EPS);

  const newOffset = new THREE.Vector3().setFromSpherical(spherical);
  camera.position.copy(controls.target).add(newOffset);
}
