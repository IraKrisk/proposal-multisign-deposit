-- Proposal Generator — database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- profiles: per-user branding, created automatically on signup
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null default '',
  company_name      text not null default '',
  logo_url          text,
  default_currency  text not null default 'EUR',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Who may use the dashboard at all. Client accounts are created automatically
-- when a proposal is sent, and they get a profile row like anybody else, so the
-- default has to be false: only an explicit update lets somebody in.
alter table public.profiles
  add column if not exists is_owner boolean not null default false;

-- The owner's own signature, remembered from the last proposal they set it on
-- so the next one starts with it already chosen.
alter table public.profiles add column if not exists signature_font text;
alter table public.profiles add column if not exists signature_image text;

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are self-writable" on public.profiles;
create policy "profiles are self-writable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles are self-insertable" on public.profiles;
create policy "profiles are self-insertable"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.proposal_status as enum
    ('draft', 'sent', 'viewed', 'signed', 'paid', 'declined');
exception when duplicate_object then null;
end $$;

-- Drafting runs in a background job, because the model call takes longer than
-- a serverless function is allowed to run. A proposal exists from the moment
-- it is created and moves 'drafting' -> 'draft', or -> 'draft_failed'.
alter type public.proposal_status add value if not exists 'drafting';
alter type public.proposal_status add value if not exists 'draft_failed';

create table if not exists public.proposals (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  -- Public URL segment. Unguessable: 22 chars of base62 from the app layer.
  slug             text not null unique,
  title            text not null default 'Untitled proposal',
  status           public.proposal_status not null default 'draft',
  -- Full ProposalContent object. See lib/types.ts.
  content          jsonb not null default '{}'::jsonb,
  -- The brief the user typed, kept so a proposal can be regenerated.
  brief            text not null default '',
  -- Why the background drafting job failed. Only set when status is
  -- 'draft_failed'; cleared on a successful retry.
  draft_error      text,
  first_viewed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- `create table if not exists` above is a no-op on an existing database, so
-- columns added after the first release need their own statement.
alter table public.proposals add column if not exists draft_error text;

-- Declining. A signer can refuse a proposal instead of signing it, and the
-- owner needs to see who refused and why, so the reason lives on the row
-- rather than only in the notification email.
alter table public.proposals add column if not exists declined_at timestamptz;
alter table public.proposals add column if not exists declined_by_name text;
alter table public.proposals add column if not exists declined_by_email text;
alter table public.proposals add column if not exists decline_reason text;

create index if not exists proposals_owner_created_idx
  on public.proposals (owner_id, created_at desc);

alter table public.proposals enable row level security;

-- Owners see and manage only their own proposals. The public proposal page
-- reads through the service-role client in a route handler, so there is
-- deliberately no anon policy here.
drop policy if exists "owners read own proposals" on public.proposals;
create policy "owners read own proposals"
  on public.proposals for select
  using (auth.uid() = owner_id);

drop policy if exists "owners insert own proposals" on public.proposals;
create policy "owners insert own proposals"
  on public.proposals for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owners update own proposals" on public.proposals;
create policy "owners update own proposals"
  on public.proposals for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "owners delete own proposals" on public.proposals;
create policy "owners delete own proposals"
  on public.proposals for delete
  using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- signatures — the legal audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.signatures (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.proposals(id) on delete cascade,
  signer_name   text not null,
  signer_email  text not null,
  signer_title  text not null default '',
  signature_font text,
  signature_image text,
  signature_initials text,
  -- SHA-256 of the exact content the signer saw. Proves what was agreed to.
  content_hash  text not null,
  ip_address    text,
  user_agent    text,
  signed_at     timestamptz not null default now()
);

-- Which script face the signer chose, and, when they drew or uploaded one
-- instead, the image itself as a data URL. Stored so an old signature keeps
-- rendering the way it was signed, even if the choices on offer change.
alter table public.signatures
  add column if not exists signature_font text;
alter table public.signatures
  add column if not exists signature_image text;
alter table public.signatures
  add column if not exists signature_initials text;

-- A proposal can name several signers, so one signature per proposal is no
-- longer right. One signature per person per proposal is: it still stops a
-- double submit from writing twice, without stopping the second signer.
drop index if exists public.signatures_one_per_proposal;

create unique index if not exists signatures_one_per_signer
  on public.signatures (proposal_id, lower(signer_email));

alter table public.signatures enable row level security;

drop policy if exists "owners read signatures on own proposals" on public.signatures;
create policy "owners read signatures on own proposals"
  on public.signatures for select
  using (
    exists (
      select 1 from public.proposals p
      where p.id = signatures.proposal_id and p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  proposal_id               uuid not null references public.proposals(id) on delete cascade,
  stripe_session_id         text not null unique,
  stripe_payment_intent_id  text,
  amount                    integer not null,
  currency                  text not null default 'USD',
  status                    public.payment_status not null default 'pending',
  created_at                timestamptz not null default now(),
  paid_at                   timestamptz
);

-- The last signer on a proposal with money owed does not get their signature
-- recorded when they press the button: it is parked here and written only once
-- the payment lands, so a cancelled checkout leaves no signature behind.
alter table public.payments
  add column if not exists pending_signature jsonb;

create index if not exists payments_proposal_idx
  on public.payments (proposal_id);

alter table public.payments enable row level security;

drop policy if exists "owners read payments on own proposals" on public.payments;
create policy "owners read payments on own proposals"
  on public.payments for select
  using (
    exists (
      select 1 from public.proposals p
      where p.id = payments.proposal_id and p.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists proposals_touch_updated_at on public.proposals;
create trigger proposals_touch_updated_at
  before update on public.proposals
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
