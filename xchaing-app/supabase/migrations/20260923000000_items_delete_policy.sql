alter table public.items enable row level security;

drop policy if exists "Authenticated users can delete their own items" on public.items;

create policy "Authenticated users can delete their own items"
on public.items
for delete
to authenticated
using (auth.uid() = user_id);
