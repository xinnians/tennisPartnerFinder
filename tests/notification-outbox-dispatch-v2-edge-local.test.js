import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadLocalSupabaseConfig } from "./fixtures/localSupabaseConfig.js";

const PROVIDER_ORIGIN = "https://push-fixture.qiuka.tw";
const RUN_LOCAL_EDGE_TEST = process.env.RUN_LOCAL_NOTIFICATION_OUTBOX_DISPATCH_V2_EDGE_TEST === "1";
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_CLI = path.join(REPOSITORY_ROOT, "node_modules", "supabase", "dist", "supabase.js");
const STARTUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 90_000;
const TEST_GENERATION = "9223372036854775000";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function localDatabaseContainerId() {
  const containers = spawnSync(
    "docker",
    ["ps", "--filter", `label=com.supabase.cli.workdir=${REPOSITORY_ROOT}`, "--format", "{{.ID}} {{.Names}}"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 }
  );
  if (containers.error || containers.status !== 0) throw new Error("Unable to locate the local database container.");
  for (const line of containers.stdout.split(/\r?\n/u)) {
    const [id, name] = line.trim().split(/\s+/u);
    if (id && name?.startsWith("supabase_db_")) return id;
  }
  throw new Error("The local Supabase database container is not running.");
}

function runLocalDatabaseSql(sql, { allowFailure = false } = {}) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", localDatabaseContainerId(), "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    { encoding: "utf8", input: sql, maxBuffer: 1024 * 1024 }
  );
  if (!allowFailure && (result.error || result.status !== 0)) {
    const detail = result.stderr.trim().split(/\r?\n/u).slice(-2).join(" ");
    throw new Error(`The local dispatcher v2 database fixture command failed: ${detail || "unknown psql error"}`);
  }
  return result;
}

function sqlLiteral(value) {
  return value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function runtimeControlSnapshot() {
  const result = runLocalDatabaseSql(`
    select pg_catalog.json_build_object(
      'workerGeneration', worker_generation::text,
      'dispatchEnabled', dispatch_enabled,
      'newRuntimeMode', new_runtime_mode,
      'legacyWritesEnabled', legacy_writes_enabled,
      'legacyOutboxHandled', legacy_outbox_handled,
      'legacyCutoffAt', legacy_cutoff_at::text,
      'workerLease', worker_lease_duration::text,
      'requestDeadline', request_deadline_duration::text,
      'deliveryLease', delivery_lease_duration::text,
      'maxAttempts', max_delivery_attempts,
      'ttlBudget', push_ttl_safety_budget::text,
      'updatedAt', updated_at::text
    )::text
    from private.notification_runtime_control
    where singleton_id = 1;
  `);
  return JSON.parse(result.stdout.trim());
}

function restoreRuntimeControl(snapshot) {
  runLocalDatabaseSql(`
    update private.notification_runtime_control
    set worker_generation = ${snapshot.workerGeneration}::bigint,
        dispatch_enabled = ${snapshot.dispatchEnabled ? "true" : "false"},
        new_runtime_mode = ${sqlLiteral(snapshot.newRuntimeMode)},
        legacy_writes_enabled = ${snapshot.legacyWritesEnabled ? "true" : "false"},
        legacy_outbox_handled = ${snapshot.legacyOutboxHandled ? "true" : "false"},
        legacy_cutoff_at = ${sqlLiteral(snapshot.legacyCutoffAt)}::timestamptz,
        worker_lease_duration = ${sqlLiteral(snapshot.workerLease)}::interval,
        request_deadline_duration = ${sqlLiteral(snapshot.requestDeadline)}::interval,
        delivery_lease_duration = ${sqlLiteral(snapshot.deliveryLease)}::interval,
        max_delivery_attempts = ${snapshot.maxAttempts === null ? "null" : Number(snapshot.maxAttempts)},
        push_ttl_safety_budget = ${sqlLiteral(snapshot.ttlBudget)}::interval,
        updated_at = ${sqlLiteral(snapshot.updatedAt)}::timestamptz
    where singleton_id = 1;
  `);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function waitUntilReady(url, child, didSpawnFail) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (didSpawnFail() || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local notification dispatcher exited before becoming ready.");
    }
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === 405 && (await response.text()) === '{"error":"METHOD_NOT_ALLOWED"}') return;
    } catch {
      // The local gateway can refuse connections while the worker is compiling.
    }
    await delay(100);
  }
  throw new Error("The local notification dispatcher did not become ready.");
}

