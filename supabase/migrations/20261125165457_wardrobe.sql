create table public.items (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
  name text not null default 'Untitled item' check (length(trim(name)) between 1 and 160),
  category text not null default '' check (category in ('','Tops','Bottoms','Outerwear','One-piece','Footwear','Accessories')),
  subtype text not null default '', color text not null default '', pattern text not null default '', tags text[] not null default '{}',
  brand text not null default '', material text not null default '', size text not null default '', fit text not null default '',
  season text not null default '', occasion text not null default '',
  availability text not null default 'Available' check (availability in ('Available','In laundry','Packed','Archived')),
  favorite boolean not null default false, status text not null default 'draft'
    check (status in ('draft','queued','running','failed','needs_review','ready')),
  revision integer not null default 1 check (revision > 0), original_path text, cutout_path text, thumbnail_path text,
  error_code text, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'ready' or (category <> '' and cutout_path is not null)), unique(id,owner_id)
);
create index items_owner_created on public.items(owner_id,created_at desc);
create index items_owner_catalog on public.items(owner_id,status,category) where deleted_at is null;
create function public.stamp_item() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end $$;
create trigger item_modified before update on public.items for each row execute function public.stamp_item();

create table public.preferences (
 owner_id uuid primary key default auth.uid() references auth.users on delete cascade, theme text not null default 'system' check(lower(theme) in ('light','dark','system')),
 preferred_colors text[] not null default '{}', style text not null default ''
);
create table public.collections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 name text not null check (length(trim(name)) between 1 and 160), created_at timestamptz not null default now(), unique(id,owner_id),unique(owner_id,name)
);
create table public.collection_items (
 owner_id uuid not null default auth.uid(), collection_id uuid not null, item_id uuid not null,
 primary key(collection_id,item_id), foreign key(collection_id,owner_id) references public.collections(id,owner_id) on delete cascade,
 foreign key(item_id,owner_id) references public.items(id,owner_id) on delete cascade
);
create index collection_items_owner on public.collection_items(owner_id,item_id);

-- Every private table has explicit grants. Browser sessions can change descriptive fields only.
do $grants$ declare t text; begin
 foreach t in array array['items','preferences','collections','collection_items'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant all on public.%I to service_role',t);
   execute format('create policy owner_access on public.%I to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()))',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $grants$;
grant update(name,category,subtype,color,pattern,tags,brand,material,size,fit,season,occasion,availability,favorite)
 on public.items to authenticated;
grant insert,update,delete on public.preferences,public.collections,public.collection_items to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('wardrobe','wardrobe',false,10485760,array['image/jpeg','image/png','image/webp','application/octet-stream'])
 on conflict(id) do update set public=false;
create policy wardrobe_owner_reads on storage.objects for select to authenticated
 using(bucket_id='wardrobe' and (storage.foldername(name))[1]=(select auth.uid())::text);

create table public.photo_requests (
 id uuid not null, owner_id uuid not null references auth.users on delete cascade, item_id uuid not null,
 revision int not null, transform jsonb not null, created_at timestamptz not null default now(),
 retry_count int not null default 0,
 primary key(owner_id,id), unique(owner_id,item_id,revision)
);
create index photo_daily on public.photo_requests(owner_id,created_at);
create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, item_id uuid not null,
 revision int not null, pipeline_version int not null default 1,
 state text not null default 'queued' check(state in ('queued','running','retry_wait','succeeded','failed','cancelled')),
 attempts int not null default 0, lease uuid, due_at timestamptz not null default now(), provider_ref text,error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,item_id,revision,pipeline_version),
 foreign key(item_id,owner_id) references public.items(id,owner_id) on delete cascade
);
create index work_due on public.processing_jobs(due_at) where state in ('queued','retry_wait','running');
alter table public.photo_requests enable row level security;
alter table public.processing_jobs enable row level security;
revoke all on public.photo_requests,public.processing_jobs from public,anon,authenticated;
grant all on public.photo_requests,public.processing_jobs to service_role;

-- Service endpoints pass the authenticated owner after checking the bearer token.
create function public.photo_begin(p_owner uuid,p_request uuid,p_item uuid,p_name text,p_transform jsonb,p_day_limit int,p_item_limit int)
returns public.items language plpgsql set search_path='' as $$
declare prior public.photo_requests; i public.items;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into prior from public.photo_requests where owner_id=p_owner and id=p_request;
 if found then
   select * into strict i from public.items where owner_id=p_owner and id=prior.item_id and revision=prior.revision and deleted_at is null;
   return i;
 end if;
 if (select count(*) from public.photo_requests where owner_id=p_owner and created_at>now()-interval '1 day')>=p_day_limit
 then raise exception 'daily_limit'; end if;
 if p_item is null then
   if (select count(*) from public.items where owner_id=p_owner)>=p_item_limit then raise exception 'item_limit'; end if;
   insert into public.items(owner_id,name) values(p_owner,p_name) returning * into i;
 else
   update public.items set revision=revision+1,status='draft',original_path=null,cutout_path=null,thumbnail_path=null,error_code=null
    where owner_id=p_owner and id=p_item and deleted_at is null returning * into strict i;
   update public.processing_jobs set state='cancelled',lease=null,updated_at=now() where owner_id=p_owner and item_id=i.id and state in ('running','queued','retry_wait');
 end if;
 insert into public.photo_requests(owner_id,id,item_id,revision,transform) values(p_owner,p_request,i.id,i.revision,p_transform);
 return i;
end $$;

