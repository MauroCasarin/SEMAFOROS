
import * as THREE from 'three';

export enum TrafficLightState {
  RED = 'RED',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
}

export enum Street {
  VERTICAL = 'VERTICAL',
  HORIZONTAL = 'HORIZONTAL',
}

export interface Car {
  mesh: THREE.Group;
  street: Street;
  lane: number; // 0 for inner lane, 1 for outer lane
  velocity: THREE.Vector3;
  raycaster: THREE.Raycaster;
  stopped: boolean;
  uuid: string;
  speed: number; // Maximum speed for this specific car
  
  // Lane changing logic
  isChangingLane: boolean;
  targetLane: number;
  laneChangeProgress: number; // 0.0 to 1.0
  laneChangeDirection: number; // 1 or -1
}
