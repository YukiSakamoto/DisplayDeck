const HEALTH_ENDPOINT = 'http://localhost:8000/health';
const RESET_ENDPOINT = 'http://localhost:8000/reset';
const DISCOVER_ENDPOINT = 'http://localhost:8000/sila/discover';
const GET_TROLLEY_POSITION_ENDPOINT = 'http://localhost:8000/sila/trolley-position';

export const HEALTH_POLL_MS = 60_000;

export type ServerInfo = {
  name: string;
  type: string;
  address: { ip: string; port: number };
  status: number;
};

export async function checkHealth(): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
  return { ok: res.ok, status: res.status };
}

export async function discoverServers(): Promise<ServerInfo[]> {
  const res = await fetch(DISCOVER_ENDPOINT, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Discover HTTP ${res.status}`);
  const data = await res.json();
  return data['servers'].map((s: any) => ({
    name: s['name'],
    type: s['type'],
    address: { ip: s['address']['ip'], port: s['address']['port'] },
    status: s['status'],
  }));
}

export async function fetchTrolleyPosition(ip: string, port: number): Promise<number> {
  const url = `${GET_TROLLEY_POSITION_ENDPOINT}?ip=${ip}&port=${port}&insecure=true`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Trolley Position ${res.status}`);
  const data = await res.json();
  return data['server']['position'];
}

export async function resetEquipment(ip: string, port: number): Promise<{ ok: boolean; message: string }> {
  const url = `${RESET_ENDPOINT}?ip=${ip}&port=${port}&insecure=true`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.ok) {
    return { ok: true, message: `Sent Reset Signal to ${ip}:${port}` };
  }
  const text = await res.text();
  return { ok: false, message: `Sent Reset Signal to ${ip}:${port}, but maybe Failed. ${text}` };
}