async function waitForUnauthorizedResponse(url) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(url, { method: "POST" }, 3_000);
      const body = await response.text();
      if (response.status === 401 && body === '{"error":"UNAUTHORIZED"}') return { body, status: response.status };
      lastError = new Error(`Unexpected unauthorized probe response: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error("The local notification dispatcher rejected no unauthorized probe.");
}

async function stopRuntime(child, closePromise) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (closePromise) await Promise.race([closePromise, delay(1_000)]);
    return;
  }
  child.kill("SIGINT");
  const stopped = await Promise.race([closePromise, delay(10_000).then(() => null)]);
  if (stopped) {
    if (stopped.code !== 0 && stopped.signal !== "SIGINT") {
      throw new Error("The local notification dispatcher exited unexpectedly.");
    }
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  await Promise.race([closePromise, delay(2_000)]);
  throw new Error("The local notification dispatcher required a forced stop.");
}

function startHeldMockProvider() {
  let releaseResponse;
  const releasePromise = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let reportRequest;
  const requestPromise = new Promise((resolve) => {
    reportRequest = resolve;
  });
  const server = http.createServer((request, response) => {
    const chunks = [];
    let byteLength = 0;
    request.on("data", (chunk) => {
      byteLength += chunk.length;
      if (byteLength <= 64 * 1024) chunks.push(chunk);
    });
    request.on("end", async () => {
      reportRequest({
        body: Buffer.concat(chunks).toString("utf8"),
        method: request.method,
        url: request.url,
      });
      await releasePromise;
      response.writeHead(201, { "content-length": "0" });
      response.end();
    });
  });

  return {
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "0.0.0.0", () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") reject(new Error("Mock provider address is unavailable."));
          else resolve(address.port);
        });
      }),
    release: () => releaseResponse(),
    requestPromise,
  };
}

function seedFixture({ hostUserId, recipientUserId }) {
  const endpoint = `${PROVIDER_ORIGIN}/send/${randomUUID()}`;
  const result = runLocalDatabaseSql(`
    begin;

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values
      (
        ${sqlLiteral(hostUserId)}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        ${sqlLiteral(`dispatcher-host-${hostUserId}@example.test`)},
        'test', now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      ),
      (
        ${sqlLiteral(recipientUserId)}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        ${sqlLiteral(`dispatcher-recipient-${recipientUserId}@example.test`)},
        'test', now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      );

    insert into public.profiles (user_id, nickname, ntrp)
    values
      (${sqlLiteral(hostUserId)}::uuid, 'D2 Host', 3.5),
      (${sqlLiteral(recipientUserId)}::uuid, 'D2 Recipient', 3.5);

    insert into public.sessions (
      sport_id, host_profile_id, court_id, play_type,
      start_at, slots_total, status
    )
    select
      sport_row.id,
      host_profile.id,
      court_row.id,
      '練球',
      statement_timestamp() + interval '1 day',
      2,
      'open'
    from public.sports sport_row
    cross join lateral (
      select profile_row.id
      from public.profiles profile_row
      where profile_row.user_id = ${sqlLiteral(hostUserId)}::uuid
    ) host_profile
    cross join lateral (
      select court_value.id
      from public.courts court_value
      where court_value.is_active and court_value.city = '台北市'
      order by court_value.id
      limit 1
    ) court_row
    where sport_row.code = 'tennis';

    insert into public.session_participants (session_id, profile_id, role, status)
    select session_row.id, profile_row.id, 'host', 'accepted'
    from public.sessions session_row
    join public.profiles profile_row on profile_row.id = session_row.host_profile_id
    where profile_row.user_id = ${sqlLiteral(hostUserId)}::uuid;

    insert into public.session_participants (session_id, profile_id, role, status)
    select session_row.id, recipient_profile.id, 'guest', 'requested'
    from public.sessions session_row
    join public.profiles host_profile on host_profile.id = session_row.host_profile_id
    join public.profiles recipient_profile on recipient_profile.user_id = ${sqlLiteral(recipientUserId)}::uuid
    where host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid;

    update public.session_participants participant_row
    set status = 'accepted'
    from public.sessions session_row, public.profiles host_profile
    where participant_row.session_id = session_row.id
      and host_profile.id = session_row.host_profile_id
      and host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid
      and participant_row.role = 'guest';

    delete from public.notification_outbox outbox_row
    using public.sessions session_row, public.profiles host_profile
    where outbox_row.session_id = session_row.id
      and host_profile.id = session_row.host_profile_id
      and host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid;

    insert into private.notification_runtime_canary_profiles (profile_id)
    select id from public.profiles where user_id = ${sqlLiteral(recipientUserId)}::uuid;

    do $fixture$
    declare
      enable_result jsonb;
    begin
      enable_result := public.enable_push_device_v2(
        ${sqlLiteral(recipientUserId)}::uuid,
        ${sqlLiteral(randomUUID())}::uuid,
        ${sqlLiteral(randomUUID())}::uuid,
        ${sqlLiteral(randomBytes(32).toString("hex"))},
        ${sqlLiteral(endpoint)},
        'p256dh-d2-fixture',
        'auth-d2-fixture',
        ${sqlLiteral(randomBytes(32).toString("hex"))}
      );
      if enable_result ->> 'kind' <> 'committed' then
        raise exception 'D2_PUSH_FIXTURE_FAILED';
      end if;
    end;
    $fixture$;

    with fixture_rows as (
      select
        session_row.*,
        recipient_profile.id as recipient_profile_id,
        consent_row.id as consent_id,
        consent_row.consent_epoch
      from public.sessions session_row
      join public.profiles host_profile on host_profile.id = session_row.host_profile_id
      join public.profiles recipient_profile on recipient_profile.user_id = ${sqlLiteral(recipientUserId)}::uuid
      join private.push_device_consents consent_row on consent_row.profile_id = recipient_profile.id
      where host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid
    ), inserted_outbox as (
      insert into public.notification_outbox (
        event_type, recipient_profile_id, session_id, payload,
        created_at, expires_at, source_version, outbox_format_version,
        source_kind, source_id, fanout_state, fanout_frozen_at
      )
      select
        'session_updated', recipient_profile_id, id,
        private.notification_session_payload(id, 'stale fixture snapshot'),
        statement_timestamp(), statement_timestamp() + interval '1 day',
        notification_state_version, 2,
        'session_state', id, 'frozen', statement_timestamp()
      from fixture_rows
      returning id, recipient_profile_id
    )
    insert into private.notification_deliveries (
      outbox_id, recipient_profile_id, consent_id, consent_epoch
    )
    select inserted_outbox.id, inserted_outbox.recipient_profile_id,
      fixture_rows.consent_id, fixture_rows.consent_epoch
    from inserted_outbox
    join fixture_rows on fixture_rows.recipient_profile_id = inserted_outbox.recipient_profile_id;

    insert into public.notification_outbox (
      event_type, recipient_profile_id, session_id, payload
    )
    select
      'session_updated', recipient_profile.id, session_row.id,
      private.notification_session_payload(session_row.id, 'legacy fixture')
    from public.sessions session_row
    join public.profiles host_profile on host_profile.id = session_row.host_profile_id
    join public.profiles recipient_profile on recipient_profile.user_id = ${sqlLiteral(recipientUserId)}::uuid
    where host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid;

    commit;

    select pg_catalog.json_build_object(
      'endpoint', ${sqlLiteral(endpoint)},
      'legacyOutboxId', (
        select outbox_row.id::text
        from public.notification_outbox outbox_row
        join public.profiles recipient_profile on recipient_profile.id = outbox_row.recipient_profile_id
        where recipient_profile.user_id = ${sqlLiteral(recipientUserId)}::uuid
          and outbox_row.outbox_format_version = 1
        order by outbox_row.id desc limit 1
      ),
      'recipientProfileId', (
        select profile_row.id::text from public.profiles profile_row
        where profile_row.user_id = ${sqlLiteral(recipientUserId)}::uuid
      ),
      'sessionId', (
        select session_row.id::text
        from public.sessions session_row
        join public.profiles host_profile on host_profile.id = session_row.host_profile_id
        where host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid
      ),
      'v2OutboxId', (
        select outbox_row.id::text
        from public.notification_outbox outbox_row
        join public.profiles recipient_profile on recipient_profile.id = outbox_row.recipient_profile_id
        where recipient_profile.user_id = ${sqlLiteral(recipientUserId)}::uuid
          and outbox_row.outbox_format_version = 2
        order by outbox_row.id desc limit 1
      )
    )::text;
  `);
  return JSON.parse(result.stdout.trim());
}

function runPreferenceSetter(recipientUserId, sessionUpdatesEnabled, { lockTimeout = "5s" } = {}) {
  return runLocalDatabaseSql(
    `
      begin;
      set local lock_timeout = ${sqlLiteral(lockTimeout)};
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${sqlLiteral(recipientUserId)}, true);
      select public.set_notification_prefs(
        true, true, true, ${sessionUpdatesEnabled ? "true" : "false"}, true, true
      );
      commit;
    `,
    { allowFailure: true }
  );
}

function cleanupFixture({ hostUserId, recipientUserId }) {
  const result = runLocalDatabaseSql(`
    delete from private.notification_runtime_canary_profiles
    where profile_id in (
      select id from public.profiles
      where user_id in (${sqlLiteral(hostUserId)}::uuid, ${sqlLiteral(recipientUserId)}::uuid)
    );
    delete from public.notification_outbox
    where recipient_profile_id in (
      select id from public.profiles
      where user_id in (${sqlLiteral(hostUserId)}::uuid, ${sqlLiteral(recipientUserId)}::uuid)
    ) or session_id in (
      select session_row.id
      from public.sessions session_row
      join public.profiles host_profile on host_profile.id = session_row.host_profile_id
      where host_profile.user_id = ${sqlLiteral(hostUserId)}::uuid
    );
    delete from public.push_subscriptions
    where profile_id in (
      select id from public.profiles where user_id = ${sqlLiteral(recipientUserId)}::uuid
    );
    delete from private.push_device_consents
    where profile_id in (
      select id from public.profiles where user_id = ${sqlLiteral(recipientUserId)}::uuid
    );
    delete from private.push_endpoint_registry
    where owner_profile_id in (
      select id from public.profiles where user_id = ${sqlLiteral(recipientUserId)}::uuid
    );
    delete from public.sessions
    where host_profile_id in (
      select id from public.profiles where user_id = ${sqlLiteral(hostUserId)}::uuid
    );
    delete from public.profiles
    where user_id in (${sqlLiteral(hostUserId)}::uuid, ${sqlLiteral(recipientUserId)}::uuid);
    delete from auth.users
    where id in (${sqlLiteral(hostUserId)}::uuid, ${sqlLiteral(recipientUserId)}::uuid);
    delete from private.notification_dispatch_workers where generation = ${TEST_GENERATION}::bigint;

    select concat_ws('|',
      (
        select count(*)::text from public.profiles
        where user_id in (${sqlLiteral(hostUserId)}::uuid, ${sqlLiteral(recipientUserId)}::uuid)
      ),
      (
        select count(*)::text from private.notification_dispatch_workers
        where generation = ${TEST_GENERATION}::bigint
      )
    );
  `);
  assert.equal(result.stdout.trim(), "0|0");
}

test(
  "local dispatcher holds the send recheck transaction across mock I/O and preserves legacy work",
  { skip: !RUN_LOCAL_EDGE_TEST, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { apiUrl } = loadLocalSupabaseConfig();
    const functionUrl = `${apiUrl}/functions/v1/notification-outbox-dispatch`;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "qiuka-notification-dispatch-v2-"));
    const environmentPath = path.join(temporaryDirectory, "function.env");
    const rolePassword = randomBytes(24).toString("hex");
    const cronSecret = randomBytes(24).toString("hex");
    const hostUserId = randomUUID();
    const recipientUserId = randomUUID();
    const runtimeSnapshot = runtimeControlSnapshot();
    const mockProvider = startHeldMockProvider();
    let fixture;
    let child;
    let childClosePromise;
    let output = "";
    let spawnFailed = false;
    let mockListening = false;
    let mockReleased = false;
    let testError;
    let stage = "fixture setup";

    try {
      const mockPort = await mockProvider.listen();
      mockListening = true;
      runLocalDatabaseSql(`
        alter role notification_dispatcher password ${sqlLiteral(rolePassword)};
        update private.notification_runtime_control
        set worker_generation = ${TEST_GENERATION}::bigint,
            dispatch_enabled = true,
            new_runtime_mode = 'canary',
            worker_lease_duration = interval '20 seconds',
            request_deadline_duration = interval '5 seconds',
            delivery_lease_duration = interval '10 seconds',
            max_delivery_attempts = 3,
            push_ttl_safety_budget = interval '0 seconds'
        where singleton_id = 1;
      `);
      stage = "domain fixture setup";
      fixture = seedFixture({ hostUserId, recipientUserId });

      const environment = [
        "NOTIFICATION_DISPATCH_V2_RUNTIME_MODE=local-test-v1",
        `NOTIFICATION_CRON_SECRET=${cronSecret}`,
        `NOTIFICATION_DISPATCH_V2_EXPECTED_GENERATION=${TEST_GENERATION}`,
        "NOTIFICATION_OUTBOX_BATCH_SIZE=1",
        `NOTIFICATION_DISPATCH_DATABASE_URL=postgresql://notification_dispatcher:${rolePassword}@host.docker.internal:54322/postgres?sslmode=disable`,
        "WEB_PUSH_TRANSPORT=mock",
        `PUSH_TEST_URL=http://host.docker.internal:${mockPort}/push`,
        `PUSH_PROVIDER_ORIGINS_V1=${JSON.stringify([PROVIDER_ORIGIN])}`,
        "",
      ].join("\n");
      await writeFile(environmentPath, environment, { mode: 0o600 });
      assert.equal((await stat(environmentPath)).mode & 0o777, 0o600);

      child = spawn(
        process.execPath,
        [
          SUPABASE_CLI,
          "functions",
          "serve",
          "notification-outbox-dispatch",
          "--no-verify-jwt",
          "--env-file",
          environmentPath,
        ],
        {
          cwd: REPOSITORY_ROOT,
          detached: true,
          env: { ...process.env, SUPABASE_NO_UPDATE_NOTIFIER: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      child.on("error", () => {
        spawnFailed = true;
      });
      childClosePromise = new Promise((resolve) => {
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          output = `${output}${chunk}`.slice(-1024 * 1024);
        });
      }

      stage = "runtime startup";
      await waitUntilReady(functionUrl, child, () => spawnFailed);

      stage = "authorization rejection";
      const workerCountBefore = runLocalDatabaseSql(`
        select count(*)::text from private.notification_dispatch_workers
        where generation = ${TEST_GENERATION}::bigint;
      `).stdout.trim();
      const unauthorized = await waitForUnauthorizedResponse(functionUrl);
      assert.equal(unauthorized.status, 401);
      assert.equal(unauthorized.body, '{"error":"UNAUTHORIZED"}');
      assert.equal(
        runLocalDatabaseSql(`
          select count(*)::text from private.notification_dispatch_workers
          where generation = ${TEST_GENERATION}::bigint;
        `).stdout.trim(),
        workerCountBefore
      );

      stage = "held send transaction";
      const dispatchPromise = fetchWithTimeout(
        functionUrl,
        { headers: { "x-notification-cron-secret": cronSecret }, method: "POST" },
        30_000
      );
      const providerRequest = await Promise.race([
        mockProvider.requestPromise,
        delay(15_000).then(() => {
          throw new Error("The dispatcher did not reach the local mock provider.");
        }),
      ]);
      const fixtureRequest = JSON.parse(providerRequest.body);
      assert.equal(providerRequest.method, "POST");
      assert.equal(providerRequest.url, "/push");
      assert.equal(fixtureRequest.kind, "local-dispatch-fixture-v1");
      assert.equal(fixtureRequest.notificationId.length, 36);
      assert.ok(Number.isInteger(fixtureRequest.ttlSeconds));
      assert.ok(fixtureRequest.ttlSeconds > 0 && fixtureRequest.ttlSeconds <= 86_395);

      const blockedSetter = runPreferenceSetter(recipientUserId, false, { lockTimeout: "500ms" });
      assert.equal(blockedSetter.status, 3);
      assert.match(blockedSetter.stderr, /canceling statement due to lock timeout/u);

      mockProvider.release();
      mockReleased = true;
      const dispatchResponse = await dispatchPromise;
      const dispatchText = await dispatchResponse.text();
      assert.equal(dispatchResponse.status, 200, dispatchText);
      assert.deepEqual(JSON.parse(dispatchText), {
        accepted: 1,
        batchExhausted: true,
        cancelled: 0,
        claimed: 1,
        failed: 0,
        finalized: 1,
        kind: "completed",
        terminalized: 0,
        version: 1,
      });

      stage = "database verification";
      assert.equal(
        runLocalDatabaseSql(`
          select concat_ws('|',
            delivery_row.state,
            delivery_row.attempts::text,
            outbox_row.outcome,
            outbox_row.outcome_code,
            coalesce(outbox_row.sent_at::text, 'null'),
            outbox_row.attempts::text
          )
          from private.notification_deliveries delivery_row
          join public.notification_outbox outbox_row on outbox_row.id = delivery_row.outbox_id
          where outbox_row.id = ${fixture.v2OutboxId}::bigint;
        `).stdout.trim(),
        "accepted|1|completed|deliveries_terminal_with_acceptance|null|0"
      );
      assert.equal(
        runLocalDatabaseSql(`
          select concat_ws('|', attempts::text, coalesce(sent_at::text, 'null'), outbox_format_version::text)
          from public.notification_outbox where id = ${fixture.legacyOutboxId}::bigint;
        `).stdout.trim(),
        "0|null|1"
      );
      assert.equal(
        runLocalDatabaseSql(`
          select state || '|' || result_code
          from private.notification_dispatch_workers
          where generation = ${TEST_GENERATION}::bigint
          order by id desc limit 1;
        `).stdout.trim(),
        "completed|normal_exit"
      );

      stage = "post-send preference mutation";
      const successfulSetter = runPreferenceSetter(recipientUserId, false);
      assert.equal(successfulSetter.status, 0, successfulSetter.stderr);
      assert.match(successfulSetter.stdout, /OK/u);
      assert.equal(
        runLocalDatabaseSql(`
          select state from private.notification_deliveries where outbox_id = ${fixture.v2OutboxId}::bigint;
        `).stdout.trim(),
        "accepted"
      );

      stage = "secret log scan";
      await delay(200);
      await stopRuntime(child, childClosePromise);
      child = undefined;
      for (const sensitive of [rolePassword, cronSecret, fixture.endpoint]) {
        assert.equal(output.includes(sensitive), false, "Dispatcher output must not contain credentials or endpoints.");
      }
    } catch (error) {
      testError = new Error(
        `Local dispatcher v2 flow failed at ${stage}: ${String(error?.message ?? "unknown failure")}`,
        { cause: error }
      );
    }

    const cleanupErrors = [];
    if (!mockReleased) mockProvider.release();
    try {
      if (child && childClosePromise) await stopRuntime(child, childClosePromise);
    } catch (error) {
      cleanupErrors.push(new Error("Dispatcher runtime cleanup failed.", { cause: error }));
    }
    if (mockListening) {
      try {
        await mockProvider.close();
      } catch (error) {
        cleanupErrors.push(new Error("Mock provider cleanup failed.", { cause: error }));
      }
    }
    try {
      cleanupFixture({ hostUserId, recipientUserId });
    } catch (error) {
      cleanupErrors.push(new Error("Dispatcher database fixture cleanup failed.", { cause: error }));
    }
    try {
      restoreRuntimeControl(runtimeSnapshot);
    } catch (error) {
      cleanupErrors.push(new Error("Dispatcher runtime-control restore failed.", { cause: error }));
    }
    try {
      runLocalDatabaseSql("alter role notification_dispatcher password null;");
      assert.equal(
        runLocalDatabaseSql(`
          select (rolpassword is null)::text from pg_authid where rolname = 'notification_dispatcher';
        `).stdout.trim(),
        "true"
      );
    } catch (error) {
      cleanupErrors.push(new Error("Dispatcher role credential cleanup failed.", { cause: error }));
    }
    try {
      await rm(temporaryDirectory, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(new Error("Dispatcher temporary-file cleanup failed.", { cause: error }));
    }

    if (testError && cleanupErrors.length) {
      throw new AggregateError([testError, ...cleanupErrors], "Local dispatcher v2 test and teardown failed.");
    }
    if (testError) {
      throw new Error(
        `${testError.message}\nRuntime output:\n${output.replaceAll(rolePassword, "<redacted>").replaceAll(cronSecret, "<redacted>")}`,
        { cause: testError }
      );
    }
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Local dispatcher v2 teardown failed.");
  }
);
