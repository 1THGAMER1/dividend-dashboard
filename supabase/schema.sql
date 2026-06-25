-- Profiles Tabelle: speichert die Parqet Client ID pro Nutzer
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  parqet_client_id text,
  created_at    timestamptz default now()
);

-- Row Level Security aktivieren
alter table public.profiles enable row level security;

-- Jeder Nutzer kann nur seine eigenen Daten lesen
create policy "Eigenes Profil lesen"
  on public.profiles for select
  using (auth.uid() = id);

-- Jeder Nutzer kann nur sein eigenes Profil schreiben
create policy "Eigenes Profil schreiben"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Eigenes Profil aktualisieren"
  on public.profiles for update
  using (auth.uid() = id);

-- ISIN -> Ticker Cache (geteilt, kein RLS noetig da keine privaten Daten)
create table if not exists public.isin_ticker_cache (
  isin        text primary key,
  ticker      text,
  updated_at  timestamptz default now()
);

alter table public.isin_ticker_cache enable row level security;

-- Jeder eingeloggte Nutzer darf lesen
create policy "Cache lesen"
  on public.isin_ticker_cache for select
  to authenticated
  using (true);

-- Jeder eingeloggte Nutzer darf upserten
create policy "Cache schreiben"
  on public.isin_ticker_cache for insert
  to authenticated
  with check (true);

create policy "Cache aktualisieren"
  on public.isin_ticker_cache for update
  to authenticated
  using (true);
