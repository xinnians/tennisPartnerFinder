# Quick Contact UX Design

Date: 2026-07-02

## Summary

Tennis Partner Finder should prioritize fast real-world tennis coordination over
building an in-app invitation or messaging system. The MVP communication model is:

> The platform helps players discover good matches and start the conversation;
> LINE handles the actual coordination.

Replace the current full invite flow with a quick contact flow. Users browse
public player cards, confirm match fit, tap `快速約球`, copy a generated opener,
copy or view the other player's LINE ID, and continue in LINE.

Important privacy boundary: this MVP treats LINE visibility as a UI gate, not a
database secrecy boundary. Public discovery payloads may include `line_id` for
public profiles; the app must hide it on the first card layer and reveal it only
after the user taps `快速約球`.

## Context

The current prototype has:

- A map centered around real Taipei tennis courts.
- Registered player pins.
- Demand pins from external source posts.
- A bottom sheet for player details.
- A modal-based invite flow.
- A `我的邀請` tab with pending and accepted invite states.
- A profile page with nickname, NTRP, play types, usual courts, slots, location
  sharing, and LINE ID.

The existing product planning document says LINE ID should only become visible
after an accepted invite. That is safer, but it creates a heavier in-app
workflow: send invite, wait for reply, manage states, notify users, then reveal
contact details. For the MVP goal of quickly arranging tennis, that workflow is
too much product surface.

## Product Positioning

This product is not a dating app and should not start as a chat app. It is a
court-centered discovery tool for finding tennis partners quickly.

The key UX priority is:

1. Find a suitable partner.
2. Reduce the awkwardness of opening the conversation.
3. Move quickly to LINE for scheduling.

The UX should avoid implying that Tennis Partner Finder owns the whole
conversation lifecycle.

## Goals

- Make it faster to contact a suitable registered player.
- Remove the need to wait for in-app invite acceptance.
- Make LINE visibility an explicit profile opt-in.
- Keep LINE out of the first map/list layer.
- Give users a ready-to-copy opening message.
- Keep registered players and external demand posts clearly separate.
- Reduce MVP complexity by removing invite state management from the UI.

## Non-Goals

- No in-app chat.
- No pending, accepted, declined, or cancelled invite UI.
- No notification system for invites.
- No contact history in the first version.
- No automated import or reply flow for external source posts.
- No ratings, reviews, reputation, or social graph.

## Recommended Approach

Use a `公開球友卡 + 快速 LINE 聯絡` model.

When a profile is public, the user is explicitly saying other tennis players may
contact them through LINE for tennis coordination. The map and public card still
do not expose LINE immediately. LINE appears only after the viewer taps
`快速約球`, where the product also provides a generated opener.

This gives the MVP a direct path to real coordination without committing to a
larger in-app communication system.

## Alternatives Considered

### Full Invite Flow

Users send an invite, the recipient accepts or declines, and contact details are
revealed only after acceptance.

Pros:

- Better privacy and recipient control.
- Creates a clear audit trail for future moderation.
- Supports future notification and contact history features.

Cons:

- Slower for users who just want to play tennis.
- Requires notification, state, and response handling.
- Makes the MVP feel like a messaging product before the core discovery loop is
  proven.

### Fully Public LINE

Player cards show LINE ID directly.

Pros:

- Fastest possible contact path.
- Very simple implementation.

Cons:

- Feels too exposed.
- Makes LINE scrapeable from the main card layer.
- Gives users less confidence when turning on public visibility.

### Quick Contact Flow

Player cards show match details first. Tapping `快速約球` reveals contact tools:
LINE ID, copy LINE ID, and copy opener.

Pros:

- Fast enough for MVP usage.
- Keeps the product focused on discovery and opening the conversation.
- Preserves a small intentional step before LINE is shown.
- Avoids in-app invite state management.

Cons:

- Not a strong privacy boundary after a profile is public.
- Technically skilled users may see LINE ID in API responses or browser tools.
- Does not guarantee the contacted player wants every specific request.
- Requires clear profile copy so users understand what public visibility means.

Recommendation: use the quick contact flow.

## Information Architecture

Target bottom navigation structure:

- Current: `地圖` / `我的邀請` / `個人檔案`
- Proposed: `地圖` / `徵球伴` / `個人檔案`

Do not ship a nonfunctional `徵球伴` tab. If platform-owned demand publishing is
not included in the first implementation increment, temporarily ship only
`地圖` and `個人檔案`, then add `徵球伴` when request publishing is ready.

### 地圖

Primary discovery surface.

Users can:

- Browse registered public players.
- Browse demand pins.
- Filter by NTRP band and play type.
- Open player cards.
- Open demand cards.
- Use `快速約球` for registered players.
- Use `查看原貼文` for external demand pins.

### 徵球伴

Short-lived request surface.

Users can:

- Publish a request for a specific court and time.
- Include rough skill expectations.
- Include a short request message.
- Close or expire the request.

This tab should be introduced when platform-owned demand publishing is ready.
Until then, it can be designed but not necessarily implemented in the first UI
change.

### 個人檔案

Profile and public contact settings.

Users can:

- Set nickname.
- Set NTRP.
- Select play types.
- Select usual courts.
- Select recurring availability.
- Enter LINE ID.
- Toggle public player card visibility.

