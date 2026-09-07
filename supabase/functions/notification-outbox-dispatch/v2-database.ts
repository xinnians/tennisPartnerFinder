import { Pool, type PoolClient, type Transaction } from "jsr:@db/postgres@0.19.5";

type CommandResult = Record<string, unknown>;
type CommandQueryable = Pick<PoolClient, "queryObject"> | Pick<Transaction, "queryObject">;

function fixedError(code: string) {
  return new Error(code);
}

async function queryCommand(queryable: CommandQueryable, text: string, args: unknown[]) {
  let rows: Array<{ result: string }>;
  try {
    rows = (await queryable.queryObject<{ result: string }>(text, args)).rows;
  } catch {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
  if (rows.length !== 1 || typeof rows[0]?.result !== "string") {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
  try {
    const parsed = JSON.parse(rows[0].result);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as CommandResult;
  } catch {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }
}

function createDatabasePort(client: PoolClient) {
  return Object.freeze({
    beginWorker(expectedGeneration: string) {
      return queryCommand(
        client,
        "select notification_dispatcher_api.begin_notification_dispatch_worker($1::bigint)::text as result",
        [expectedGeneration]
      );
    },
    claimDelivery(workerToken: string) {
      return queryCommand(
        client,
        "select notification_dispatcher_api.claim_notification_delivery($1::uuid)::text as result",
        [workerToken]
      );
    },
    finalizeOutbox(outboxId: string) {
      return queryCommand(
        client,
        "select notification_dispatcher_api.finalize_notification_outbox($1::bigint)::text as result",
        [outboxId]
      );
    },
    finishWorker(workerToken: string, succeeded: boolean) {
      return queryCommand(
        client,
        "select notification_dispatcher_api.finish_notification_dispatch_worker($1::uuid, $2::boolean)::text as result",
        [workerToken, succeeded]
      );
    },
    async withSendTransaction(
      values: { claimToken: string; workerToken: string },
      operation: (transaction: {
        complete(input: {
          errorCode: string | null;
          nextAttemptAt: string | null;
          outcome: string;
        }): Promise<CommandResult>;
        prepare(): Promise<CommandResult>;
      }) => Promise<unknown>
    ) {
      const transaction = client.createTransaction("notification_dispatcher_send_v1", {
        isolation_level: "read_committed",
      });
      let began = false;
      try {
        await transaction.begin();
        began = true;
        const result = await operation(
          Object.freeze({
            complete(input: { errorCode: string | null; nextAttemptAt: string | null; outcome: string }) {
              return queryCommand(
                transaction,
                "select notification_dispatcher_api.complete_notification_delivery($1::uuid, $2::uuid, $3::text, $4::text, $5::timestamptz)::text as result",
                [values.workerToken, values.claimToken, input.outcome, input.errorCode, input.nextAttemptAt]
              );
            },
            prepare() {
              return queryCommand(
                transaction,
                "select notification_dispatcher_api.prepare_notification_delivery_send($1::uuid, $2::uuid)::text as result",
                [values.workerToken, values.claimToken]
              );
            },
          })
        );
        await transaction.commit();
        began = false;
        return result;
      } catch (error) {
        if (began) {
          try {
            await transaction.rollback();
          } catch {
            // The caller receives only the original fixed boundary failure.
          }
        }
        throw error;
      }
    },
  });
}

export async function withNotificationDispatcherDatabase<T>({
  connectionString,
  operation,
}: {
  connectionString: string;
  operation: (database: ReturnType<typeof createDatabasePort>) => Promise<T>;
}) {
  if (typeof connectionString !== "string" || !connectionString || typeof operation !== "function") {
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  }

  const pool = new Pool(connectionString, 1, true);
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const roleResult = await client.queryObject<{ role_name: string }>("select current_user::text as role_name");
    if (roleResult.rows.length !== 1 || roleResult.rows[0]?.role_name !== "notification_dispatcher") {
      throw fixedError("DISPATCH_V2_DATABASE_ROLE_INVALID");
    }
    return await operation(createDatabasePort(client));
  } catch (error) {
    if (error instanceof Error && error.message === "DISPATCH_V2_DATABASE_ROLE_INVALID") throw error;
    if (error instanceof Error && error.message.startsWith("DISPATCH_V2_")) throw error;
    throw fixedError("DISPATCH_V2_DATABASE_CONTRACT_INVALID");
  } finally {
    client?.release();
    await pool.end();
  }
}