create function public.photo_enqueue(p_owner uuid,p_item uuid,p_rev int,p_available boolean,p_retry boolean)
returns public.items language plpgsql set search_path='' as $$
declare i public.items; prefix text;
begin
 select * into strict i from public.items where id=p_item and owner_id=p_owner and revision=p_rev and deleted_at is null for update;
 if i.status in ('queued','running','ready','needs_review') then return i; end if;
 if i.status='failed' and not p_retry then return i; end if;
 prefix := p_owner||'/'||p_item||'/'||p_rev||'/';
 if p_available and p_retry then
  update public.photo_requests set retry_count=retry_count+1 where owner_id=p_owner and item_id=p_item and revision=p_rev and retry_count<5;
  if not found then raise exception 'retry_limit'; end if;
 end if;
 update public.items set original_path=prefix||'original', status=case when p_available then 'queued' else 'failed' end,
  error_code=case when not p_available then 'provider_unconfigured' end where id=p_item returning * into i;
 if p_available then
  insert into public.processing_jobs(owner_id,item_id,revision) values(p_owner,p_item,p_rev)
   on conflict(owner_id,item_id,revision,pipeline_version) do update set state='queued',due_at=now(),lease=null,attempts=0,error_code=null,updated_at=now()
    where processing_jobs.state in ('failed','cancelled');
 end if;
 return i;
end $$;

create function public.photo_claim() returns setof public.processing_jobs language plpgsql set search_path='' as $$
declare j public.processing_jobs;
begin
 select * into j from public.processing_jobs where state in ('queued','retry_wait','running') and due_at<=now()
 order by due_at for update skip locked limit 1;
 if not found then return; end if;
 if not exists(select from public.items where id=j.item_id and owner_id=j.owner_id and revision=j.revision and deleted_at is null and status in ('running','queued'))
 then update public.processing_jobs set state='cancelled',lease=null,updated_at=now() where id=j.id; return; end if;
 if j.attempts>=4 then
  update public.processing_jobs set state='failed',error_code='lease_expired',lease=null,updated_at=now() where id=j.id;
  update public.items set status='failed',error_code='lease_expired' where id=j.item_id and owner_id=j.owner_id and revision=j.revision and deleted_at is null;
  return;
 end if;
 update public.processing_jobs set state='running',lease=gen_random_uuid(),attempts=attempts+1,due_at=now()+interval '4 minutes',updated_at=now() where id=j.id returning * into j;
 update public.items set status='running' where id=j.item_id and owner_id=j.owner_id and revision=j.revision and deleted_at is null;
 return next j;
end $$;

create function public.photo_finish(p_job uuid,p_lease uuid,p_error text,p_delay int,p_ref text)
returns void language plpgsql set search_path='' as $$
declare j public.processing_jobs; i public.items; prefix text; new_state text;
begin
 -- Lock item before job to match edits and keep a replacement authoritative.
 select i0.* into i from public.items i0 join public.processing_jobs job on job.item_id=i0.id and job.owner_id=i0.owner_id where job.id=p_job for update of i0;
 select * into j from public.processing_jobs where id=p_job and lease=p_lease and state='running' for update;
 if not found then return; end if;
 if i.id is null or i.deleted_at is not null or i.revision<>j.revision then new_state:='cancelled';
 elsif p_error is null then
   prefix:=j.owner_id||'/'||j.item_id||'/'||j.revision||'/';
   update public.items set status='needs_review',cutout_path=prefix||'cutout.png',thumbnail_path=prefix||'thumb.webp',error_code=null where id=i.id;
   new_state:='succeeded';
 else
   new_state:=case when p_delay is not null and j.attempts<4 then 'retry_wait' else 'failed' end;
   update public.items set status=case when new_state='failed' then 'failed' else 'queued' end,error_code=p_error where id=i.id;
 end if;
 update public.processing_jobs set state=new_state,error_code=p_error,lease=null,provider_ref=coalesce(p_ref,provider_ref),
   due_at=now()+make_interval(secs=>greatest(coalesce(p_delay,0),0)),updated_at=now() where id=j.id;
end $$;

create function public.photo_manage(p_owner uuid,p_item uuid,p_rev int,p_action text,p_category text,p_name text)
returns void language plpgsql set search_path='' as $$
declare i public.items;
begin
 select * into strict i from public.items where id=p_item and owner_id=p_owner and revision=p_rev for update;
 if p_action='save' and i.deleted_at is null and i.status in ('needs_review','ready') then
   update public.items set status='ready',name=coalesce(p_name,name),category=coalesce(p_category,category) where id=i.id;
 elsif p_action='trash' then
   update public.items set deleted_at=coalesce(deleted_at,now()),status=case when status in ('running','queued') then 'failed' else status end,
    error_code=case when status in ('running','queued') then 'cancelled' else error_code end where id=i.id;
   update public.processing_jobs set state='cancelled',lease=null,updated_at=now() where item_id=i.id and state in ('queued','retry_wait','running');
 elsif p_action='restore' then update public.items set deleted_at=null where id=i.id;
 elsif p_action='purge' and i.deleted_at is not null then delete from public.items where id=i.id;
 else raise exception 'invalid_state'; end if;
end $$;

-- Orphan enumeration only. Object deletion is done with the Storage API and retried by the worker.
create function public.photo_orphans() returns table(path text) language sql set search_path='' as $$
 select s.name from storage.objects s where s.bucket_id='wardrobe' and s.created_at < now()-interval '3 hours'
 and not exists(select from public.items i where split_part(s.name,'/',2)=i.id::text and split_part(s.name,'/',1)=i.owner_id::text
  and split_part(s.name,'/',3)=i.revision::text) order by s.created_at limit 100;
$$;
do $access$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('photo_begin','photo_enqueue','photo_claim','photo_finish','photo_manage','photo_orphans') loop
   execute format('revoke all on function %s from public,anon,authenticated',f);
   execute format('grant execute on function %s to service_role',f);
 end loop;
end $access$;
