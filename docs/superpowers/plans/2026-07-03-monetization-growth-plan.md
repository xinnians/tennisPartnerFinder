# Tennis Partner Finder Monetization and Growth Plan

Date: 2026-07-03

## Summary

Tennis Partner Finder should grow as a free player-discovery and game-formation
tool first, then monetize high-intent moments around paid games, curated events,
coaches, classes, venues, and brand partnerships.

The recommended model is:

> Keep core player matching free. Earn revenue when the product helps a real
> tennis session, class, or event form.

This fits the current MVP because the product is already centered on Taipei
tennis courts, public player cards, short-lived partner requests, and quick LINE
contact. Charging ordinary players too early would reduce liquidity before the
network has enough density.

## Product Positioning

Position the product as:

> The Taipei tennis entry point for finding compatible partners and active games
> near real courts.

The product should not start as a broad social network, in-app chat product, or
court-booking system. Taipei venues already maintain their own booking flows,
LINE processes, point systems, and usage rules. Tennis Partner Finder should
fill the gap between "I want to play" and "I found the right people for this
court, time, and level."

## Market Signals

- Existing platforms already combine player discovery, coach discovery, NTRP
  filters, and messaging-like workflows. This validates demand but also means a
  generic all-in-one player directory is not enough differentiation.
- Taipei tennis venues already publish booking rules, peak/off-peak pricing,
  private coaching rules, event rental rules, and LINE or app-based reservation
  processes. Early product work should route around these systems instead of
  rebuilding them.
- Informal tennis demand still appears in Facebook groups, Threads, LINE
  communities, and one-off posts. This suggests the unmet need is not only
  "list players"; it is "make a game happen now, with the right level and
  enough trust."

Reference examples:

- LoveTennis: https://lovetennis.tw/
- Taipei Tennis Court booking notice: https://www.taipeitenniscourt.com/news.php?act=view&id=9
- Taipei Tennis Center outdoor court rules: https://www.tsc.taipei/%E5%A0%B4%E9%A4%A8%E4%BB%8B%E7%B4%B9/%E5%AE%A4%E5%A4%96%E7%B6%B2%E7%90%83%E5%A0%B4outdoor/

## Needs The Product Must Satisfy

### 1. Find Compatible Players

Users must quickly judge whether another player is a reasonable match.

Required signals:

- NTRP level
- Usual courts
- Play types: singles, doubles, rally, practice
- Recurring availability
- Public player-card status
- LINE contact after an explicit quick-contact action

### 2. Know Who Actually Wants To Play Soon

Static player cards are useful, but they do not fully answer urgency. The
product needs short-lived requests and active game signals.

Required signals:

- desired court
- desired date and time
- level range
- desired play type
- number of players needed
- status: open, formed, cancelled, expired

### 3. Reduce The Awkwardness Of Contacting Someone

The quick LINE contact flow is a strong MVP direction. The product should keep
helping users open conversations with clear, polite, tennis-specific messages.

Required behavior:

- hide LINE ID on first-layer player cards
- reveal LINE only after an explicit quick-contact action
- generate a ready-to-copy opener
- include court, level, play type, and time when available

### 4. Improve Game Formation Rate

The product should optimize for actual games played, not only profile views or
pin taps.

Useful product signals:

- recently active users
- recently posted requests
- request status
- "interested" count
- basic report and moderation entry points
- future block controls if beta feedback proves they are needed

### 5. Make Paid Games Easy To Run

The first monetization product should be simple curated games, not subscriptions.

Each paid game should include:

- court
- date and time
- target level range
- play type
- required player count
- price or service fee
- host or organizer
- contact or LINE group instructions
- status: open, waitlist, full, cancelled, completed

### 6. Create Value For Coaches And Organizers

Coaches, organizers, and venues will pay only if the product exposes real demand.
The product should accumulate useful demand data without overbuilding analytics
early.

Useful demand signals:

- courts with repeated unmet demand
- hot time slots
- common level bands
- common play types
- users who repeatedly express interest in games or classes

## Monetization Strategy

### Priority 1: Paid Games And Curated Events

Start with manual operations. Do not build heavy payments or organizer tooling
before proving that users will pay.

Example formats:

- NTRP 2.5-3.0 beginner rally game
- NTRP 3.0-3.5 doubles practice game
- women-friendly beginner game
- weekday evening fixed practice game
- weekend four-player doubles game

Early pricing:

- NT$50-150 service fee per player
- or 10-20% of the total event fee

Keep venue fees separate at first. The platform charges for matching, curation,
reminders, and reducing the chance that the game fails to form.

### Priority 2: Coach And Class Referrals

Do not launch a generic coach marketplace immediately. Instead, recommend
coaches or classes when user behavior shows a need.

Examples:

- A beginner repeatedly cannot find stable rally partners: recommend a beginner
  rally class.
- A 3.5 player wants match play: recommend a doubles tactics group class.
- A court has recurring demand at a specific time: invite a nearby coach to host
  a recurring clinic.

Possible revenue models:

- referral commission per paid signup
- fixed listing fee for vetted coaches
- paid featured placement for relevant level/court combinations
- class-formation service fee

### Priority 3: Venue And Activity Partnerships

