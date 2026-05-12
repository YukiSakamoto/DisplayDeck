export const ASSET_BASE = `${import.meta.env.BASE_URL}asset/`;

export const MODEL_SCALE = 10;
export const ARM_X_OFFSET = -5;
export const GRID_SIZE = 100;
export const GRID_DIVISIONS = 10;

export const CAMERA_FOV = 75;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const CAMERA_INITIAL_POSITION = { x: -10, y: -20, z: 20 };

export type DisplaySettings = {
  show_grid_helper: boolean;
  ambient_light_intensity: number;
  directional_light_intensity: number;
  directional_light_position_x: number;
  directional_light_position_y: number;
  directional_light_position_z: number;
};

export const display_settings: DisplaySettings = {
  show_grid_helper: true,
  ambient_light_intensity: 0.4,
  directional_light_intensity: 1.0,
  directional_light_position_x: 1.0,
  directional_light_position_y: 2.0,
  directional_light_position_z: 3.0,
};

export type SideAB = 'A' | 'B';

export type EquipmentPosition = {
  side: SideAB;
  position_index: number;
};
export type EquipmentObjectAttribute = {
  file: string;
  width: number;
  offset_x?: number;
  offset_z?: number;
};
export type EquipmentSila2Uri = {
  ip: string;
  port: number;
};
export type EquipmentStatus = {
  id: string;
  object_attribute: EquipmentObjectAttribute;
  position: EquipmentPosition;
  sila2_uri?: EquipmentSila2Uri;
};
export type EquipmentStatusList = EquipmentStatus[];

export const equipment_status: EquipmentStatusList = [
  {
    id: "peeler",
    object_attribute: { file: `${ASSET_BASE}/Xpeel_v2.glb`, width: 2, offset_x: 0, offset_z: 0 },
    position: { side: "A", position_index: 5 },
    sila2_uri: { ip: "100.84.15.10", port: 8080 },
  },
  {
    id: "centrifuge",
    object_attribute: { file: `${ASSET_BASE}/Microplate_Centrifuge_v2.glb`, width: 2, offset_z: 0 },
    position: { side: "B", position_index: 6 },
    sila2_uri: { ip: "172.18.0.4", port: 50052 },
  },
  {
    id: "thermal_cycler",
    object_attribute: { file: `${ASSET_BASE}/automated_thermal_cycler.glb`, width: 1, offset_z: 0 },
    position: { side: "A", position_index: 8 },
    sila2_uri: { ip: "172.18.0.5", port: 50052 },
  },
  {
    id: "sealer",
    object_attribute: { file: `${ASSET_BASE}/275-HS4T00-00.glb`, width: 1, offset_z: 0 },
    position: { side: "B", position_index: 12 },
  },
  {
    id: "fluent",
    object_attribute: { file: `${ASSET_BASE}/Fluent480.glb`, width: 6, offset_z: 0 },
    position: { side: "A", position_index: 17}
  }
];

export type ArmPosition = {
  position_index: number;
};
export type ArmStatus = {
  id: string;
  position: ArmPosition;
  sila2_uri?: EquipmentSila2Uri;
};

export const arm_status: ArmStatus = {
  id: "arm-server",
  position: { position_index: 0 },
  sila2_uri: { ip: "172.18.0.6", port: 50052 },
};
