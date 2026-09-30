# Minah — baby tracker for iPhone

**Live: [minah-baby.netlify.app](https://minah-baby.netlify.app)**

A one-thumb daily log for a baby's feeds, sleep and diapers, kept on a server so
both parents see the same history from their own phones.

Every button asks the same question before saving: **is this happening now, or
did it already happen?** One tap logs it at the current time, a second tap picks
a time you already missed.

Minah is an installable web app, so it runs on an iPhone Home Screen like a
normal app without a Mac, Xcode or an Apple Developer account.

## How it works day to day

- **Feed** — tap, choose now or earlier, optionally record bottle / breast /
  solid and an amount.
- **Sleep** — tap when the baby falls asleep. The Home Screen then shows a live
  stopwatch, and the Sleep button turns into **Wake up**. Tapping it closes the
  session and stores the duration.
- **Diaper** — wet, dirty or both.
- **Note** — anything else: medicine, temperature, mood.
- **History** — every day, grouped, with per-day totals. Tap any entry to fix
  its time or delete it.

## Sharing between two phones

On the **Family** tab, tap **Start our family**. That creates the household on
the server and gives you a link to send to the other parent. When they open the
link on their iPhone they join automatically — no account, no password, nothing
to type. There is also an 8-character code as a fallback.

Anything logged before starting the family is carried onto the server with you.

Entries are saved on the phone first, so the app keeps working with no signal and
sends everything up when the connection returns. While the app is open it checks
for the other phone's entries every 15 seconds, and immediately whenever you
switch back to it.

## Put it on an iPhone Home Screen

Open [minah-baby.netlify.app](https://minah-baby.netlify.app) in **Safari** — it
has to be Safari, not Chrome — then tap the Share button and choose **Add to Home
Screen**.

## Running it locally

The app needs its serverless functions, so use `netlify dev` rather than
`npm run dev`:

```bash
npm install
netlify dev        # http://localhost:8888
```

## Deploying

```bash
npm run build
netlify deploy --prod --dir dist
```

## Tests

```bash
npm run test:api                                        # against netlify dev
MINAH_BASE=https://minah-baby.netlify.app npm run test:api
```

`netlify dev` does not enforce conditional writes, so the "8 simultaneous saves"
check only proves anything against a real deploy; locally it downgrades to a
warning.

## Notes on the implementation

- `netlify/functions/api.mts` is the entire server: four endpoints over
  [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
  No database to provision and no third-party account.
- A household id (a UUID) is the secret that grants access to its entries. The
  8-character join code exists only so it can be typed or put in a link, and it
  is claimed atomically with `onlyIfNew` so two families can never share one.
- Saving an entry does a read-merge-write against the household's blob using
  `onlyIfMatch` with the current etag, retrying on a lost race. That is what
  stops a save from one phone silently discarding a save from the other.
- Conflicting edits of the same entry resolve to the newer `updatedAt`. Deletes
  are soft, so a deletion made offline still reaches the other phone.
- `src/lib/store.tsx` holds the client sync loop. One request both sends queued
  changes and returns the household's full history, so a single round trip
  converges both phones.
- Incoming data is validated server-side and anything malformed is dropped
  rather than stored.
- `npm run icons` regenerates the PNG app icons from `public/favicon.svg`.

## Known limits

- There is no rate limiting on guessing join codes. 8 characters from a
  31-letter alphabet is about 850 billion combinations, which is ample here, but
  it is not a defence against a determined attacker.
- Anyone holding the link can read and write the family's entries. That is the
  intended trade-off for having no passwords.
