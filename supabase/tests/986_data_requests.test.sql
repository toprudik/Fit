-- "Запрос о моих данных", migration 20261020190517_data_requests.sql (152-FZ arts. 20, 21): the request type,
-- the 10-working-day deadline, the one 5-day extension with a reason, and the bot message about it.
begin;
\ir _helpers.psql
select plan(21);

select tests.create_user('client_c');
select tests.create_user('client_d');
select tests.create_admin('admin_a');

-- Working days: Monday 19.10.2026 + 10 is Monday 2.11; Friday 23.10 + 1 is Monday 26.10.
select is(private.add_working_days('2026-10-19', 10), '2026-11-02'::date, 'data requests: 10 working days skip the weekends');
select is(private.add_working_days('2026-10-23', 1), '2026-10-26'::date, 'data requests: the day after a Friday is Monday');
select is(private.add_working_days('2026-11-02', 5), '2026-11-09'::date, 'data requests: the extension adds 5 working days');

select private.add_working_days((now() at time zone 'Europe/Moscow')::date, 10) as due,
       private.add_working_days((now() at time zone 'Europe/Moscow')::date, 3) as due_publication,
       private.add_working_days(private.add_working_days((now() at time zone 'Europe/Moscow')::date, 10), 5) as extended
\gset

select tests.authenticate_as('client_c');
insert into public.feedback (id, user_id, kind, body, request_type)
values ('00000000-0000-4000-8000-0000000d0001', auth.uid(), 'data_request', 'Какие данные обо мне есть?', 'access');
select is(
  (select due_on from public.feedback where id = '00000000-0000-4000-8000-0000000d0001'),
  :'due'::date,
  'data requests: the deadline is 10 working days from the day the request came'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body) values (auth.uid(), 'data_request', 'Без типа') $$,
  '23514', null, 'data requests: a data request says what it asks for'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body, request_type) values (auth.uid(), 'bug', 'Кнопка серая', 'access') $$,
  '23514', null, 'data requests: other feedback has no request type'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body, request_type, due_on)
     values (auth.uid(), 'data_request', 'Свой срок', 'stop', '2030-01-01') $$,
  '42501', null, 'data requests: the author does not set the deadline'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body, request_type) values (auth.uid(), 'data_request', 'Отзываю', 'withdraw') $$,
  '23514', null, 'data requests: withdrawing a consent names which one'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body, request_type, consent_kind)
     values (auth.uid(), 'data_request', 'Удалите всё', 'deletion', 'health') $$,
  '23514', null, 'data requests: only a withdrawal names a consent'
);
select throws_ok(
  $$ insert into public.feedback (user_id, kind, body, consent_kind) values (auth.uid(), 'bug', 'Кнопка', 'health') $$,
  '23514', null, 'data requests: other feedback names no consent'
);
insert into public.feedback (id, user_id, kind, body, request_type, consent_kind)
values ('00000000-0000-4000-8000-0000000d0002', auth.uid(), 'data_request', 'Уберите витрину', 'withdraw', 'publication');
select is(
  (select due_on from public.feedback where id = '00000000-0000-4000-8000-0000000d0002'),
  :'due_publication'::date,
  'data requests: publishing stops within 3 working days of the withdrawal (art. 10.1 part 12)'
);
insert into public.feedback (user_id, kind, body) values (auth.uid(), 'bug', 'Кнопка серая');
select is(
  (select due_on from public.feedback where kind = 'bug' and user_id = auth.uid()), null,
  'data requests: other feedback has no deadline'
);
select throws_ok(
  $$ select public.admin_extend_data_request('00000000-0000-4000-8000-0000000d0001', 'Нужно больше времени') $$,
  '42501', 'forbidden', 'data requests: only an admin extends the deadline'
);

select tests.authenticate_as('admin_a');
select throws_ok(
  $$ select public.admin_extend_data_request('00000000-0000-4000-8000-0000000d0001', '  ') $$,
  '22023', 'invalid_reason', 'data requests: an extension needs a reason'
);
select is(
  public.admin_extend_data_request('00000000-0000-4000-8000-0000000d0001', 'Собираем выгрузку из резервной копии'),
  :'extended'::date,
  'data requests: the admin extends the deadline by 5 working days'
);
select throws_ok(
  $$ select public.admin_extend_data_request('00000000-0000-4000-8000-0000000d0001', 'Ещё раз') $$,
  'P0001', 'already_extended', 'data requests: the deadline is extended once'
);
select throws_ok(
  $$ select public.admin_extend_data_request('00000000-0000-4000-8000-0000000d0002', 'Нужно больше времени') $$,
  'P0001', 'not_extendable', 'data requests: the 3 days to stop publishing are not extended'
);
select throws_ok(
  $$ select public.admin_extend_data_request((select id from public.feedback where kind = 'bug' limit 1), 'Причина') $$,
  'P0002', 'not_found', 'data requests: other feedback has no deadline to extend'
);

select tests.clear_authentication();
select is(
  (select payload->>'event' || ':' || (payload->>'kind') || ':' || (payload->>'reply')
   from public.notification_outbox where user_id = tests.user_id('client_c') and type = 'feedback_reply'),
  'extended:data_request:Собираем выгрузку из резервной копии',
  'data requests: the author gets the reason and the new date from the bot'
);
select is(
  (select count(*)::int from public.admin_audit_log where action = 'feedback.extend'), 1,
  'data requests: the extension is in the audit log'
);

select tests.authenticate_as('client_d');
select is(
  (select count(*)::int from public.feedback where id = '00000000-0000-4000-8000-0000000d0001'), 0,
  'data requests: nobody else reads the request'
);

select * from finish();
rollback;
