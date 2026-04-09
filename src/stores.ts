import { writable } from 'svelte/store';
import type { SideAB } from './config';

export type EquipmentRow = {
  id: string;
  visible: boolean;
  side: SideAB;
  position_index: number;
  width: number;
  ip?: string;
  port?: number;
  status?: number;
};

export type ArmRow = {
  visible: boolean;
  position: number;
  ip?: string;
  port?: number;
  status?: number;
};

export type DiscoveredServer = {
  name: string;
  type: string;
  ip: string;
  port: number;
  status: number;
};

export const equipmentRows = writable<EquipmentRow[]>([]);
export const armRow = writable<ArmRow | null>(null);
export const discoveredServers = writable<DiscoveredServer[]>([]);
export const serverHealth = writable<{ text: string; ok: boolean }>({ text: '(checking...)', ok: false });
export const lastUpdate = writable<string>('None');
export const positionIndexMax = writable<number>(0);
