# Tidepool Solitaire: Design Doc

A casual peak-style solitaire game with a collection meta layer, in the genre of farm/harvest solitaire games but with its own ocean theme, layouts and art. You clear card boards under the sea, rescue the creatures riding on the cards, and use them to restore a coral reef.

Play it at `/solitaire/`. Plain HTML/CSS/JS, no build step, no image files (cards are CSS, art is emoji), saves to `localStorage`. Mobile-first, with the same Android hooks as Strata Tycoon, so it can be wrapped as a Play Store app the same way.

## Core loop

```
 PLAY LEVEL ──▶ earn coins + rescue creatures ──▶ RESTORE REEF ZONES ──▶ wilds + coins
     ▲                                                                       │
     └──────────────── boosters make harder levels winnable ◀────────────────┘
```

## Card rules

- Tap a **face-up** card that is **one rank above or below** the top card of your pile. Suits don't matter. **K and A connect.**
- A card is face-up once nothing overlaps it.
- No move? Tap the **deck** to draw a new top card. This **breaks your streak**.
- Clear every card on the board to win.

## Level features (unlock as you progress)

| Feature | From | What it does |
|---|---|---|
| Creatures 🐠 🐚 | Level 1 | Riding on cards. Clear the card to rescue it. Used to restore the reef. |
| 🦐 Shrimp, 🦀 Crab, 🐙 Octopus | 3 / 5 / 8 | New creature types (needed for later reef zones) |
| 🗝️ Key + 🔒 Locked cards | Level 4 | Locked cards can't be played until the key card is cleared |

Layouts rotate: Three Peaks, Great Pyramid, Twin Peaks, Rolling Waves, Diamonds, Sea Wall. Layout geometry is data-driven (`x`, `y`, `z` per card). Covering is computed from overlap, so new layouts are a few lines each.

## Fair deals (the important part)

Fully random peak-solitaire deals are often unwinnable, which feels unfair. In bot testing, random Great Pyramid deals were lost 11/11 times. Tidepool uses two layers:

1. **Solvable board.** The game first picks a random legal clearing order (respecting covers and locks), cuts it into *runs*, and gives each run a rank chain where each card is ±1 from the last. So the board always contains good chains.
2. **Helpful deck.** Stock cards are dealt at draw time. With probability `help` the drawn card is one rank away from a card the player can see, preferring cards that start longer chains. Otherwise it's random. This adapts when the player takes a different route than the plan.

Difficulty dials per level `n`:

| Dial | Formula | Level 1 → Level 20 |
|---|---|---|
| Run length | `runMin = max(2, 5 − n/4)`, `runMax = max(4, 10 − n/3)` | 5–10 → 2–4 |
| Spare cards (`slack`) | `max(4, 16 − n)` | 15 → 4 |
| Helpful draw chance | `max(0.45, 0.9 − 0.025(n−1))` | 90% → 45% |

**Bot playtest** (greedy, never uses Undo or Wild): levels 1–5 won first try. Levels 6–9: ~70%. Levels 10–16: ~35%, which is where boosters matter.

## Economy

| Thing | Amount |
|---|---|
| Starting coins / wilds | 300 / 2 |
| Coins per card | `5 + min(45, 5 × streak)` |
| Clear bonus | 50 + 20 per stock card left |
| Streak reward | every 8-card streak gives +1 Wild |
| Undo | 25 coins (also takes back coins earned by the undone move) |
| Buy a Wild | 150 coins |
| +5 cards when stuck | 100, 200, 350, 500 (escalates within a level) |
| Losing | you keep coins and creatures earned (soft fail) |

**Stars:** 3 if you finish with ≥60% of the spare cards, 2 if ≥25%, else 1. Buying +5 cards caps you at 1 star.

## Reef meta

Five zones per reef, each costs creatures + coins and pays Wilds/coins:

| Zone | Needs (Reef 1) | Reward |
|---|---|---|
| Kelp Garden | 🐠6 🐚4 · 200🪙 | 2 🃏 |
| Coral Arch | 🐠8 🦐5 · 400🪙 | 2 🃏 + 300🪙 |
| Crab Cove | 🦀6 🐚8 · 700🪙 | 3 🃏 |
| Octopus Den | 🐙5 🦐8 · 1000🪙 | 3 🃏 + 800🪙 |
| Sunken Galleon | 🐠10 🦀8 🐙6 · 1600🪙 | 5 🃏 + 2000🪙 |

Restoring all five starts the next reef tier, with requirements and rewards ×1.75, ×2.5, …

## Known gaps / tuning to do

- **Coins are too generous.** The bot had 17K coins by level 16 with nothing to spend them on. Fixes: add a coin cost to start levels (the genre standard, with the bet scaling payouts) or more coin sinks (decorations).
- No energy/lives system. That's intentional for now; add only if monetizing.
- Map shows 4 locked levels ahead. Could become a scrolling island map with themed areas per 10 levels.

## Roadmap ideas

1. **More card modifiers:** bubble cards (×2 coins), ink cards (face-down until neighbour cleared), tide timer cards (must clear within N moves).
2. **Daily reef challenge** with a fixed seed, so everyone gets the same deal.
3. **Decorations shop** as a coin sink: place items in the reef scene.
4. **Animated reef scene** (canvas) instead of zone cards, with restored creatures swimming around.
5. **Android build:** copy the `strata-app/` setup, point `build-www` at `../solitaire`, new app ID.
