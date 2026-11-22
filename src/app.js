(function () {
  'use strict';

  const Core = window.DaytrayCore;
  const LOCAL_STORAGE_KEY = 'daytray_state_v1';

  const tauriInvoke =
    window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function'
      ? window.__TAURI__.core.invoke
      : null;

  const tauriListen =
    window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function'
      ? window.__TAURI__.event.listen
      : null;

  let todayKey = Core.toDateKey(new Date());
  let selectedDateKey = todayKey;
  let calendarAnchorKey = todayKey;
  let state = Core.createDefaultState(todayKey);

  // Composer draft state
  let draftColorId = 'blue';
  let draftRecurrence = { type: 'none' };
  let saveTimer = null;
  let notesStatusTimer = null;

  // DOM references
  const els = {
    backdrop: document.getElementById('backdrop'),
    flyoutDock: document.getElementById('flyoutDock'),
    flyoutPanel: document.getElementById('flyoutPanel'),
    notesDrawer: document.getElementById('notesDrawer'),
    notesToggleBtn: document.getElementById('notesToggleBtn'),
    notesDot: document.getElementById('notesDot'),
    closeNotesBtn: document.getElementById('closeNotesBtn'),
    notesTextarea: document.getElementById('notesTextarea'),
    notesStatus: document.getElementById('notesStatus'),
    dayHeading: document.getElementById('dayHeading'),
    dateSubtitle: document.getElementById('dateSubtitle'),
    todayJumpBtn: document.getElementById('todayJumpBtn'),
    labelsToggleBtn: document.getElementById('labelsToggleBtn'),
    labelsPopover: document.getElementById('labelsPopover'),
    closeLabelsBtn: document.getElementById('closeLabelsBtn'),
    labelsList: document.getElementById('labelsList'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),
    calPrevBtn: document.getElementById('calPrevBtn'),
    calNextBtn: document.getElementById('calNextBtn'),
    calMonthLabel: document.getElementById('calMonthLabel'),
    modeWeekBtn: document.getElementById('modeWeekBtn'),
    modeMonthBtn: document.getElementById('modeMonthBtn'),
    calendarGrid: document.getElementById('calendarGrid'),
    listTitle: document.getElementById('listTitle'),
    listCount: document.getElementById('listCount'),
    taskList: document.getElementById('taskList'),
    taskForm: document.getElementById('taskForm'),
    taskInput: document.getElementById('taskInput'),
    repeatTriggerBtn: document.getElementById('repeatTriggerBtn'),
    repeatTriggerLabel: document.getElementById('repeatTriggerLabel'),
    repeatPopover: document.getElementById('repeatPopover'),
    closeRepeatBtn: document.getElementById('closeRepeatBtn'),
    repeatTypeTabs: document.getElementById('repeatTypeTabs'),
    repeatConfigArea: document.getElementById('repeatConfigArea'),
    colorSwatches: document.getElementById('colorSwatches'),
    activeColorPill: document.getElementById('activeColorPill')
  };

  /* ------------------------------------------------------------------------
     Persistence (Native JSON in Tauri / localStorage fallback in Browser)
     ------------------------------------------------------------------------ */
  async function loadPersistedState() {
    try {
      let rawText = null;
      if (tauriInvoke) {
        rawText = await tauriInvoke('load_state');
      } else {
        rawText = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      }
      if (rawText) {
        state = Core.sanitizeState(JSON.parse(rawText), todayKey);
      } else {
        state = Core.createDefaultState(todayKey);
        persistStateNow();
      }
    } catch (err) {
      console.error('Daytray: failed to load state', err);
      state = Core.createDefaultState(todayKey);
    }
  }

  function persistStateNow() {
    const payload = JSON.stringify(state, null, 2);
    if (tauriInvoke) {
      tauriInvoke('save_state', { jsonPayload: payload }).catch((err) => {
        console.error('Daytray: failed to save state', err);
      });
    } else {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, payload);
      } catch (_) {}
    }
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistStateNow, 150);
  }

  /* ------------------------------------------------------------------------
     Dynamic Taskbar Tray Icon Renderer (64x64 RGBA Canvas -> Rust Tray)
     ------------------------------------------------------------------------ */
  function updateSystemTrayBadge() {
    if (!tauriInvoke) return;
    const remaining = Core.getRemainingCount(state.tasks, todayKey, todayKey);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Rounded square background
    const pad = 4;
    const w = size - pad * 2;
    const r = 14;
    const grad = ctx.createLinearGradient(0, pad, 0, size - pad);
    if (remaining === 0) {
      grad.addColorStop(0, '#10b981');
      grad.addColorStop(1, '#059669');
    } else {
      grad.addColorStop(0, '#3b82f6');
      grad.addColorStop(1, '#2563eb');
    }

    ctx.beginPath();
    ctx.moveTo(pad + r, pad);
    ctx.arcTo(pad + w, pad, pad + w, pad + w, r);
    ctx.arcTo(pad + w, pad + w, pad, pad + w, r);
    ctx.arcTo(pad, pad + w, pad, pad, r);
    ctx.arcTo(pad, pad, pad + w, pad, r);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (remaining === 0) {
      // Crisp white checkmark
      ctx.beginPath();
      ctx.moveTo(18, 33);
      ctx.lineTo(28, 43);
      ctx.lineTo(47, 22);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      const label = remaining > 99 ? '99+' : String(remaining);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = label.length === 1 ? 38 : label.length === 2 ? 31 : 22;
      ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(label, size / 2, size / 2 + 2);
    }

    const rgba = Array.from(ctx.getImageData(0, 0, size, size).data);
    const tooltip =
      remaining === 0
        ? 'Daytray — All done for today!'
        : `Daytray — ${remaining} ${remaining === 1 ? 'task' : 'tasks'} left today`;

    tauriInvoke('update_tray_badge', { rgba, width: size, height: size, tooltip }).catch((err) => {
      console.error('Daytray: tray badge update failed', err);
    });
  }

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  function getColorMeta(colorId) {
    return state.colors.find((c) => c.id === colorId) || state.colors[0];
  }

  function formatHeading(dateKey) {
    const d = Core.parseDateKey(dateKey);
    const dayShort = d.toLocaleDateString(undefined, { weekday: 'short' });
    const monthShort = d.toLocaleDateString(undefined, { month: 'short' });
    const subtitle = `${dayShort}, ${d.getDate()} ${monthShort}`;

    if (dateKey === todayKey) return { title: 'Today', subtitle };
    if (dateKey === Core.addDays(todayKey, 1)) return { title: 'Tomorrow', subtitle };
    if (dateKey === Core.addDays(todayKey, -1)) return { title: 'Yesterday', subtitle };
    return {
      title: d.toLocaleDateString(undefined, { weekday: 'long' }),
      subtitle
    };
  }

  function closePopovers() {
    els.labelsPopover.classList.add('hidden');
    els.repeatPopover.classList.add('hidden');
    els.labelsToggleBtn.classList.remove('active');
  }

  function syncMidnightIfNeeded() {
    const nowKey = Core.toDateKey(new Date());
    if (nowKey !== todayKey) {
      const wasOnToday = selectedDateKey === todayKey;
      todayKey = nowKey;
      if (wasOnToday) {
        selectedDateKey = todayKey;
        calendarAnchorKey = todayKey;
      }
      renderAll();
    }
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function renderTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const isDark = state.theme === 'dark';
    els.themeIconSun.classList.toggle('hidden', !isDark);
    els.themeIconMoon.classList.toggle('hidden', isDark);
  }

  function renderNotesDrawer() {
    els.flyoutDock.classList.toggle('notes-open', state.notesOpen);
    els.notesDrawer.setAttribute('aria-hidden', state.notesOpen ? 'false' : 'true');
    els.notesToggleBtn.classList.toggle('active', state.notesOpen);
    els.notesDot.classList.toggle('hidden', !state.notes.trim());
    if (els.notesTextarea.value !== state.notes) {
      els.notesTextarea.value = state.notes;
    }
  }

  function renderHeader() {
    const { title, subtitle } = formatHeading(selectedDateKey);
    els.dayHeading.textContent = title;
    els.dateSubtitle.textContent = subtitle;
    els.todayJumpBtn.classList.toggle('hidden', selectedDateKey === todayKey);
  }

  function renderCalendar() {
    const isMonth = state.calendarMode === 'month';
    els.modeWeekBtn.classList.toggle('active', !isMonth);
    els.modeWeekBtn.setAttribute('aria-selected', String(!isMonth));
    els.modeMonthBtn.classList.toggle('active', isMonth);
    els.modeMonthBtn.setAttribute('aria-selected', String(isMonth));
    els.calendarGrid.classList.toggle('month-mode', isMonth);

    const anchorDate = Core.parseDateKey(calendarAnchorKey);
    const anchorMonth = anchorDate.getMonth();
    const anchorYear = anchorDate.getFullYear();
    els.calMonthLabel.textContent = `${Core.MONTH_NAMES[anchorMonth]} ${anchorYear}`;

    const keys = isMonth
      ? Core.getMonthGridKeys(anchorYear, anchorMonth)
      : Core.getWeekStripKeys(calendarAnchorKey);

    els.calendarGrid.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const key of keys) {
      const d = Core.parseDateKey(key);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-cell';
      if (isMonth && d.getMonth() !== anchorMonth) btn.classList.add('other-month');
      if (key === todayKey) btn.classList.add('is-today');
      if (key === selectedDateKey) btn.classList.add('is-selected');

      const numSpan = document.createElement('span');
      numSpan.className = 'cal-num';
      numSpan.textContent = String(d.getDate());
      btn.appendChild(numSpan);

      const dotsWrap = document.createElement('span');
      dotsWrap.className = 'cal-dots';
      const dotColors = Core.getDotColorsForDate(state.tasks, key, todayKey);
      for (const cid of dotColors) {
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = `var(--c-${cid})`;
        dotsWrap.appendChild(dot);
      }
      btn.appendChild(dotsWrap);

      btn.addEventListener('click', () => {
        selectedDateKey = key;
        if (isMonth && d.getMonth() !== anchorMonth) {
          calendarAnchorKey = key;
        }
        renderHeader();
        renderCalendar();
        renderTaskList();
      });

      frag.appendChild(btn);
    }

    els.calendarGrid.appendChild(frag);
  }

  function renderTaskList() {
    const items = Core.getTasksForDate(state.tasks, selectedDateKey, todayKey);
    const remaining = items.filter((i) => !i.completed).length;

    els.listTitle.textContent = selectedDateKey === todayKey ? "Today's To-Do" : 'Scheduled';
    els.listCount.textContent =
      items.length === 0
        ? 'Clear'
        : remaining === 0
        ? 'All done!'
        : `${remaining} left`;

    els.taskList.innerHTML = '';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="empty-title">${selectedDateKey === todayKey ? 'All clear for today' : 'Nothing planned'}</div>
        <div class="empty-sub">Add a task below to get started.</div>
      `;
      els.taskList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of items) {
      const { task, completed, isOverdue, isRecurring } = item;
      const cid = task.colorId || 'blue';
      const colorMeta = getColorMeta(cid);

      const row = document.createElement('div');
      row.className = `task-item${completed ? ' completed' : ''}`;
      row.style.setProperty('--item-color', `var(--c-${cid})`);
      row.style.setProperty('--item-bg', `var(--c-${cid}-bg)`);
      row.style.setProperty('--item-bd', `var(--c-${cid}-bd)`);
      row.style.setProperty('--item-tx', `var(--c-${cid}-tx)`);

      // Checkbox
      const checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'task-check';
      checkBtn.setAttribute('aria-label', completed ? 'Mark incomplete' : 'Mark complete');
      checkBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
      checkBtn.addEventListener('click', () => toggleTaskCompletion(task, selectedDateKey));

      // Body
      const body = document.createElement('div');
      body.className = 'task-body';

      const titleEl = document.createElement('div');
      titleEl.className = 'task-title';
      titleEl.textContent = task.title;
      body.appendChild(titleEl);

      const meta = document.createElement('div');
      meta.className = 'task-meta';

      const catBadge = document.createElement('span');
      catBadge.className = 'badge badge-cat';
      catBadge.textContent = colorMeta.label;
      meta.appendChild(catBadge);

      if (isOverdue) {
        const ovBadge = document.createElement('span');
        ovBadge.className = 'badge badge-overdue';
        ovBadge.textContent = 'Overdue';
        meta.appendChild(ovBadge);
      }

      if (isRecurring) {
        const repBadge = document.createElement('span');
        repBadge.className = 'badge badge-repeat';
        repBadge.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        `;
        const txt = document.createElement('span');
        txt.textContent = Core.describeRecurrence(task.recurrence);
        repBadge.appendChild(txt);
        meta.appendChild(repBadge);
      }

      body.appendChild(meta);

      // Hover Actions
      const actions = document.createElement('div');
      actions.className = 'task-actions';

      if (isRecurring && !completed) {
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'task-act-btn';
        skipBtn.textContent = 'Skip';
        skipBtn.title = 'Skip this occurrence only';
        skipBtn.addEventListener('click', () => skipRecurringOccurrence(task, selectedDateKey));
        actions.appendChild(skipBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'task-act-btn delete';
      delBtn.title = isRecurring ? 'Delete recurring series' : 'Delete task';
      delBtn.setAttribute('aria-label', 'Delete task');
      delBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      `;
      delBtn.addEventListener('click', () => deleteTask(task.id));
      actions.appendChild(delBtn);

      row.appendChild(checkBtn);
      row.appendChild(body);
      row.appendChild(actions);
      frag.appendChild(row);
    }

    els.taskList.appendChild(frag);
  }

  function renderColorPicker() {
    els.colorSwatches.innerHTML = '';
    for (const c of state.colors) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `color-swatch${c.id === draftColorId ? ' selected' : ''}`;
      btn.style.background = `var(--c-${c.id})`;
      btn.style.setProperty('--swatch-color', `var(--c-${c.id})`);
      btn.title = c.label;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(c.id === draftColorId));
      btn.setAttribute('aria-label', c.label);
      btn.addEventListener('click', () => {
        draftColorId = c.id;
        renderColorPicker();
      });
      els.colorSwatches.appendChild(btn);
    }

    const active = getColorMeta(draftColorId);
    els.activeColorPill.textContent = active.label;
    els.activeColorPill.style.background = `var(--c-${active.id}-bg)`;
    els.activeColorPill.style.color = `var(--c-${active.id}-tx)`;
    els.activeColorPill.style.borderColor = `var(--c-${active.id}-bd)`;
  }

  function renderLabelsEditor() {
    els.labelsList.innerHTML = '';
    for (const c of state.colors) {
      const row = document.createElement('div');
      row.className = 'label-edit-row';

      const dot = document.createElement('span');
      dot.className = 'label-dot';
      dot.style.background = `var(--c-${c.id})`;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'label-input';
      input.value = c.label;
      input.maxLength = 18;
      input.setAttribute('aria-label', `Label for ${c.id}`);
      input.addEventListener('input', () => {
        c.label = input.value.trim() || Core.DEFAULT_COLORS.find((d) => d.id === c.id).label;
        renderColorPicker();
        renderTaskList();
        schedulePersist();
      });

      row.appendChild(dot);
      row.appendChild(input);
      els.labelsList.appendChild(row);
    }
  }

  function renderRepeatTrigger() {
    const isSet = draftRecurrence.type !== 'none';
    els.repeatTriggerBtn.classList.toggle('has-repeat', isSet);
    els.repeatTriggerLabel.textContent = Core.describeRecurrence(draftRecurrence);
  }

  function renderRepeatPopover() {
    const chips = els.repeatTypeTabs.querySelectorAll('.repeat-chip');
    chips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.type === draftRecurrence.type);
    });

    const area = els.repeatConfigArea;
    area.innerHTML = '';

    if (draftRecurrence.type === 'none') {
      area.textContent = 'One-off task. Rolls over to Today if unfinished.';
      return;
    }

    if (draftRecurrence.type === 'daily') {
      area.textContent = 'Repeats every single day starting from the selected date.';
      return;
    }

    if (draftRecurrence.type === 'weekdays') {
      if (!Array.isArray(draftRecurrence.weekdays) || draftRecurrence.weekdays.length === 0) {
        draftRecurrence.weekdays = [Core.weekdayIndexMon0(selectedDateKey)];
      }
      const picker = document.createElement('div');
      picker.className = 'weekday-picker';
      Core.WEEKDAY_SHORT.forEach((lbl, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `wday-btn${draftRecurrence.weekdays.includes(idx) ? ' active' : ''}`;
        b.textContent = lbl.slice(0, 2);
        b.addEventListener('click', () => {
          const set = new Set(draftRecurrence.weekdays);
          if (set.has(idx) && set.size > 1) set.delete(idx);
          else set.add(idx);
          draftRecurrence.weekdays = [...set].sort((a, b2) => a - b2);
          renderRepeatPopover();
          renderRepeatTrigger();
        });
        picker.appendChild(b);
      });
      area.appendChild(picker);
      return;
    }

    if (draftRecurrence.type === 'monthly') {
      if (!draftRecurrence.dayOfMonth) {
        draftRecurrence.dayOfMonth = Core.parseDateKey(selectedDateKey).getDate();
      }
      const row = document.createElement('div');
      row.className = 'inline-field';
      row.innerHTML = '<span>Day of month:</span>';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '1';
      inp.max = '31';
      inp.className = 'mini-input';
      inp.value = String(draftRecurrence.dayOfMonth);
      inp.addEventListener('input', () => {
        const n = Math.max(1, Math.min(31, parseInt(inp.value, 10) || 1));
        draftRecurrence.dayOfMonth = n;
        renderRepeatTrigger();
      });
      row.appendChild(inp);
      area.appendChild(row);
      return;
    }

    if (draftRecurrence.type === 'interval') {
      if (!draftRecurrence.intervalDays) draftRecurrence.intervalDays = 3;
      const row = document.createElement('div');
      row.className = 'inline-field';
      row.innerHTML = '<span>Repeat every</span>';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '1';
      inp.max = '365';
      inp.className = 'mini-input';
      inp.value = String(draftRecurrence.intervalDays);
      inp.addEventListener('input', () => {
        draftRecurrence.intervalDays = Math.max(1, Math.min(365, parseInt(inp.value, 10) || 1));
        renderRepeatTrigger();
      });
      const suffix = document.createElement('span');
      suffix.textContent = 'days';
      row.appendChild(inp);
      row.appendChild(suffix);
      area.appendChild(row);
      return;
    }

    if (draftRecurrence.type === 'rotation') {
      if (!draftRecurrence.pattern) draftRecurrence.pattern = '2-2-3';
      const row = document.createElement('div');
      row.className = 'inline-field';
      row.innerHTML = '<span>ON-OFF pattern:</span>';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'mini-input';
      inp.style.width = '112px';
      inp.value = draftRecurrence.pattern;
      inp.placeholder = 'e.g. 2-2-3';
      row.appendChild(inp);
      area.appendChild(row);

      const preview = document.createElement('div');
      preview.className = 'rotation-preview';
      area.appendChild(preview);

      const updatePreview = () => {
        preview.innerHTML = '';
        for (let i = 0; i < 14; i++) {
          const dayKey = Core.addDays(selectedDateKey, i);
          const on = Core.isRotationOnDay(selectedDateKey, dayKey, draftRecurrence.pattern);
          const cell = document.createElement('div');
          cell.className = `rot-cell${on ? ' on' : ''}`;
          cell.textContent = String(i + 1);
          cell.title = `Day ${i + 1}: ${on ? 'ON' : 'OFF'}`;
          preview.appendChild(cell);
        }
      };

      inp.addEventListener('input', () => {
        draftRecurrence.pattern = inp.value.trim() || '2-2-3';
        renderRepeatTrigger();
        updatePreview();
      });
      updatePreview();
    }
  }

  function renderAll() {
    renderTheme();
    renderNotesDrawer();
    renderHeader();
    renderCalendar();
    renderTaskList();
    renderColorPicker();
    renderRepeatTrigger();
    updateSystemTrayBadge();
  }

  /* ------------------------------------------------------------------------
     Task Mutations
     ------------------------------------------------------------------------ */
  function addTask(title) {
    const clean = title.trim();
    if (!clean) return;

    const isRecurring = draftRecurrence.type !== 'none';
    const newTask = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: clean,
      colorId: draftColorId,
      date: selectedDateKey,
      startDate: selectedDateKey,
      completed: false,
      recurrence: isRecurring ? JSON.parse(JSON.stringify(draftRecurrence)) : { type: 'none' },
      completedDates: {},
      skippedDates: {},
      createdAt: Date.now()
    };

    state.tasks.push(newTask);
    els.taskInput.value = '';
    draftRecurrence = { type: 'none' };
    els.repeatPopover.classList.add('hidden');
    persistStateNow();
    renderAll();
  }

  function toggleTaskCompletion(task, dateKey) {
    const isRecurring = Boolean(task.recurrence && task.recurrence.type !== 'none');
    if (!isRecurring) {
      task.completed = !task.completed;
    } else {
      if (!task.completedDates) task.completedDates = {};
      task.completedDates[dateKey] = !task.completedDates[dateKey];
    }
    persistStateNow();
    renderCalendar();
    renderTaskList();
    updateSystemTrayBadge();
  }

  function skipRecurringOccurrence(task, dateKey) {
    if (!task.skippedDates) task.skippedDates = {};
    task.skippedDates[dateKey] = true;
    persistStateNow();
    renderCalendar();
    renderTaskList();
    updateSystemTrayBadge();
  }

  function deleteTask(taskId) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
    persistStateNow();
    renderCalendar();
    renderTaskList();
    updateSystemTrayBadge();
  }

  /* ------------------------------------------------------------------------
     Event Wiring
     ------------------------------------------------------------------------ */
  function bindEvents() {
    // Clicking the transparent backdrop outside the cards hides the flyout
    els.backdrop.addEventListener('mousedown', (e) => {
      if (e.target === els.backdrop || e.target === els.flyoutDock) {
        if (tauriInvoke) tauriInvoke('hide_window');
      }
    });

    // Close open popovers when clicking elsewhere inside the flyout
    els.flyoutPanel.addEventListener('mousedown', (e) => {
      if (
        !els.labelsPopover.classList.contains('hidden') &&
        !els.labelsPopover.contains(e.target) &&
        !els.labelsToggleBtn.contains(e.target)
      ) {
        els.labelsPopover.classList.add('hidden');
        els.labelsToggleBtn.classList.remove('active');
      }
      if (
        !els.repeatPopover.classList.contains('hidden') &&
        !els.repeatPopover.contains(e.target) &&
        !els.repeatTriggerBtn.contains(e.target)
      ) {
        els.repeatPopover.classList.add('hidden');
      }
    });

    // Quick Notes drawer
    els.notesToggleBtn.addEventListener('click', () => {
      state.notesOpen = !state.notesOpen;
      renderNotesDrawer();
      schedulePersist();
      if (state.notesOpen) {
        setTimeout(() => els.notesTextarea.focus(), 160);
      }
    });

    els.closeNotesBtn.addEventListener('click', () => {
      state.notesOpen = false;
      renderNotesDrawer();
      schedulePersist();
    });

    els.notesTextarea.addEventListener('input', () => {
      state.notes = els.notesTextarea.value;
      els.notesDot.classList.toggle('hidden', !state.notes.trim());
      els.notesStatus.textContent = 'Saving...';
      if (notesStatusTimer) clearTimeout(notesStatusTimer);
      notesStatusTimer = setTimeout(() => {
        persistStateNow();
        els.notesStatus.textContent = 'Saved';
      }, 260);
    });

    // Labels popover
    els.labelsToggleBtn.addEventListener('click', () => {
      const opening = els.labelsPopover.classList.contains('hidden');
      closePopovers();
      if (opening) {
        renderLabelsEditor();
        els.labelsPopover.classList.remove('hidden');
        els.labelsToggleBtn.classList.add('active');
      }
    });

    els.closeLabelsBtn.addEventListener('click', closePopovers);

    // Theme toggle
    els.themeToggleBtn.addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      renderTheme();
      schedulePersist();
    });

    // Today snap-back
    els.todayJumpBtn.addEventListener('click', () => {
      selectedDateKey = todayKey;
      calendarAnchorKey = todayKey;
      renderHeader();
      renderCalendar();
      renderTaskList();
    });

    // Calendar mode & navigation
    els.modeWeekBtn.addEventListener('click', () => {
      state.calendarMode = 'week';
      calendarAnchorKey = selectedDateKey;
      renderCalendar();
      schedulePersist();
    });

    els.modeMonthBtn.addEventListener('click', () => {
      state.calendarMode = 'month';
      calendarAnchorKey = selectedDateKey;
      renderCalendar();
      schedulePersist();
    });

    els.calPrevBtn.addEventListener('click', () => {
      if (state.calendarMode === 'week') {
        calendarAnchorKey = Core.addDays(calendarAnchorKey, -7);
      } else {
        const d = Core.parseDateKey(calendarAnchorKey);
        calendarAnchorKey = Core.toDateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      }
      renderCalendar();
    });

    els.calNextBtn.addEventListener('click', () => {
      if (state.calendarMode === 'week') {
        calendarAnchorKey = Core.addDays(calendarAnchorKey, 7);
      } else {
        const d = Core.parseDateKey(calendarAnchorKey);
        calendarAnchorKey = Core.toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
      }
      renderCalendar();
    });

    // Repeat popover
    els.repeatTriggerBtn.addEventListener('click', () => {
      const opening = els.repeatPopover.classList.contains('hidden');
      closePopovers();
      if (opening) {
        renderRepeatPopover();
        els.repeatPopover.classList.remove('hidden');
      }
    });

    els.closeRepeatBtn.addEventListener('click', () => {
      els.repeatPopover.classList.add('hidden');
    });

    els.repeatTypeTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.repeat-chip');
      if (!btn) return;
      const type = btn.dataset.type;
      if (type === 'none') draftRecurrence = { type: 'none' };
      else if (type === 'daily') draftRecurrence = { type: 'daily' };
      else if (type === 'weekdays') draftRecurrence = { type: 'weekdays', weekdays: [Core.weekdayIndexMon0(selectedDateKey)] };
      else if (type === 'monthly') draftRecurrence = { type: 'monthly', dayOfMonth: Core.parseDateKey(selectedDateKey).getDate() };
      else if (type === 'interval') draftRecurrence = { type: 'interval', intervalDays: 3 };
      else if (type === 'rotation') draftRecurrence = { type: 'rotation', pattern: '2-2-3' };

      renderRepeatPopover();
      renderRepeatTrigger();
    });

    // Task submission
    els.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      addTask(els.taskInput.value);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (
          !els.labelsPopover.classList.contains('hidden') ||
          !els.repeatPopover.classList.contains('hidden')
        ) {
          closePopovers();
          return;
        }
        if (state.notesOpen && document.activeElement === els.notesTextarea) {
          els.notesTextarea.blur();
          return;
        }
        if (tauriInvoke) tauriInvoke('hide_window');
        return;
      }

      if (
        e.key === '/' &&
        document.activeElement !== els.taskInput &&
        document.activeElement !== els.notesTextarea &&
        document.activeElement.tagName !== 'INPUT'
      ) {
        e.preventDefault();
        els.taskInput.focus();
      }
    });

    // Tauri lifecycle events + midnight date check
    if (tauriListen) {
      tauriListen('daytray:shown', () => {
        syncMidnightIfNeeded();
      });
    }
    window.addEventListener('focus', syncMidnightIfNeeded);
    setInterval(syncMidnightIfNeeded, 30000);
  }

  /* ------------------------------------------------------------------------
     Bootstrap
     ------------------------------------------------------------------------ */
  async function init() {
    await loadPersistedState();
    bindEvents();
    renderAll();
  }

  init();
})();
