alter table public.preferences
 add column layers boolean not null default false,
 add column favorites boolean not null default true;
