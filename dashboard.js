const API_BASE = '';

let dashboardState = {
  users: [],
  presence: [],
  summary: null,
  tasks: [],
  selectedTaskId: null,
  events: [],
  decisions: []
};

function $(id) {
  return document.getElementById(id);
}

function formatTimer(iso) {
  if (!iso) return 'since -';
  const diff = Date.now() - new Date(iso).getTime();
  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `since ${h}:${m}:${s}`;
}

function eventMessage(ev) {
  return ev.message || ev.kind || 'event';
}

function getLastEventForUser(userId) {
  const events = dashboardState.events || [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (
      ev.user_id === userId ||
      ev.owner_user_id === userId ||
      ev.to_user_id === userId
    ) {
      return ev;
    }
  }
  return null;
}

function renderKPI() {
  const summary = dashboardState.summary;
  if (!summary) return;

  $('kpi-working').textContent = String(summary.working || 0);
  $('kpi-waiting').textContent = String(summary.waiting || 0);
  $('kpi-blocked').textContent = String(summary.blocked || 0);
  $('kpi-idle').textContent = String(summary.idle || 0);

  const longestUser = summary.longest_waiting_user;
  if (longestUser && longestUser.name) {
    $('kpi-longest').textContent = `${longestUser.name} - ${summary.longest_waiting_minutes || 0}m`;
    const last = getLastEventForUser(longestUser.id);
    $('kpi-longest-log').textContent = last ? eventMessage(last) : 'no recent intervention';
  } else {
    $('kpi-longest').textContent = '-';
    $('kpi-longest-log').textContent = '-';
  }
}

function renderStage() {
  const container = $('stage');
  container.innerHTML = '';

  const tiles = [];
  for (let i = 0; i < 6; i += 1) {
    const tile = document.createElement('div');
    tile.className = 'stage-tile';
    container.appendChild(tile);
    tiles.push(tile);
  }

  dashboardState.users.forEach((user, index) => {
    const row = dashboardState.presence.find(item => item.user.id === user.id);
    const p = row ? row.presence : null;

    const initials = user.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const waitingUser =
      p && p.waiting_for_user_id
        ? dashboardState.users.find(u => u.id === p.waiting_for_user_id)
        : null;

    let bubble = 'Idle';
    if (p && p.state === 'WORKING') {
      bubble = p.task_title ? `Working: ${p.task_title}` : 'Working';
    } else if (p && p.state === 'WAITING') {
      bubble = `Waiting: ${waitingUser ? waitingUser.name : 'dependency'}`;
    } else if (p && p.state === 'BLOCKED') {
      bubble = p.reason ? `Blocked: ${p.reason}` : 'Blocked';
    }

    const stateClass =
      p && p.state === 'WORKING'
        ? 'agent--working'
        : p && p.state === 'WAITING'
        ? 'agent--waiting'
        : p && p.state === 'BLOCKED'
        ? 'agent--blocked'
        : 'agent--idle';

    const agent = document.createElement('div');
    agent.className = `agent ${stateClass}`;
    agent.dataset.userId = String(user.id);

    const lastEvent = getLastEventForUser(user.id);
    const titleParts = [p ? formatTimer(p.since_time) : ''];
    if (lastEvent) titleParts.push(eventMessage(lastEvent));

    agent.title = titleParts.filter(Boolean).join(' | ');
    agent.innerHTML = `
      <div class="agent-avatar-ring">
        <div class="agent-avatar">${initials}</div>
      </div>
      <div class="agent-name">${user.name}</div>
      <div class="agent-role">${user.role}</div>
      <div class="agent-bubble" title="${bubble}">${bubble}</div>
    `;

    const tileIndex = Math.min(index, tiles.length - 1);
    tiles[tileIndex].appendChild(agent);
  });
}

function renderQueue() {
  const list = $('queue-list');
  list.innerHTML = '';

  dashboardState.tasks.forEach(task => {
    const ownerId = task.owner_user_id || task.owner_id;
    const owner = dashboardState.users.find(user => user.id === ownerId);

    const li = document.createElement('li');
    li.className = 'queue-item';
    if (dashboardState.selectedTaskId === task.id) {
      li.classList.add('queue-item--selected');
    }

    li.dataset.taskId = String(task.id);
    li.innerHTML = `
      <div class="queue-item__title">${task.title}</div>
      <div class="queue-item__meta">${task.stage} - ${owner ? owner.name : 'Unknown'}</div>
    `;

    list.appendChild(li);
  });

  renderTaskDetail();
}

