const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function renderDashboard(state) {
  return `<main><header><strong>daybook</strong><div class="avatar">${escape(state.initials)}</div></header><h1>${escape(state.greeting)}</h1><p>${escape(state.date)}</p><section class="summary"><strong>${escape(state.completed)} / ${escape(state.total)}</strong><p>little steps, real progress</p></section><h2>Your next steps</h2>${state.tasks.map((task) => `<div class="task ${task.done ? 'done' : ''}"><div class="check">${task.done ? '&#10003;' : ''}</div><div><strong>${escape(task.title)}</strong><p>${escape(task.detail)}</p></div></div>`).join('')}</main><nav class="bottom"><strong>Today</strong><span>Projects</span><span>Notes</span></nav>`;
}
