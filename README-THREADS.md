# Threads Mini App setup (development branch)

This implementation is isolated on `threads-development`. The existing Facebook/Messenger page and `main` branch are not changed.

## What is included
- `threads.html` and `threads.js`: Telegram Mini App account list, connect, and switch UI.
- `supabase/functions/threads-auth/index.ts`: Telegram initData validation, Threads OAuth callback, token encryption, and account selection.
- `supabase/migrations/202611080001_threads_multi_account.sql`: private server-side storage tables. The existing `public.threads_accounts` table is not modified.

## Important before deployment
Nothing in this branch is deployed automatically. Do not paste app secrets or bot tokens into GitHub or chat.

The Edge Function expects these Supabase Edge Function secrets:
- `TELEGRAM_BOT_TOKEN` — token for the Telegram bot that opens this Mini App.
- `THREADS_APP_ID` — already added to the Supabase project.
- `THREADS_APP_SECRET` — already added to the Supabase project.
- `THREADS_TOKEN_ENCRYPTION_KEY` — base64 encoding of exactly 32 random bytes.
- `THREADS_SCOPES` — start with `threads_basic`.
- `THREADS_ALLOWED_ORIGIN` — `https://generalboi418.github.io`.
- `THREADS_RETURN_URL` — `https://generalboi418.github.io/generalboi-mini-app/threads.html`.
- `THREADS_REDIRECT_URI` — set to the deployed callback URL only after the function is deployed:
  `https://azzhfdhnzxybtkebvdaq.supabase.co/functions/v1/threads-auth/callback`.

Supabase supplies `SUPABASE_URL` and its server secret keys to Edge Functions. Never expose a Supabase secret key in browser code.

## Deployment sequence (not yet performed)
1. Apply the SQL migration in Supabase SQL Editor.
2. Add the missing Edge Function secrets.
3. Deploy `threads-auth` with JWT verification disabled for this function; the handler verifies Telegram Web App initData itself.
4. Add the exact callback URL above to the Threads OAuth redirect URI settings in Meta and save.
5. Publish the development branch to the hosting target and test inside Telegram.

## Current limitations
This is the first account-linking and account-switching foundation, not a full clone of the Threads mobile app. It does not yet render the Threads feed, create posts, or implement automatic token refresh. Threads API permissions and Meta app access rules still apply; app users without an app role may need App Review approval for requested permissions.