Approach venues only after the product has demand data. Early partnership value
is not replacing booking systems; it is helping venues fill suitable sessions,
promote events, and direct players to the right rules.

Possible partnership offers:

- promote venue-run clinics or social games
- fill off-peak sessions
- publish venue-specific game rules clearly
- route users to official booking or LINE channels
- co-host beginner-friendly social games

### Priority 4: Premium Membership

Membership should come later, after the core network is useful for free.

Do not charge for basic discovery, basic requests, or basic quick contact early.

Possible later premium features:

- advanced filters
- priority notifications for matching games
- early access to curated games
- profile boost for active public player cards
- saved searches
- personal game history

## 90-Day Execution Plan

### Phase 1: Weeks 0-2 - Validate Player Discovery

Goal: prove that Taipei tennis players will use the product to find and contact
compatible partners.

Actions:

- Recruit 30-50 Taipei tennis players into a private beta.
- Ask each tester to complete a player card with NTRP, usual courts, available
  time slots, play types, and LINE ID.
- Observe which use cases appear most often: rally, doubles, practice, match
  play, beginner-friendly games.
- Track every quick-contact action and manually ask whether it led to a real
  conversation or game.

Success metrics:

- 100 valid public player cards
- 30 quick-contact actions per week
- 10 confirmed real-world games formed

### Phase 2: Weeks 3-6 - Turn Requests Into Active Games

Goal: make short-lived partner requests feel like actionable games instead of
static posts.

Actions:

- Add game-like request fields: court, date/time, level range, desired play
  type, required players, notes, and status.
- Show active games on the map alongside player cards.
- Auto-hide expired games.
- Let users express interest, then continue coordination through LINE.
- Keep request publishing free.

Success metrics:

- 20 active game requests per week
- 30% of requests receive at least one interested player
- 5 games per week are confirmed as formed through the platform

### Phase 3: Weeks 7-10 - Run Paid Game Experiments

Goal: validate the first revenue stream with manual operations.

Actions:

- Run 2-3 curated paid games per week.
- Start with tightly scoped formats by level, court, and play type.
- Collect payment manually at first if needed.
- Keep a simple post-game feedback form.
- Track repeat participation.

Suggested initial games:

- NTRP 2.5-3.0 beginner rally game
- NTRP 3.0-3.5 doubles practice game
- women-friendly beginner game
- weekday evening fixed practice game
- weekend four-player doubles game

Success metrics:

- 2 paid games per week
- 60% or higher fill rate
- average satisfaction of 4/5 or higher
- 30% of participants join another game

### Phase 4: Weeks 11-12 - Add Coach And Organizer Supply

Goal: create a second revenue path from demand-driven classes and hosted games.

Actions:

- Recruit 3-5 vetted coaches or organizers.
- Share demand patterns by level, court, and time slot.
- Test one coach-led group class or clinic.
- Test one organizer-led social game.
- Measure signup conversion from product surfaces.

Success metrics:

- 1 coach-led paid session launched
- 1 organizer-led paid game launched
- at least 10 paid participant signups from the product
- one repeatable partner format selected for the next month

## Product Roadmap

### Now

- Free map-based player discovery
- Public player cards
- Quick LINE contact
- Profile completeness gates
- Short-lived partner requests
- Basic report entry points

### Next

- Game-like request model
- Active game status
- Interested-player action
- Manual paid game pages or records
- Simple post-game feedback
- Basic operational dashboard or export

### Later

- Coach or organizer profiles
- Class and clinic pages
- Payments
- Waitlists
- Recurring games
- Premium notifications
- Venue partnership pages

## Metrics

### North Star Metric

Confirmed games formed per week.

### Activation Metrics

- completed player cards
- public player-card opt-in rate
- users with at least one usual court
- users with at least one available time slot

### Matching Metrics

- quick-contact actions per week
- request posts per week
- requests with at least one interested player
- requests marked as formed

### Revenue Metrics

- paid games per week
- fill rate
- revenue per game
- repeat participant rate
- coach/class referral conversion

### Quality Metrics

- report rate
- cancellation rate
- no-show rate
- post-game satisfaction
- users who hide or disable public profile after contact

## Things Not To Do Yet

- Do not build in-app chat.
- Do not build a complete venue-booking system.
- Do not charge ordinary users for basic matching.
- Do not build a social feed.
- Do not expand beyond Taipei before local density is meaningful.
- Do not build a generic coach marketplace before demand-driven class tests
  succeed.
- Do not add complex reputation, rating, or ranking systems before beta feedback
  shows a clear need.

## Open Decisions

- Whether paid game service fees should be collected by the platform at first or
  handled manually by the organizer.
- Whether early games should be hosted by the project owner, trusted beta users,
  or partner coaches.
- Whether the first commercial partner should be a coach, an independent
  organizer, or a venue.
- How to define a confirmed game: self-reported by organizer, self-reported by
  participant, or inferred from post-game feedback.

## Recommended Next Step

Build the next product increment around active game requests:

1. Keep free player discovery unchanged.
2. Upgrade partner requests into game-like objects.
3. Add status, player count, and interested-player intent.
4. Manually run two paid games from observed demand before adding payment
   infrastructure.
