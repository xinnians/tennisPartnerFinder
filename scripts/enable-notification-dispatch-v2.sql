-- Hosted operation, after canary receipt, deep-link, and sign-out acceptance.
-- Keep legacy delivery active for subscriptions that have not migrated.
begin;
do $$ begin
  if not exists (
    select 1 from private.notification_runtime_control
    where singleton_id = 1 and new_runtime_mode in ('canary', 'enabled')
      and dispatch_enabled and worker_generation = 1 and legacy_writes_enabled
      and worker_lease_duration = interval '120 seconds'
      and request_deadline_duration = interval '10 seconds'
      and delivery_lease_duration = interval '30 seconds'
      and max_delivery_attempts = 3 and push_ttl_safety_budget = interval '1 second'
  ) then raise exception 'V2_RUNTIME_NOT_READY'; end if;
  if (select count(*) from vault.decrypted_secrets
      where name in ('notification_project_url', 'notification_publishable_key', 'notification_cron_secret')
        and length(decrypted_secret) > 0) <> 3
  then raise exception 'V2_CRON_CONFIGURATION_MISSING'; end if;
end $$;

select cron.schedule(
  'dispatch-notification-outbox-v2', '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'notification_project_url')
        || '/functions/v1/notification-outbox-dispatch-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'notification_publishable_key'),
        'x-notification-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notification_cron_secret')
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 90000
    );
  $job$
);
update private.notification_runtime_control
set new_runtime_mode = 'enabled', updated_at = now()
where singleton_id = 1;
commit;
