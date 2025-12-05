-- Create Highscores Table
create table if not exists public.highscores (
  id uuid default gen_random_uuid() primary key,
  player_name text not null,
  score integer not null,
  distance integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.highscores enable row level security;

-- Create Policy: Allow anyone to read highscores
create policy "Anyone can view highscores"
  on public.highscores for select
  using ( true );

-- Create Policy: Allow anyone to insert highscores (for now, until we have proper auth)
create policy "Anyone can insert highscores"
  on public.highscores for insert
  with check ( true );

-- Create Index for faster leaderboard queries
create index if not exists highscores_score_idx on public.highscores (score desc);
