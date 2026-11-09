-- Threads account storage for the Telegram Mini App.
-- Existing public.threads_accounts table is intentionally left untouched.

create table if not exists public.telegram_threads_oauth_states (
  state_hash text primary key,
  telegram_user_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telegram_threads_oauth_states_expiry_idx
  on public.telegram_threads_oauth_states (expires_at);

create table if not exists public.telegram_threads_accounts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  threads_user_id text not null,
  username text,
  encrypted_access_token text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (telegram_user_id, threads_user_id),
  unique (id, telegram_user_id)
);

create index if not exists telegram_threads_accounts_owner_idx
  on public.telegram_threads_accounts (telegram_user_id, created_at);

create table if not exists public.telegram_threads_account_preferences (
  telegram_user_id text primary key,
  active_account_id uuid,
  updated_at timestamptz not null default now(),
  constraint telegram_threads_active_account_owner_fk
    foreign key (active_account_id, telegram_user_id)
    references public.telegram_threads_accounts (id, telegram_user_id)
    on delete set null
);

alter table public.telegram_threads_oauth_states enable row level security;
alter table public.telegram_threads_accounts enable row level security;
alter table public.telegram_threads_account_preferences enable row level security;

-- No browser policies are created. The Edge Function accesses these tables
-- server-side with the Supabase service-role key, which bypasses RLS.