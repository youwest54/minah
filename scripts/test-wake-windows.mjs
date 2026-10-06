/** Inline self-check for wake-window math (no TS imports). */

const MINUTE = 60_000;

const day = (h, m = 0, dayOffset = 0) => {
  const d = new Date(2026, 9, 6, 0, 0, 0, 0); // Oct 6 local
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const dayKey = (iso) => {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${dayNum}`;
};

function buildWakeWindows(events, now) {
  const wakes = events
    .filter((e) => e.type === 'sleep' && e.endedAt)
    .map((e) => e.endedAt)
    .sort((a, b) => a.localeCompare(b));
  const sleepStarts = events
    .filter((e) => e.type === 'sleep')
    .map((e) => e.startedAt)
    .sort((a, b) => a.localeCompare(b));

  const windows = [];
  const latestWake = wakes[wakes.length - 1] ?? null;

  for (const wakeAt of wakes) {
    const fallAsleepAt = sleepStarts.find((start) => start > wakeAt) ?? null;
    if (fallAsleepAt) {
      windows.push({
        startedAt: wakeAt,
        endedAt: fallAsleepAt,
        durationMs: new Date(fallAsleepAt) - new Date(wakeAt),
        day: dayKey(wakeAt),
        slot: 0,
        period: new Date(wakeAt).getHours() < 12 ? 'morning' : 'afternoon',
        open: false,
      });
    } else if (wakeAt === latestWake) {
      windows.push({
        startedAt: wakeAt,
        endedAt: null,
        durationMs: Math.max(0, now - new Date(wakeAt)),
        day: dayKey(wakeAt),
        slot: 0,
        period: new Date(wakeAt).getHours() < 12 ? 'morning' : 'afternoon',
        open: true,
      });
    }
  }

  const byDay = new Map();
  for (const w of windows) {
    const bucket = byDay.get(w.day) ?? [];
    bucket.push(w);
    byDay.set(w.day, bucket);
  }
  for (const dayWindows of byDay.values()) {
    dayWindows
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .forEach((w, i) => {
        w.slot = i + 1;
      });
  }
  return windows.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

const sleep = (start, end) => ({ type: 'sleep', startedAt: start, endedAt: end });
const events = [
  sleep(day(6, 0), day(7, 0)),
  sleep(day(8, 30), day(10, 0)),
  sleep(day(11, 30), day(13, 0)),
  sleep(day(14, 45), day(16, 30)),
];
const now = new Date(2026, 9, 6, 17, 0, 0, 0).getTime();
const windows = buildWakeWindows(events, now);
const closed = windows.filter((w) => !w.open);
const open = windows.filter((w) => w.open);

let failed = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
};

check('3 closed + 1 open', closed.length === 3 && open.length === 1);
check('1st morning 90m', closed[0].durationMs === 90 * MINUTE && closed[0].period === 'morning' && closed[0].slot === 1);
check('2nd morning 90m', closed[1].durationMs === 90 * MINUTE && closed[1].slot === 2);
check('3rd afternoon 105m', closed[2].durationMs === 105 * MINUTE && closed[2].period === 'afternoon');
check('open 30m', open[0].durationMs === 30 * MINUTE);

console.log(failed ? `\n${failed} failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