function renderTaskDetail() {
  const detail = $('task-detail');
  const task = dashboardState.tasks.find(item => item.id === dashboardState.selectedTaskId);

  if (!task) {
    detail.innerHTML = '<div class="task-detail__empty">Select a task in queue to inspect details.</div>';
    return;
  }

  const ownerId = task.owner_user_id || task.owner_id;
  const owner = dashboardState.users.find(user => user.id === ownerId);

  detail.innerHTML = `
    <div class="task-detail__card">
      <div class="task-detail__title">${task.title}</div>
      <div class="task-detail__row">
        <span class="task-detail__label">Task ID</span>
        <span class="task-detail__value">${task.id}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Stage</span>
        <span class="task-detail__value">${task.stage}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Owner</span>
        <span class="task-detail__value">${owner ? owner.name : 'Unknown'}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Project</span>
        <span class="task-detail__value">${task.project || '-'}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Depends on</span>
        <span class="task-detail__value">${
          Array.isArray(task.depends_on) && task.depends_on.length ? task.depends_on.join(', ') : '-'
        }</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Created at</span>
        <span class="task-detail__value">${new Date(task.created_at).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function renderActivity() {
  const list = $('activity-list');
  list.innerHTML = '';

  const rows = (dashboardState.events || []).slice(-25).reverse();
  rows.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = `
      <div class="activity__time">${new Date(ev.timestamp).toLocaleTimeString()}</div>
      <div class="activity__message">${eventMessage(ev)}</div>
    `;
    list.appendChild(li);
  });
}

function renderDecisions() {
  const list = $('decision-list');
  list.innerHTML = '';

  const rows = (dashboardState.decisions || []).slice(-20).reverse();
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = '<div class="activity__message">No decisions yet.</div>';
    list.appendChild(li);
    return;
  }

  rows.forEach(item => {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = `
      <div class="activity__time">${new Date(item.created_at).toLocaleTimeString()}</div>
      <div class="activity__message">[${item.source}] ${item.decision}</div>
    `;
    list.appendChild(li);
  });
}

function renderAll() {
  renderKPI();
  renderStage();
  renderQueue();
  renderActivity();
  renderDecisions();
}

function initFormOptions() {
  const formUser = $('form-user');
  const formWaiting = $('form-waiting-for');
  const taskOwner = $('task-owner');
  const actionUser = $('role-action-user');

  formUser.innerHTML = '';
  formWaiting.innerHTML = '<option value="">-</option>';
  taskOwner.innerHTML = '';
  actionUser.innerHTML = '';

  dashboardState.users.forEach(user => {
    const display = `${user.name} (${user.role})`;

    const userOpt = document.createElement('option');
    userOpt.value = String(user.id);
    userOpt.textContent = display;
    formUser.appendChild(userOpt);

    const waitOpt = document.createElement('option');
    waitOpt.value = String(user.id);
    waitOpt.textContent = user.name;
    formWaiting.appendChild(waitOpt);

    const ownerOpt = document.createElement('option');
    ownerOpt.value = String(user.id);
    ownerOpt.textContent = user.name;
    taskOwner.appendChild(ownerOpt);

    const actionOpt = document.createElement('option');
    actionOpt.value = String(user.id);
    actionOpt.textContent = display;
    actionUser.appendChild(actionOpt);
  });
}

async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard`);
  if (!res.ok) {
    console.error('Failed to fetch dashboard', await res.text());
    return;
  }

  const data = await res.json();

  dashboardState = {
    users: data.users || [],
    presence: data.presence || [],
    summary: data.summary || null,
    tasks: data.tasks || [],
    selectedTaskId:
      dashboardState.selectedTaskId && (data.tasks || []).some(task => task.id === dashboardState.selectedTaskId)
        ? dashboardState.selectedTaskId
        : data.tasks && data.tasks[0]
        ? data.tasks[0].id
        : null,
    events: data.events || [],
    decisions: data.decisions || []
  };

  initFormOptions();
  renderAll();
}

async function updatePresence(payload) {
  const res = await fetch(`${API_BASE}/api/presence/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to update presence');
    return;
  }

  await fetchDashboard();
}

async function createTask(payload) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to create task');
    return;
  }

  await fetchDashboard();
}

async function runRoleAction(userId) {
  const res = await fetch(`${API_BASE}/api/roles/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: Number(userId) })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Role action failed');
    return null;
  }

  return data;
}

async function runAllRoles() {
  const res = await fetch(`${API_BASE}/api/roles/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_all: true })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Run all roles failed');
    return null;
  }

  return data;
}

function attachQueueActions() {
  $('queue-list').addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const row = target.closest('.queue-item');
    if (!row) return;

    const taskId = row.getAttribute('data-taskId');
    dashboardState.selectedTaskId = taskId;
    renderQueue();
  });
}

function attachPresenceForm() {
  $('update-form').addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      user_id: Number($('form-user').value),
      state: $('form-state').value,
      task_title: $('form-task').value.trim(),
      waiting_for_user_id: $('form-waiting-for').value
        ? Number($('form-waiting-for').value)
        : null,
      reason: $('form-reason').value.trim()
    };

    await updatePresence(payload);
  });
}

function attachTaskForm() {
  $('create-task-form').addEventListener('submit', async event => {
    event.preventDefault();

    const dependsRaw = $('task-depends').value.trim();
    const dependsOn = dependsRaw
      ? dependsRaw
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      : [];

    const payload = {
      title: $('task-title').value.trim(),
      stage: $('task-stage').value,
      owner_user_id: Number($('task-owner').value),
      depends_on: dependsOn
    };

    await createTask(payload);

    $('task-title').value = '';
    $('task-depends').value = '';
  });
}

function attachStageQuickSelect() {
  $('stage').addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const card = target.closest('.agent');
    if (!card) return;

    const userId = card.getAttribute('data-user-id');
    if (userId) {
      $('form-user').value = userId;
      $('role-action-user').value = userId;
    }
  });
}

function attachRoleActions() {
  $('btn-run-role').addEventListener('click', async () => {
    const userId = Number($('role-action-user').value);
    const result = await runRoleAction(userId);
    if (!result) return;

    $('role-action-result').textContent = `${result.user.name}: ${result.action}`;
    await fetchDashboard();
  });

  $('btn-run-all').addEventListener('click', async () => {
    const result = await runAllRoles();
    if (!result) return;

    const count = Array.isArray(result.results) ? result.results.length : 0;
    $('role-action-result').textContent = `Executed role actions for ${count} users.`;
    await fetchDashboard();
  });
}

function startPolling() {
  setInterval(fetchDashboard, 10000);
}

async function init() {
  await fetchDashboard();
  attachQueueActions();
  attachPresenceForm();
  attachTaskForm();
  attachStageQuickSelect();
  attachRoleActions();
  startPolling();
}

window.addEventListener('DOMContentLoaded', init);
