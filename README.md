# Minah — baby tracker for iPhone

A one-thumb daily log for a baby's feeds, sleep and diapers, shared live between
the people looking after them.

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

Nothing needs a signal. Entries are written to the phone first and pushed to the
server when a connection comes back.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL. Sharing stays off until you add the Supabase keys below;
until then everything is stored on the one device.

## Turn on sharing between phones

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql)
   and run it once.
3. Open **Authentication → Sign In / Providers** and enable **Anonymous
   sign-ins**. Nobody has to create a password; the phone gets an invisible
   account that links it to your family.
4. Copy `.env.example` to `.env.local` and fill in the two values from
   **Project Settings → API**:

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

5. Restart `npm run dev`, open the **Family** tab and tap **Create a shared
   space**. You get a 6-character code. Anyone who enters that code on their own
   phone sees the same entries, updating live.

Anything you logged before creating the shared space moves across with you.

## Put it on an iPhone Home Screen

The app has to be served over HTTPS for the Home Screen install to work, so
deploy it first (Vercel, Netlify, Cloudflare Pages — all free for this). Set the
same two `VITE_SUPABASE_*` values as environment variables in the host, then:

```bash
npm run build     # outputs dist/
```

On the iPhone, open the deployed URL in **Safari**, tap the Share button, then
**Add to Home Screen**. It then opens full screen with its own icon and works
offline.

## Notes on the implementation

- `src/lib/store.tsx` is the whole sync engine. Writes go to `localStorage`
  immediately and into an outbox; the outbox is flushed to Supabase on a debounce
  and retried when the app regains focus, comes back online, or every minute.
- Conflicts between two phones are resolved by keeping the entry with the newer
  `updatedAt`. Deletes are soft (`deleted = true`) so a deletion made offline
  still reaches the other phone.
- Realtime `postgres_changes` on `events` is what makes the other parent's taps
  appear without a refresh.
- Row-level security means a phone can only read or write events for a household
  it is actually a member of; joining happens through the `join_household`
  function so join codes can't be listed or brute-forced through the table.
- `npm run icons` regenerates the PNG app icons from `public/favicon.svg`.
