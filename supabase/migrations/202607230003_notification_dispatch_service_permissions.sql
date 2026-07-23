-- Browser roles remain fully denied from notification_outbox. The Edge
-- Function uses service_role only for the minimal dispatch operations.

grant select, update on table public.notification_outbox to service_role;
grant select, delete on table public.push_subscriptions to service_role;
