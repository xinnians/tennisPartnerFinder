import { avatarRuntime } from "../sessionViews.js";

export type AvatarSize = "" | "md" | "lg";

export interface AvatarProps {
  avatarUrl?: string;
  nickname?: string;
  size?: AvatarSize;
}

interface AvatarRuntime {
  avatarInitial(nickname: unknown): string;
  safeGoogleAvatarUrl(value: unknown): string;
  showAvatarFallback(image: HTMLImageElement): void;
}

// sessionViews owns the eager glob that reaches every consumer of this
// component, so resolve the runtime only while rendering: the circular module
// edge must never read the const export during initialization.
function runtime(): AvatarRuntime {
  return avatarRuntime as unknown as AvatarRuntime;
}

/**
 * Single source for the `.player-avatar` presentation on every avatar surface:
 * join preview and profile sheet (""), directory row ("md"), Me page and player
 * card ("lg"). 批 D8 sizes: ""=40px, "md"=44px, "lg"=52px.
 *
 * 球友（非本人）在資料庫層從不帶 avatarUrl(player_directory/player_presence_directory
 * allowlist 皆無 avatar 欄位,見 .claude/rules/supabase.md),所以目錄列 md 與球友卡 lg
 * 只會落回字首 fallback;我頁 lg 與 profile sheet 是本人,avatarUrl 來自 auth metadata,
 * 會渲染 <img>。
 */
export function Avatar({ avatarUrl = "", nickname = "", size = "" }: AvatarProps) {
  const helpers = runtime();
  const safeUrl = helpers.safeGoogleAvatarUrl(avatarUrl);
  return (
    <span className={size ? `player-avatar player-avatar--${size}` : "player-avatar"} data-player-avatar="">
      {safeUrl ? (
        <img
          src={safeUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => helpers.showAvatarFallback(event.currentTarget)}
        />
      ) : null}
      <span className="player-avatar__fallback" data-avatar-fallback="" aria-hidden="true" hidden={Boolean(safeUrl)}>
        {helpers.avatarInitial(nickname)}
      </span>
    </span>
  );
}