Rename the current `分享我的位置` setting to:

`公開我的球友卡，讓其他球友可用 LINE 聯絡我`

## Registered Player Flow

1. User opens the map.
2. User taps a registered player pin or cluster item.
3. Player card opens.
4. Card shows:
   - nickname
   - NTRP
   - NTRP descriptor if available
   - usual court
   - district
   - play types
   - availability
5. Card does not show LINE directly.
6. User taps `快速約球`.
7. Quick contact panel opens.
8. Panel shows:
   - recipient nickname
   - recipient LINE ID
   - `複製 LINE ID`
   - generated opener
   - `複製開場白`
   - short etiquette reminder
9. User continues in LINE.

The product should not create an invite record as part of this action for the
MVP UI.

## Quick Contact Panel

The quick contact panel should feel like a utility, not a modal for a separate
workflow.

Required content:

- Recipient summary: nickname, NTRP, usual court.
- LINE section:
  - LINE ID
  - copy action
- Opener section:
  - generated message
  - copy action
- Etiquette note:
  - `請先簡短自我介紹，確認程度、球場與時間後再約打。`

The panel can optionally let the viewer choose one of the recipient's available
slots before generating the opener. If no slot is selected, use a generic phrase
such as `這週`.

## Opener Generation

For registered players, generate:

`嗨，我在找 {court} 附近的球友，我程度約 {myNtrp}，想約 {slot} {playType}，看到你的資料覺得蠻適合，想問這週有空打嗎？`

Fallbacks:

- If viewer NTRP is missing: `我也在找附近球友`
- If play type is missing: omit `{playType}`
- If slot is missing: use `這週`
- If court is missing: use the recipient's usual court

The opener should be editable in a future version, but the MVP can start with a
copy-only generated message.

## Profile Visibility Rules

Opening public player visibility means:

- The user's player card can appear on the map.
- Other players can use `快速約球`.
- LINE ID can be revealed inside the quick contact panel.

Before a profile can become public, require:

- LINE ID is present.
- At least one usual court is selected.
- NTRP is set.

Recommended but not required for public visibility:

- At least one availability slot.
- At least one play type.

If the user tries to turn on public visibility without required fields, show a
short inline prompt that names the missing fields and keeps the toggle off.

## Demand Pin Rules

Demand pins are different from registered player cards.

### External Demand Pins

External demand pins should keep the current behavior:

- Show court or area.
- Show rough skill text.
- Show original request text.
- Show source label.
- Offer `查看原貼文`.
- Do not show platform contact UI.
- Do not use `快速約球`.

This prevents users from thinking the platform can notify or contact the person
behind an external post.

### Platform-Owned Demand Requests

When the product supports platform-owned demand requests, use `回應需求`.

The response panel can mirror quick contact:

- Show requester LINE ID.
- Copy LINE ID.
- Copy generated opener.

For platform-owned requests, generate:

`嗨，我看到你在 {court} 徵 {time} 的球友，我程度約 {myNtrp}，想問現在還缺人嗎？`

## Data Boundary

The MVP database should be modeled around quick contact, not invite acceptance.
Do not include invite status infrastructure until the product intentionally adds
an in-app request/accept workflow.

Recommended frontend/API behavior:

- Public discovery data may include LINE ID for public profiles.
- Player card first layer excludes LINE ID.
- Quick contact action reveals the selected public player's already-loaded LINE ID.
- No pending invite record is created.
- No accepted invite contact function or quick-contact event log is needed for
  this MVP flow.

This is not strong secrecy after a profile is public. It is an intentional UX
boundary: LINE is shown only when the viewer is taking an explicit contact
action.

## Error And Empty States

Use light, direct messages:

- Viewer profile incomplete:
  - `先補齊程度與 LINE，開場白會比較自然。`
- Target profile no longer public:
  - `這位球友目前沒有公開聯絡資料。`
- Target LINE missing:
  - `這位球友尚未提供 LINE。`
- Clipboard copy failed:
  - `複製失敗，請手動選取文字。`
- External demand source missing:
  - `原貼文連結目前無法開啟。`

Do not introduce recovery-heavy flows or state machines for these cases.

## Testing Scope

Add or update tests for:

- The old `我的邀請` tab no longer appears in the bottom navigation.
- Registered player cards do not show LINE in the first layer.
- `快速約球` opens the quick contact panel.
- Quick contact panel shows LINE only after the explicit action.
- Copy opener action is available.
- Incomplete viewer profile prompts for missing fields.
- External demand pins still show `查看原貼文` and do not show `快速約球`.
- Platform-owned demand requests can later use `回應需求` separately from
  external demand pins.

## Rollout Notes

The first implementation should focus on replacing the prototype invite UI with
quick contact behavior. It should not build the full `徵球伴` publishing tab at
the same time unless that work is already planned as the next milestone. If
publishing is not included, remove `我的邀請` and use a temporary two-tab
navigation: `地圖` / `個人檔案`.

Keep the implementation small:

- Rename profile visibility copy.
- Remove `我的邀請` from navigation.
- Remove invite modal and in-memory invite list from the primary UI.
- Add quick contact panel for registered players.
- Keep external demand pins unchanged.

Future versions can revisit invite records, contact history, notifications,
blocking, reports, and accepted-only contact reveal once there is evidence that
users need more protection or coordination inside the product.
