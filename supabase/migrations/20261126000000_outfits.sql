create table public.outfits (
  id uuid primary key,
  owner_id uuid not null references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 120),
  occasion text not null default '' check (length(occasion)<=80),
  notes text not null default '' check (length(notes)<=2000),
  favorite boolean not null default false,
  status text not null check (status in ('draft','saved')),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (id,owner_id)
);
create table public.outfit_items (
  outfit_id uuid not null,
  owner_id uuid not null,
  slot text not null check (slot in ('Top','Bottom','One-piece','Footwear','Outerwear','Glasses','Watch','Accessory','Accessory 2')),
  item_id uuid,
  locked boolean not null default false,
  primary key (outfit_id,slot),
  unique (outfit_id,item_id),
  foreign key (outfit_id,owner_id) references public.outfits(id,owner_id) on delete cascade,
  foreign key (item_id,owner_id) references public.items(id,owner_id) on delete set null (item_id)
);
create table public.outfit_feedback (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  signature text not null check (length(signature) between 1 and 350),
  rating integer not null check (rating in (-1,1)),
  primary key(owner_id,signature)
);
create index outfits_owner_updated on public.outfits(owner_id,updated_at desc);
create index outfit_items_owner_item on public.outfit_items(owner_id,item_id);
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.outfit_feedback enable row level security;
revoke all on public.outfits,public.outfit_items,public.outfit_feedback from public,anon,authenticated;
grant select,delete on public.outfits to authenticated;
grant select on public.outfit_items to authenticated;
grant select,insert,update,delete on public.outfit_feedback to authenticated;
create policy read_own_outfits on public.outfits for select to authenticated using (owner_id=(select auth.uid()));
create policy delete_own_outfits on public.outfits for delete to authenticated using (owner_id=(select auth.uid()));
create policy read_own_slots on public.outfit_items for select to authenticated using (owner_id=(select auth.uid()));
create policy own_outfit_feedback on public.outfit_feedback for all to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));

-- The only write path for outfit edits. Validate the caller, relationships and
-- optimistic version together; either the entire board changes or none of it.
create schema if not exists drapedeck_private;
revoke all on schema drapedeck_private from public;
grant usage on schema drapedeck_private to authenticated;
create function drapedeck_private.save_outfit(p_id uuid,p_version integer,p_name text,p_occasion text,p_notes text,p_favorite boolean,p_status text,p_slots jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
  account uuid := auth.uid();
  next_version integer;
  pieces record;
  garment public.items%rowtype;
  retained boolean;
begin
  if account is null or p_id is null or p_version is null or p_slots is null or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots)>9 then
    raise exception 'Invalid outfit';
  end if;
  if p_version=0 then
    insert into public.outfits(id,owner_id,name,occasion,notes,favorite,status)
    values(p_id,account,trim(p_name),trim(p_occasion),p_notes,p_favorite,p_status) on conflict(id) do nothing returning version into next_version;
  else
    update public.outfits set name=trim(p_name),occasion=trim(p_occasion),notes=p_notes,favorite=p_favorite,status=p_status,
           version=version+1,updated_at=now()
    where id=p_id and owner_id=account and version=p_version returning version into next_version;
  end if;
  if next_version is null then raise exception 'This outfit changed. Reopen the latest version.'; end if;
  if exists(select 1 from jsonb_array_elements(p_slots) x where x->>'slot'='One-piece') and
     exists(select 1 from jsonb_array_elements(p_slots) x where x->>'slot' in ('Top','Bottom')) then raise exception 'Choose one base outfit structure'; end if;
  if p_status='saved' and jsonb_array_length(p_slots)=0 then raise exception 'Add an item before saving a look'; end if;
  for pieces in select * from jsonb_to_recordset(p_slots) as x(slot text,item_id uuid,locked boolean) loop
    select exists(select 1 from public.outfit_items oi where oi.owner_id=account and oi.outfit_id=p_id and oi.slot=pieces.slot
      and oi.item_id is not distinct from pieces.item_id) into retained;
    if pieces.item_id is null then
      if not retained then raise exception 'An item is missing'; end if;
      continue;
    end if;
    select * into garment from public.items where id=pieces.item_id and owner_id=account for share;
    if not found then raise exception 'Item unavailable'; end if;
    -- Previously selected items may remain as unavailable placeholders until replaced.
    if retained then continue; end if;
    if garment.deleted_at is not null or lower(garment.availability)<>'available' or garment.status<>'ready' then raise exception 'Item unavailable'; end if;
    if not coalesce(case garment.category
      when 'Tops' then pieces.slot='Top'
      when 'Bottoms' then pieces.slot='Bottom'
      when 'One-piece' then pieces.slot='One-piece'
      when 'Footwear' then pieces.slot='Footwear'
      when 'Outerwear' then pieces.slot='Outerwear'
      when 'Accessories' then case when lower(garment.subtype) in ('glasses','sunglasses','eyeglasses') then pieces.slot='Glasses'
        when lower(garment.subtype) in ('watch','watches') then pieces.slot='Watch' else pieces.slot in ('Accessory','Accessory 2') end
      else false end,false) then raise exception 'Item incompatible with slot'; end if;
  end loop;
  delete from public.outfit_items where outfit_id=p_id and owner_id=account;
  insert into public.outfit_items(outfit_id,owner_id,slot,item_id,locked)
  select p_id,account,x.slot,x.item_id,x.locked from jsonb_to_recordset(p_slots) as x(slot text,item_id uuid,locked boolean);
  return next_version;
end;
$$;
revoke all on function drapedeck_private.save_outfit(uuid,integer,text,text,text,boolean,text,jsonb) from public,anon;
grant execute on function drapedeck_private.save_outfit(uuid,integer,text,text,text,boolean,text,jsonb) to authenticated;
create function public.save_outfit(p_id uuid,p_version integer,p_name text,p_occasion text,p_notes text,p_favorite boolean,p_status text,p_slots jsonb)
returns integer language sql security invoker set search_path='' as $$
 select drapedeck_private.save_outfit(p_id,p_version,p_name,p_occasion,p_notes,p_favorite,p_status,p_slots);
$$;
revoke all on function public.save_outfit(uuid,integer,text,text,text,boolean,text,jsonb) from public,anon;
grant execute on function public.save_outfit(uuid,integer,text,text,text,boolean,text,jsonb) to authenticated;
