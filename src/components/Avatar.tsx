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
 * Single React source for the `.player-avatar` presentation shared by the
 * directory row (md) and the player card (lg). The legacy string
 * `avatarMarkup()` stays alive for the profile-completion sheet until batch 8.4.
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
