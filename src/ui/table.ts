import type { Ctx } from '../setupModel';
import { place_equipments, place_arm } from '../placement';
import { resetEquipment } from '../api';
import { equipment_status, arm_status } from '../config';
import type { SideAB, EquipmentSila2Uri, ArmStatus } from '../config';

const tableBody = document.querySelector<HTMLTableSectionElement>('#object-control-table tbody');
const tableBody2 = document.querySelector<HTMLTableSectionElement>('#object-control-table2 tbody');

let position_index_max = 0;
export function setPositionIndexMax(n: number): void {
  position_index_max = n;
}

export function clearTable(): void {
  if (tableBody) tableBody.innerHTML = '';
}

export function clearDiscoverTable(): void {
  if (tableBody2) tableBody2.replaceChildren();
}

async function EquipmentReset(ip: string, port: number) {
  try {
    const result = await resetEquipment(ip, port);
    alert(result.message);
  } catch {
    alert(`Sent Reset Signal to ${ip}:${port}, but Failed`);
  }
}

export function buildPositionSelect(selectedIndex: number, onChange: (e: Event) => void): HTMLSelectElement {
  const posSelect = document.createElement('select');
  for (let i = 0; i < position_index_max; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i}`;
    if (i === selectedIndex) opt.selected = true;
    posSelect.appendChild(opt);
  }
  posSelect.addEventListener('change', onChange);
  return posSelect;
}

export function appendResetButton(cell: HTMLTableCellElement, onClick: () => void): void {
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Reset';
  resetButton.addEventListener('click', onClick);
  cell.appendChild(resetButton);
}

export function refreshStatusTable(ip: string, port: number, health: number): boolean {
  const ipaddress_string = `${ip}:${port}`;
  if (tableBody) {
    for (const row of Array.from(tableBody.rows)) {
      const addressCell = row.querySelector<HTMLTableCellElement>('td[data-col="address"]');
      if (addressCell?.textContent == ipaddress_string) {
        const statusCell = row.querySelector<HTMLTableCellElement>('td[data-col="status"]');
        if (statusCell) {
          statusCell.textContent = `${health}`;
          return true;
        }
      }
    }
  }
  return false;
}

export function refreshTableArmPosition(ip: string, port: number, position: number): void {
  const ipaddress_string = `${ip}:${port}`;
  if (tableBody) {
    for (const row of Array.from(tableBody.rows)) {
      const addressCell = row.querySelector<HTMLTableCellElement>('td[data-col="address"]');
      if (addressCell?.textContent == ipaddress_string) {
        const positionCell = row.querySelector<HTMLTableCellElement>('td[data-col="position"]');
        const positionSelect = positionCell?.querySelector<HTMLSelectElement>('select');
        if (positionSelect) {
          positionSelect.value = String(position);
        }
      }
    }
  }
}

export function insertControlTable(ctx: Ctx, object_name: string, visible: boolean, lr: SideAB, index: number, width: number, uri?: EquipmentSila2Uri) {
  const reflect_position = function(elem: Event) {
    const select = elem.currentTarget as HTMLSelectElement;
    if (!(select instanceof HTMLSelectElement)) return;
    const currentRow = select.closest('tr');
    if (currentRow) {
      const objectName = currentRow.cells[0].textContent;
      let visible = null;
      const visible_checkbox = currentRow.cells[1].querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (visible_checkbox) {
        visible = visible_checkbox.checked;
      }
      const lr_dropdown = currentRow.cells[2].querySelector('select');
      let lr_value: SideAB | null = null;
      if (lr_dropdown) {
        const v = lr_dropdown.value;
        if (v === 'A' || v === 'B') {
          lr_value = v;
        }
      }
      const index_dropdown = currentRow.cells[3].querySelector('select');
      let index_value: number | null = null;
      if (index_dropdown) {
        const parsed = Number(index_dropdown.value);
        if (!Number.isNaN(parsed)) {
          index_value = parsed;
        }
      }
      if (visible != null && lr_value != null && index_value != null) {
        place_equipments(ctx, objectName, lr_value, index_value, visible);

        // 一元化したテーブルの方を書き換える
        for (let i = 0; i < equipment_status.length; i++) {
          if (equipment_status[i].id == objectName) {
            if (lr_value === 'A' || lr_value === 'B') {
              equipment_status[i].position.side = lr_value;
            }
            equipment_status[i].position.position_index = index_value;
          }
        }
      }
    }
  };

  if (!tableBody) return;
  const row = tableBody.insertRow();
  row.dataset.objectIndex = String(0);

  const nameCell = row.insertCell();
  nameCell.textContent = object_name;
  nameCell.dataset.col = "name";

  const visibilityCell = row.insertCell();
  visibilityCell.dataset.col = "visibility";
  const visibilityInput = document.createElement('input');
  visibilityInput.type = 'checkbox';
  visibilityInput.checked = visible;
  visibilityInput.addEventListener('change', (e) => { reflect_position(e); });
  visibilityCell.appendChild(visibilityInput);

  const lrCell = row.insertCell();
  lrCell.dataset.col = "lr";
  const lrSelect = document.createElement('select');
  const lr_options = [
    { name: 'A', value: 'A' },
    { name: 'B', value: 'B' },
  ];
  lr_options.forEach(options => {
    const opt = document.createElement('option');
    opt.value = options.value;
    opt.textContent = options.name;
    if (options.value == lr) opt.selected = true;
    lrSelect.appendChild(opt);
  });
  lrSelect.addEventListener('change', (e) => { reflect_position(e); });
  lrCell.appendChild(lrSelect);

  const posCell = row.insertCell();
  posCell.dataset.col = "position";
  posCell.appendChild(buildPositionSelect(index, reflect_position));

  const widthCell = row.insertCell();
  widthCell.dataset.col = "width";
  widthCell.textContent = String(width);

  const addressCell = row.insertCell();
  addressCell.dataset.col = "address";
  if (uri != undefined) {
    addressCell.textContent = `${uri.ip}:${uri.port}`;
  }

  const statusCell = row.insertCell();
  statusCell.dataset.col = "status";
  statusCell.dataset.role = "pending-status";
  statusCell.textContent = "";

  const resetbuttonCell = row.insertCell();
  appendResetButton(resetbuttonCell, () => {
    if (uri != undefined) EquipmentReset(uri.ip, uri.port);
  });
}

export function reflect_table2(server_name: string, type: string, address: string, port: number, status: number): void {
  if (!tableBody2) return;
  const row = tableBody2.insertRow();
  row.dataset.objectIndex = String(0);
  row.insertCell().textContent = server_name;
  row.insertCell();
  row.insertCell().textContent = type;
  row.insertCell().textContent = address;
  row.insertCell().textContent = String(port);
  row.insertCell().textContent = String(status);
  const resetbuttonCell = row.insertCell();
  appendResetButton(resetbuttonCell, () => EquipmentReset(address, port));
}

export function init_arm(ctx: Ctx): void {
  const reflect_arm_position = function(elem: Event) {
    const select = elem.currentTarget as HTMLSelectElement;
    if (!(select instanceof HTMLSelectElement)) return;
    const currentRow = select.closest('tr');
    if (currentRow) {
      const visible_checkbox = currentRow.cells[1].querySelector<HTMLInputElement>('input[type="checkbox"]');
      const visible = visible_checkbox ? visible_checkbox.checked : true;

      const index_dropdown = currentRow.cells[3].querySelector('select');
      if (index_dropdown) {
        const parsed = Number(index_dropdown.value);
        if (!Number.isNaN(parsed)) {
          place_arm(ctx, visible, parsed);
        }
      }
    }
  };

  if (!tableBody) return;
  const row = tableBody.insertRow();
  row.dataset.objectIndex = String(0);

  const nameCell = row.insertCell();
  nameCell.textContent = "Arm";
  nameCell.dataset.col = "name";

  const visibilityCell = row.insertCell();
  visibilityCell.dataset.col = "visibility";
  const visibilityInput = document.createElement('input');
  visibilityInput.type = 'checkbox';
  visibilityInput.checked = true;
  visibilityInput.addEventListener('change', (e) => { reflect_arm_position(e); });
  visibilityCell.appendChild(visibilityInput);

  row.insertCell(); // left or right カラム（空欄）

  const posCell = row.insertCell();
  posCell.dataset.col = "position";
  posCell.appendChild(buildPositionSelect(0, reflect_arm_position));

  row.insertCell(); // 幅カラム（空欄）

  const addressCell = row.insertCell();
  addressCell.dataset.col = "address";
  if (arm_status.sila2_uri != undefined) {
    addressCell.textContent = `${arm_status.sila2_uri.ip}:${arm_status.sila2_uri.port}`;
  }

  const statusCell = row.insertCell();
  statusCell.dataset.col = "status";
  statusCell.dataset.role = "pending-status";
  statusCell.textContent = "";

  const resetbuttonCell = row.insertCell();
  appendResetButton(resetbuttonCell, () => {
    if (arm_status.sila2_uri != undefined) EquipmentReset(arm_status.sila2_uri.ip, arm_status.sila2_uri.port);
  });
}
