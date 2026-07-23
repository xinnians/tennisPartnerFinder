-- Hosted rollout must provision these Vault secrets before enabling dispatch:
-- notification_project_url, notification_publishable_key, notification_cron_secret.
-- The migration only schedules the job; it never stores environment secrets.

create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id integer;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'dispatch-notification-outbox'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'dispatch-notification-outbox',
    '* * * * *',
    $notification_cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'notification_project_url') || '/functions/v1/notification-outbox-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'notification_publishable_key'),
          'x-notification-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notification_cron_secret')
        ),
        body := jsonb_build_object('scheduled_at', now())
      );
    $notification_cron$
  );
end;
$$;
