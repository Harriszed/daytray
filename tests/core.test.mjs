import test from 'node:test';
import assert from 'node:assert/strict';
import Core from '../src/core.js';

test('one-off unfinished tasks roll over to today with Overdue flag', () => {
  const today = '2026-11-22';
  const tasks = [
    { id: '1', title: 'Old undone', colorId: 'blue', date: '2026-11-20', completed: false, recurrence: { type: 'none' }, createdAt: 1 },
    { id: '2', title: 'Old done', colorId: 'green', date: '2026-11-20', completed: true, recurrence: { type: 'none' }, createdAt: 2 },
    { id: '3', title: 'Today task', colorId: 'amber', date: '2026-11-22', completed: false, recurrence: { type: 'none' }, createdAt: 3 }
  ];

  const todayList = Core.getTasksForDate(tasks, today, today);
  assert.equal(todayList.length, 2);
  assert.equal(todayList[0].task.id, '1');
  assert.equal(todayList[0].isOverdue, true);
  assert.equal(todayList[1].task.id, '3');
  assert.equal(todayList[1].isOverdue, false);
});

test('missed recurring tasks do NOT roll over into duplicates', () => {
  const today = '2026-11-22';
  const tasks = [
    {
      id: 'rec-1',
      title: 'Take vitamins',
      colorId: 'green',
      startDate: '2026-11-15',
      recurrence: { type: 'daily' },
      completedDates: {},
      skippedDates: {},
      createdAt: 1
    }
  ];

  const todayList = Core.getTasksForDate(tasks, today, today);
  assert.equal(todayList.length, 1);
  assert.equal(todayList[0].isOverdue, false);
});

test('skipping a recurring occurrence hides only that date', () => {
  const tasks = [
    {
      id: 'rec-2',
      title: 'Standup',
      colorId: 'blue',
      startDate: '2026-11-20',
      recurrence: { type: 'daily' },
      completedDates: {},
      skippedDates: { '2026-11-22': true },
      createdAt: 1
    }
  ];

  assert.equal(Core.getTasksForDate(tasks, '2026-11-22', '2026-11-22').length, 0);
  assert.equal(Core.getTasksForDate(tasks, '2026-11-23', '2026-11-22').length, 1);
});

test('monthly recurrence clamps 31st safely to Feb 28 / leap Feb 29', () => {
  const task = {
    id: 'm-1',
    title: 'Pay rent',
    colorId: 'rose',
    startDate: '2026-01-31',
    recurrence: { type: 'monthly', dayOfMonth: 31 }
  };

  assert.equal(Core.matchesRecurrence(task, '2026-02-28'), true);
  assert.equal(Core.matchesRecurrence(task, '2026-04-30'), true);
  assert.equal(Core.matchesRecurrence(task, '2026-05-30'), false);
  assert.equal(Core.matchesRecurrence(task, '2026-05-31'), true);
  assert.equal(Core.matchesRecurrence(task, '2028-02-28'), false);
  assert.equal(Core.matchesRecurrence(task, '2028-02-29'), true);
});

test('weekdays recurrence matches Monday=0 through Sunday=6', () => {
  // 2026-11-23 is Monday, 2026-11-25 is Wednesday, 2026-11-24 is Tuesday
  const task = {
    id: 'w-1',
    title: 'Gym',
    colorId: 'green',
    startDate: '2026-11-23',
    recurrence: { type: 'weekdays', weekdays: [0, 2, 4] }
  };

  assert.equal(Core.matchesRecurrence(task, '2026-11-23'), true);
  assert.equal(Core.matchesRecurrence(task, '2026-11-24'), false);
  assert.equal(Core.matchesRecurrence(task, '2026-11-25'), true);
});

test('custom 2-2-3 rotation generates exact 14-day repeating cycle', () => {
  const start = '2026-11-02';
  // 2 ON, 2 OFF, 3 ON, 2 OFF, 2 ON, 3 OFF
  const expected = [
    true, true,
    false, false,
    true, true, true,
    false, false,
    true, true,
    false, false, false
  ];

  for (let i = 0; i < 14; i++) {
    const key = Core.addDays(start, i);
    assert.equal(Core.isRotationOnDay(start, key, '2-2-3'), expected[i], `Day ${i + 1}`);
  }
  // Repeats on day 15
  assert.equal(Core.isRotationOnDay(start, Core.addDays(start, 14), '2-2-3'), true);
});

test('interval recurrence handles every N days and ignores dates before start', () => {
  const task = {
    id: 'i-1',
    title: 'Water plants',
    colorId: 'teal',
    startDate: '2026-11-20',
    recurrence: { type: 'interval', intervalDays: 3 }
  };

  assert.equal(Core.matchesRecurrence(task, '2026-11-19'), false);
  assert.equal(Core.matchesRecurrence(task, '2026-11-20'), true);
  assert.equal(Core.matchesRecurrence(task, '2026-11-22'), false);
  assert.equal(Core.matchesRecurrence(task, '2026-11-23'), true);
});

test('remaining count and calendar dots ignore completed tasks', () => {
  const today = '2026-11-22';
  const tasks = [
    { id: 'a', title: 'One', colorId: 'blue', date: today, completed: true, recurrence: { type: 'none' } },
    { id: 'b', title: 'Two', colorId: 'purple', date: today, completed: false, recurrence: { type: 'none' } },
    { id: 'c', title: 'Three', colorId: 'purple', date: today, completed: false, recurrence: { type: 'none' } }
  ];

  assert.equal(Core.getRemainingCount(tasks, today, today), 2);
  assert.deepEqual(Core.getDotColorsForDate(tasks, today, today), ['purple']);
});

test('sanitizeState recovers gracefully from malformed input', () => {
  const clean = Core.sanitizeState({ theme: 'invalid', tasks: [{ id: 'x', title: '  ' }, { id: 'ok', title: 'Valid' }] }, '2026-11-22');
  assert.equal(clean.theme, 'dark');
  assert.equal(clean.tasks.length, 1);
  assert.equal(clean.tasks[0].id, 'ok');
  assert.equal(clean.colors.length, 6);
});

test('default state starts in dark mode with keepOpen disabled', () => {
  const fresh = Core.createDefaultState('2026-11-23');
  assert.equal(fresh.theme, 'dark');
  assert.equal(fresh.keepOpen, false);
});

test('sanitizeState preserves keepOpen boolean and defaults invalid values safely', () => {
  const pinned = Core.sanitizeState({ keepOpen: true, theme: 'dark', tasks: [] }, '2026-11-23');
  assert.equal(pinned.keepOpen, true);
  assert.equal(pinned.theme, 'dark');

  const unpinned = Core.sanitizeState({ keepOpen: false, tasks: [] }, '2026-11-23');
  assert.equal(unpinned.keepOpen, false);
  assert.equal(unpinned.theme, 'dark');
});
