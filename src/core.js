(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DaytrayCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_COLORS = [
    { id: 'blue',   label: 'Work',     hex: '#3b82f6' },
    { id: 'purple', label: 'Personal', hex: '#a855f7' },
    { id: 'green',  label: 'Health',   hex: '#10b981' },
    { id: 'amber',  label: 'Errands',  hex: '#f59e0b' },
    { id: 'rose',   label: 'Urgent',   hex: '#f43f5e' },
    { id: 'teal',   label: 'Home',     hex: '#14b8a6' }
  ];

  const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseDateKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new Error(`Invalid date key: ${key}`);
    }
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(dateKey, delta) {
    const d = parseDateKey(dateKey);
    d.setDate(d.getDate() + delta);
    return toDateKey(d);
  }

  function diffDays(startKey, endKey) {
    const a = parseDateKey(startKey);
    const b = parseDateKey(endKey);
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((utcB - utcA) / 86400000);
  }

  // Monday = 0, ..., Sunday = 6
  function weekdayIndexMon0(dateKey) {
    const jsDay = parseDateKey(dateKey).getDay();
    return (jsDay + 6) % 7;
  }

  function startOfWeekMon(dateKey) {
    return addDays(dateKey, -weekdayIndexMon0(dateKey));
  }

  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  /**
   * Parse a rotation string like "2-2-3" into alternating ON/OFF day spans.
   * Odd indices (0, 2, 4...) are ON days; even indices (1, 3, 5...) are OFF days.
   * For odd-length patterns like "2-2-3" (7 days), the cycle mirrors on the second pass
   * (2 ON, 2 OFF, 3 ON, 2 OFF, 2 ON, 3 OFF = 14-day classic 2-2-3 rotation).
   */
  function parseRotationPattern(patternStr) {
    const nums = String(patternStr || '')
      .split(/[^0-9]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 60);

    if (nums.length === 0) return null;
    if (nums.length === 1) return [nums[0], nums[0]];
    if (nums.length % 2 === 1) {
      return nums.concat(nums);
    }
    return nums;
  }

  function isRotationOnDay(startKey, targetKey, patternStr) {
    const delta = diffDays(startKey, targetKey);
    if (delta < 0) return false;
    const spans = parseRotationPattern(patternStr);
    if (!spans) return false;
    const total = spans.reduce((acc, n) => acc + n, 0);
    if (total <= 0) return false;
    let pos = delta % total;
    for (let i = 0; i < spans.length; i++) {
      if (pos < spans[i]) {
        return i % 2 === 0;
      }
      pos -= spans[i];
    }
    return false;
  }

  function matchesRecurrence(task, targetKey) {
    const rec = task.recurrence;
    if (!rec || rec.type === 'none') return false;
    const startKey = task.startDate || task.date;
    if (!startKey) return false;

    const delta = diffDays(startKey, targetKey);
    if (delta < 0) return false;

    switch (rec.type) {
      case 'daily':
        return true;

      case 'weekdays': {
        const days = Array.isArray(rec.weekdays) ? rec.weekdays : [];
        return days.includes(weekdayIndexMon0(targetKey));
      }

      case 'monthly': {
        const target = parseDateKey(targetKey);
        const desiredDay = Math.max(1, Math.min(31, Number(rec.dayOfMonth) || parseDateKey(startKey).getDate()));
        const maxDay = daysInMonth(target.getFullYear(), target.getMonth());
        const clamped = Math.min(desiredDay, maxDay);
        return target.getDate() === clamped;
      }

      case 'interval': {
        const every = Math.max(1, Math.floor(Number(rec.intervalDays) || 1));
        return delta % every === 0;
      }

      case 'rotation':
        return isRotationOnDay(startKey, targetKey, rec.pattern);

      default:
        return false;
    }
  }

  function describeRecurrence(rec) {
    if (!rec || rec.type === 'none') return 'Once';
    switch (rec.type) {
      case 'daily':
        return 'Daily';
      case 'weekdays': {
        const sorted = [...new Set(rec.weekdays || [])].sort((a, b) => a - b);
        if (sorted.length === 7) return 'Daily';
        if (sorted.length === 5 && sorted[0] === 0 && sorted[4] === 4) return 'Weekdays';
        if (sorted.length === 2 && sorted[0] === 5 && sorted[1] === 6) return 'Weekends';
        return sorted.map((i) => WEEKDAY_SHORT[i]).join(', ') || 'Weekdays';
      }
      case 'monthly':
        return `Monthly (${ordinal(rec.dayOfMonth || 1)})`;
      case 'interval':
        return rec.intervalDays === 1 ? 'Daily' : `Every ${rec.intervalDays}d`;
      case 'rotation':
        return `Rotation ${rec.pattern || '2-2-3'}`;
      default:
        return 'Repeats';
    }
  }

  function ordinal(n) {
    const v = Number(n) || 1;
    const mod100 = v % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
    const mod10 = v % 10;
    if (mod10 === 1) return `${v}st`;
    if (mod10 === 2) return `${v}nd`;
    if (mod10 === 3) return `${v}rd`;
    return `${v}th`;
  }

  /**
   * Returns all tasks visible on `dateKey` given `todayKey`.
   * Rules:
   * - One-off tasks scheduled on `dateKey` appear on `dateKey`.
   * - Incomplete one-off tasks scheduled BEFORE `todayKey` roll over to `todayKey` with `isOverdue: true`.
   * - Recurring tasks appear on any matching date where they are not skipped.
   * - Missed recurring tasks do NOT roll over.
   */
  function getTasksForDate(tasks, dateKey, todayKey) {
    const items = [];
    for (const task of tasks) {
      const isRecurring = Boolean(task.recurrence && task.recurrence.type !== 'none');

      if (!isRecurring) {
        const done = Boolean(task.completed);
        if (task.date === dateKey) {
          const isOverdue = !done && dateKey < todayKey;
          items.push({
            task,
            instanceDate: dateKey,
            completed: done,
            isOverdue,
            isRecurring: false
          });
        } else if (dateKey === todayKey && !done && task.date < todayKey) {
          items.push({
            task,
            instanceDate: task.date,
            completed: false,
            isOverdue: true,
            isRecurring: false
          });
        }
      } else {
        if (!matchesRecurrence(task, dateKey)) continue;
        if (task.skippedDates && task.skippedDates[dateKey]) continue;
        const done = Boolean(task.completedDates && task.completedDates[dateKey]);
        items.push({
          task,
          instanceDate: dateKey,
          completed: done,
          isOverdue: false,
          isRecurring: true
        });
      }
    }

    // Sort: incomplete first (overdue at very top), completed last; preserve creation order inside groups
    items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return (a.task.createdAt || 0) - (b.task.createdAt || 0);
    });

    return items;
  }

  function getRemainingCount(tasks, dateKey, todayKey) {
    return getTasksForDate(tasks, dateKey, todayKey).filter((item) => !item.completed).length;
  }

  /**
   * Returns unique colour IDs for calendar dots under a given date (max 4 dots).
   */
  function getDotColorsForDate(tasks, dateKey, todayKey) {
    const items = getTasksForDate(tasks, dateKey, todayKey);
    const seen = [];
    for (const item of items) {
      if (item.completed) continue;
      const cid = item.task.colorId || 'blue';
      if (!seen.includes(cid)) {
        seen.push(cid);
        if (seen.length >= 4) break;
      }
    }
    return seen;
  }

  function createDefaultState(todayKey) {
    const now = Date.now();
    return {
      version: 1,
      theme: 'dark',
      calendarMode: 'week',
      notesOpen: false,
      notes: '',
      colors: DEFAULT_COLORS.map((c) => ({ ...c })),
      tasks: [
        {
          id: 'welcome-1',
          title: 'Click the tray icon or press Ctrl+Shift+Space anytime',
          colorId: 'blue',
          date: todayKey,
          completed: false,
          recurrence: { type: 'none' },
          createdAt: now
        },
        {
          id: 'welcome-2',
          title: 'Add a recurring task or open Quick Notes above',
          colorId: 'green',
          date: todayKey,
          completed: false,
          recurrence: { type: 'none' },
          createdAt: now + 1
        }
      ]
    };
  }

  function sanitizeState(raw, todayKey) {
    const fallback = createDefaultState(todayKey);
    if (!raw || typeof raw !== 'object') return fallback;

    const colors = Array.isArray(raw.colors) && raw.colors.length === DEFAULT_COLORS.length
      ? raw.colors.map((c, idx) => ({
          id: DEFAULT_COLORS[idx].id,
          hex: DEFAULT_COLORS[idx].hex,
          label: typeof c?.label === 'string' && c.label.trim() ? c.label.trim().slice(0, 18) : DEFAULT_COLORS[idx].label
        }))
      : fallback.colors;

    const tasks = Array.isArray(raw.tasks)
      ? raw.tasks.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string' && t.title.trim())
      : fallback.tasks;

    return {
      version: 1,
      theme: raw.theme === 'light' ? 'light' : 'dark',
      calendarMode: raw.calendarMode === 'month' ? 'month' : 'week',
      notesOpen: Boolean(raw.notesOpen),
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      colors,
      tasks
    };
  }

  function getMonthGridKeys(year, monthIndex0) {
    const first = new Date(year, monthIndex0, 1);
    const firstKey = toDateKey(first);
    const gridStart = startOfWeekMon(firstKey);
    const keys = [];
    for (let i = 0; i < 42; i++) {
      keys.push(addDays(gridStart, i));
    }
    return keys;
  }

  function getWeekStripKeys(anchorKey) {
    const start = startOfWeekMon(anchorKey);
    const keys = [];
    for (let i = 0; i < 7; i++) {
      keys.push(addDays(start, i));
    }
    return keys;
  }

  return {
    DEFAULT_COLORS,
    WEEKDAY_SHORT,
    MONTH_NAMES,
    toDateKey,
    parseDateKey,
    addDays,
    diffDays,
    weekdayIndexMon0,
    startOfWeekMon,
    daysInMonth,
    parseRotationPattern,
    isRotationOnDay,
    matchesRecurrence,
    describeRecurrence,
    getTasksForDate,
    getRemainingCount,
    getDotColorsForDate,
    createDefaultState,
    sanitizeState,
    getMonthGridKeys,
    getWeekStripKeys
  };
}));
