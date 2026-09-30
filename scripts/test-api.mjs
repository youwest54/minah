/**
 * End-to-end checks for the sharing API, driven as if two phones were talking
 * to it at once.
 *
 *   npm run test:api                          # against `netlify dev`
 *   MINAH_BASE=https://…netlify.app npm run test:api
 *
 * Note: `netlify dev` does not enforce conditional (etag) writes, so the
 * concurrency check can only pass against a real deploy. It is reported as a
 * warning locally rather than a failure.
 */

const BASE = process.env.MINAH_BASE || 'http://localhost:8888';
const isLocal = BASE.includes('localhost');

console.log(`testing ${BASE}\n`);

let failures = 0;

const call = async (path, init) => {
  const response = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const warn = (label, note) => console.log(`WARN  ${label} — ${note}`);

const makeEvent = (overrides = {}) => ({
  id: crypto.randomUUID(),
  type: 'feed',
  startedAt: new Date().toISOString(),
  endedAt: null,
  details: {},
  createdBy: 'test',
  updatedAt: new Date().toISOString(),
  deleted: false,
  ...overrides,
});

// --- one phone starts a family, the other joins with just the code ----------

const created = await call('/api/household', {
  method: 'POST',
  body: JSON.stringify({ babyName: 'Test Baby' }),
});
check('create a family', created.status === 201 && created.body?.joinCode?.length === 8);
if (!created.body?.id) {
  console.log('\ncannot continue without a family');
  process.exit(1);
}
const { id, joinCode } = created.body;

check('join with the code', (await call(`/api/household?code=${joinCode}`)).body.id === id);
check(
  'join code is case insensitive',
  (await call(`/api/household?code=${joinCode.toLowerCase()}`)).body.id === id,
);
check('a wrong code is refused', (await call('/api/household?code=ZZZZZZZZ')).status === 404);

// --- entries written by one phone are visible to the other ------------------

const feed = makeEvent({ details: { method: 'bottle', amountMl: 120 } });
const pushed = await call('/api/events', {
  method: 'POST',
  body: JSON.stringify({ householdId: id, events: [feed] }),
});
check('one phone saves a feed', pushed.status === 200 && pushed.body.events.length === 1);

const fetched = await call(`/api/events?householdId=${id}`);
check('the other phone sees it', fetched.body.events.some((e) => e.id === feed.id));

const sleep = makeEvent({ type: 'sleep', endedAt: null });
const both = await call('/api/events', {
  method: 'POST',
  body: JSON.stringify({ householdId: id, events: [sleep] }),
});
check('entries from both phones coexist', both.body.events.length === 2);

// --- conflicting edits resolve to the newer one ----------------------------

const newer = { ...feed, details: { amountMl: 150, method: 'bottle' }, updatedAt: new Date().toISOString() };
const stale = {
  ...feed,
  details: { amountMl: 60, method: 'bottle' },
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
};
await call('/api/events', { method: 'POST', body: JSON.stringify({ householdId: id, events: [newer] }) });
const resolved = await call('/api/events', {
  method: 'POST',
  body: JSON.stringify({ householdId: id, events: [stale] }),
});
check(
  'a stale edit cannot overwrite a newer one',
  resolved.body.events.find((e) => e.id === feed.id)?.details.amountMl === 150,
);

// --- simultaneous saves must not lose any entry ---------------------------

const burst = Array.from({ length: 8 }, () => makeEvent({ type: 'diaper', details: { kind: 'wet' } }));
await Promise.all(
  burst.map((event) =>
    call('/api/events', { method: 'POST', body: JSON.stringify({ householdId: id, events: [event] }) }),
  ),
);
const afterBurst = await call(`/api/events?householdId=${id}`);
const kept = burst.filter((e) => afterBurst.body.events.some((s) => s.id === e.id)).length;
if (isLocal && kept < burst.length) {
  warn('8 simultaneous saves', `kept ${kept}/8; netlify dev ignores etag writes, retest on a deploy`);
} else {
  check('8 simultaneous saves all survive', kept === burst.length, `kept ${kept}/8`);
}

// --- bad input must not corrupt the history ------------------------------

const junk = await call('/api/events', {
  method: 'POST',
  body: JSON.stringify({ householdId: id, events: [{ id: 'x', type: 'nonsense' }] }),
});
check('malformed entries are dropped', junk.body.events.length === afterBurst.body.events.length);
check(
  'an unknown family is refused',
  (await call(`/api/events?householdId=${crypto.randomUUID()}`)).status === 404,
);
check('a malformed family id is refused', (await call('/api/events?householdId=abc')).status === 400);

// --- renaming the baby reaches both phones -------------------------------

const renamed = await call('/api/household', {
  method: 'PATCH',
  body: JSON.stringify({ id, babyName: 'Amina' }),
});
check('rename the baby', renamed.body.babyName === 'Amina');
check(
  'the new name is visible to the other phone',
  (await call(`/api/household?code=${joinCode}`)).body.babyName === 'Amina',
);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
