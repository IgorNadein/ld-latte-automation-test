-- Real PostgreSQL RLS integration test; run after bootstrap + production schema.
-- The authenticated role is NOT the table owner: RLS is actually enforced.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

insert into public.automation_requests (title,description,category)
values ('Задача пользователя A','Тест RLS','Бот');

do $$
begin
  if (select count(*) from public.automation_requests) <> 1 then
    raise exception 'A must see exactly one own record';
  end if;
  raise notice 'PASS user A sees own row';
end $$;

-- User B must not see or modify A's data, even when asking by its known title.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $$
declare n integer;
begin
  if (select count(*) from public.automation_requests) <> 0 then
    raise exception 'RLS leaked A rows to B';
  end if;
  update public.automation_requests set title='Скомпрометировано'
  where title='Задача пользователя A';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'B modified an A row';
  end if;
  raise notice 'PASS B cannot SELECT or UPDATE A rows';
end $$;

-- Explicit owner forgery is prevented by WITH CHECK.
do $$
begin
  insert into public.automation_requests (owner_id,title,description,category)
  values ('11111111-1111-4111-8111-111111111111','Подделка','Попытка от B','Бот');
  raise exception 'Forgery should have been rejected';
exception when insufficient_privilege then
  raise notice 'PASS forged owner rejected by insert policy';
end $$;

-- New request must be in Новая status, enforced on server, not just front-end.
do $$
begin
  insert into public.automation_requests(title,description,category,status)
  values ('Плохой старт','Статус вне правил','Отчёт','Завершена');
  raise exception 'Non-new creation should have been rejected';
exception when insufficient_privilege then
  raise notice 'PASS invalid initial status rejected';
end $$;

-- User B may still manage its OWN requests.
insert into public.automation_requests(title,description,category)
values ('Задача пользователя B','Тест изоляции','Интеграция');
update public.automation_requests set status='В работе'
where title='Задача пользователя B';
do $$
begin
  if (select count(*) from public.automation_requests where status='В работе') <> 1 then
    raise exception 'B cannot edit own request';
  end if;
  if (select count(*) from public.automation_requests) <> 1 then
    raise exception 'B can see unexpected row';
  end if;
  raise notice 'PASS B can update own row and remains isolated';
end $$;

-- Switching back to A hides B's row.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$
begin
  if (select count(*) from public.automation_requests) <> 1 then
    raise exception 'A has access to B row';
  end if;
  if (select count(*) from public.automation_requests where title='Задача пользователя A') <> 1 then
    raise exception 'User A own row changed';
  end if;
  raise notice 'PASS A cannot see B rows';
end $$;

-- Unauthorized delete is forbidden (no privileges/policy).
do $$
begin
  delete from public.automation_requests where title='Задача пользователя A';
  raise exception 'Delete should have been rejected';
exception when insufficient_privilege then
  raise notice 'PASS DELETE unavailable to end user';
end $$;
reset role;

-- The anonymous role can read the public sample services, but not edit them.
set role anon;
do $$
begin
  if (select count(*) from public.services) <> 9 then
    raise exception 'Services public catalog unavailable';
  end if;
  raise notice 'PASS anon can read service catalog';
end $$;
do $$
begin
  insert into public.services(name,active) values ('Нелегальная услуга',true);
  raise exception 'Anon should never change service catalog';
exception when insufficient_privilege then
  raise notice 'PASS anon cannot mutate service catalog';
end $$;
reset role;
