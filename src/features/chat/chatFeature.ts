import type { ControllerChatSurfaceContext, ControllerIdentifier } from "../../controllerContracts.ts";
import type { ChatMessage, MySessionSummary } from "../../domainTypes.ts";

/** Highest messageId present in a chat feed batch, or null when the batch is empty/unusable. */
export function latestChatMessageId(messages: readonly Partial<ChatMessage>[] | null | undefined): number | null {
  let latest = null;
  for (const message of Array.isArray(messages) ? messages : []) {
    const id = Number(message?.messageId);
    if (Number.isFinite(id) && (latest == null || id > latest)) latest = id;
  }
  return latest;
}

export function chatMemberSession(session: Partial<MySessionSummary> | null | undefined): boolean {
  return String(session?.viewerParticipantStatus).toLowerCase() === "accepted";
}

export function visibleChatMessage(
  context: Pick<ControllerChatSurfaceContext, "messages"> | null | undefined,
  messageId: ControllerIdentifier
): ChatMessage | undefined {
  return context?.messages.find(
    (message) =>
      String(message.messageId) === String(messageId) &&
      message.kind === "user" &&
      message.isSelf !== true &&
      Number.isSafeInteger(Number(message.senderProfileId))
  );
}
