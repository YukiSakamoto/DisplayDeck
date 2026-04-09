<script lang="ts">
  import {
    equipmentRows, armRow, discoveredServers,
    serverHealth, lastUpdate, positionIndexMax,
  } from './stores';
  import type { Ctx } from './setupModel';
  import { place_equipments, place_arm } from './placement';
  import { resetEquipment } from './api';
  import { equipment_status } from './config';
  import type { SideAB } from './config';

  let { ctx }: { ctx: Ctx } = $props();

  let expanded = $state(true);

  function toggle() {
    expanded = !expanded;
    document.getElementById('control-area')?.classList.toggle('collapsed', !expanded);
    window.dispatchEvent(new Event('resize'));
  }

  let positionOptions = $derived(
    Array.from({ length: $positionIndexMax }, (_, i) => i)
  );

  function handleEquipmentChange(id: string, visible: boolean, side: SideAB, index: number) {
    equipmentRows.update(rows =>
      rows.map(r => r.id === id ? { ...r, visible, side, position_index: index } : r)
    );
    place_equipments(ctx, id, side, index, visible);
    const eq = equipment_status.find(e => e.id === id);
    if (eq) {
      eq.position.side = side;
      eq.position.position_index = index;
    }
  }

  function handleArmChange(visible: boolean, index: number) {
    armRow.update(r => r ? { ...r, visible, position: index } : r);
    place_arm(ctx, visible, index);
  }

  async function handleReset(ip: string, port: number) {
    try {
      const result = await resetEquipment(ip, port);
      alert(result.message);
    } catch {
      alert(`Sent Reset Signal to ${ip}:${port}, but Failed`);
    }
  }
</script>

<div class="toggle-row">
  <button class="toggle-btn" onclick={toggle} title={expanded ? 'パネルを閉じる' : 'パネルを開く'}>
    {expanded ? '◀' : '▶'}
  </button>
</div>

{#if expanded}
<h2>object control</h2>
<p style="color: {$serverHealth.ok ? '#0a7d2a' : '#b00020'}">
  Server: {$serverHealth.text}
</p>

<table>
  <thead>
    <tr>
      <th>object</th>
      <th>show</th>
      <th>side</th>
      <th>index</th>
      <th>width</th>
      <th>address</th>
      <th>status</th>
      <th>reset</th>
    </tr>
  </thead>
  <tbody>
    {#each $equipmentRows as row (row.id)}
      <tr>
        <td>{row.id}</td>
        <td>
          <input
            type="checkbox"
            checked={row.visible}
            onchange={(e) => handleEquipmentChange(row.id, e.currentTarget.checked, row.side, row.position_index)}
          />
        </td>
        <td>
          <select
            value={row.side}
            onchange={(e) => handleEquipmentChange(row.id, row.visible, e.currentTarget.value as SideAB, row.position_index)}
          >
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </td>
        <td>
          <select
            value={row.position_index}
            onchange={(e) => handleEquipmentChange(row.id, row.visible, row.side, Number(e.currentTarget.value))}
          >
            {#each positionOptions as i}
              <option value={i}>{i}</option>
            {/each}
          </select>
        </td>
        <td>{row.width}</td>
        <td>{row.ip != null ? `${row.ip}:${row.port}` : ''}</td>
        <td>{row.status ?? ''}</td>
        <td>
          {#if row.ip != null}
            <button onclick={() => handleReset(row.ip!, row.port!)}>Reset</button>
          {/if}
        </td>
      </tr>
    {/each}

    {#if $armRow != null}
      {@const arm = $armRow}
      <tr>
        <td>Arm</td>
        <td>
          <input
            type="checkbox"
            checked={arm.visible}
            onchange={(e) => handleArmChange(e.currentTarget.checked, arm.position)}
          />
        </td>
        <td></td>
        <td>
          <select
            value={arm.position}
            onchange={(e) => handleArmChange(arm.visible, Number(e.currentTarget.value))}
          >
            {#each positionOptions as i}
              <option value={i}>{i}</option>
            {/each}
          </select>
        </td>
        <td></td>
        <td>{arm.ip != null ? `${arm.ip}:${arm.port}` : ''}</td>
        <td>{arm.status ?? ''}</td>
        <td>
          {#if arm.ip != null}
            <button onclick={() => handleReset(arm.ip!, arm.port!)}>Reset</button>
          {/if}
        </td>
      </tr>
    {/if}
  </tbody>
</table>

<h2>Unregistered Equipments</h2>
<p>Latest: {$lastUpdate}</p>

<table>
  <thead>
    <tr>
      <th>name</th>
      <th>display</th>
      <th>type</th>
      <th>address</th>
      <th>port</th>
      <th>status</th>
      <th>reset</th>
    </tr>
  </thead>
  <tbody>
    {#each $discoveredServers as server}
      <tr>
        <td>{server.name}</td>
        <td></td>
        <td>{server.type}</td>
        <td>{server.ip}</td>
        <td>{server.port}</td>
        <td>{server.status}</td>
        <td>
          <button onclick={() => handleReset(server.ip, server.port)}>Reset</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
{/if}

<style>
  .toggle-row {
    display: flex;
    justify-content: flex-end;
    padding: 4px;
    position: sticky;
    top: 0;
    background: inherit;
    z-index: 1;
  }
  .toggle-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
  }
</style>
