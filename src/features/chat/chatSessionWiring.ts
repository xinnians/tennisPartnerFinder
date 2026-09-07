import type {
  ControllerChatSession,
  ControllerIdentifier,
  ControllerSurfaceHandle,
} from "../../controllerContracts.ts";
import type { MySessionSummary, SurfaceCloseOptions } from "../../domainTypes.ts";

interface ChatSurfaceOptions {
  canWithdraw: boolean;
  courts: ControllerChatSession["courts"];
  feed: ControllerChatSession["feed"];
  onBlock(profileId: ControllerIdentifier): Promise<true>;
  onClose(): void;
  onPost(body: unknown): Promise<unknown>;
  onReport(messageId: ControllerIdentifier): unknown;
  onWithdraw(): unknown;
}

interface ChatSessionWiringDependencies {
  createSessionChat: (sessionId: ControllerIdentifier) => ControllerChatSession | null | undefined;
  openChatSurface: (
    session: MySessionSummary,
    options: ChatSurfaceOptions
  ) => ControllerSurfaceHandle | null | undefined;
}

/** App-owned command that binds an authorized Chat model to the concrete surface. */
export function createSessionChatOpener({
  createSessionChat,
  openChatSurface,
}: ChatSessionWiringDependencies): (sessionId: ControllerIdentifier) => ControllerSurfaceHandle | null | undefined {
  return function openSessionChat(sessionId) {
    const chat = createSessionChat(sessionId);
    if (!chat) return chat;
    let unsubscribeClose = () => {};
    let surface: ControllerSurfaceHandle | null | undefined;
    try {
      surface = openChatSurface(chat.session, {
        canWithdraw: chat.canWithdraw,
        courts: chat.courts,
        feed: chat.feed,
        onBlock: chat.block,
        onClose: () => {
          unsubscribeClose();
          chat.release();
        },
        onPost: chat.post,
        onReport: chat.report,
        onWithdraw: chat.withdraw,
      });
      if (!surface) {
        chat.release();
        return surface;
      }
      unsubscribeClose = chat.subscribeClose((options?: SurfaceCloseOptions) => surface?.close(options));
      chat.start();
      return surface;
    } catch (error) {
      unsubscribeClose();
      try {
        surface?.close({ reason: "chat-open-failed", restoreFocus: false });
      } finally {
        chat.release();
      }
      throw error;
    }
  };
}
