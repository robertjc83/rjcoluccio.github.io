# Strata Tycoon: Design Doc

An idle/incremental drilling game in the spirit of farm-and-ship idlers and depth-drilling idlers, with its own theme: you run a mining outfit boring straight down through alien planets.

Play it at `/idle/` on the site. Plain HTML/CSS/JS, no build step, saves to `localStorage`.

## Core loop

```
 DRILL RIGS ──dig──▶ SILO ──haul──▶ MARKET ──credits──▶ buy rigs / haulers / upgrades
     ▲                (capacity)        (rate)                        │
     └────────────────────────────────────────────────────────────────┘
```

1. **Dig.** Rigs produce ore. Each unit dug also pushes the drill deeper.
2. **Store.** Ore piles up in the silo. When the silo is full, **the drill stalls**, so depth stops too.
3. **Haul.** Haulers move ore to market and convert it to credits.
4. **Spend.** Credits buy more rigs, haulers and upgrades.

The silo and haulers make up the *bottleneck triangle* (dig rate, storage, haul rate). The player is always fixing whichever one is the weakest. That decision is the heart of the game, and it's what makes it feel like managing an operation rather than just watching a number go up.

## Depth and layers

- Every **100 m** is a new layer (Topsoil, Clay, Shale, Granite, Iron Vein … Core, then endless "Abyss N").
- Layer `i` has **hardness `2.4^i`** (slows digging) and **ore value `2.7^i`**.
- Going deeper is always better per ore but slower per meter, so progress naturally decelerates into a soft wall. That wall is the signal to prestige.

## Active play (optional, never required)

| Mechanic | What it does |
|---|---|
| **Overdrive** (hold button / hold on scene / Space) | Ramps dig speed up to x2 (more with Turbo Coils), decays when released |
| **Geodes** | Appear on screen every 30–70 s for 10 s. Tap for max(30 s of income, 5% of bank) |

## Economy

| Item | Base cost | Cost growth | Effect |
|---|---|---|---|
| Drill Rig | 10 | x1.22 | +1 rig (power `1.25^bitLevel` ore/s each) |
| Hauler | 25 | x1.20 | +1 hauler (`2 × 1.35^cargoLevel` ore/s each) |
| Diamond Bits | 50 | x1.85 | Rig power x1.25 |
| Bigger Silo | 40 | x1.7 | Capacity x1.6 (base 30) |
| Cargo Beds | 60 | x1.8 | Hauler speed x1.35 |
| Market Contacts | 300 | x2.0 | Ore value x1.15 |
| Turbo Coils (max 20) | 200 | x2.3 | Overdrive peak +0.5x |
| Night Shift (max 10) | 500 | x3.0 | Offline cap +1 h (base 2 h) |

Depth per ore: 0.15 m.

## Prestige: "Launch"

- Unlocks at **500 m**.
- Grants **Core Shards = ⌊ ∛(credits earned this run / 10,000) ⌋**.
- Each shard: **+10% ore value**, permanent.
- You move to the next planet: hardness **x2**, value **x3** per planet, new color palette and name.
- Resets credits, depth, rigs, haulers and all upgrades.

## Offline progress

On return (or tab refocus), the real simulation runs in 2 s steps for the time away, capped by Night Shift (2–12 h). Running the real sim means the silo and hauler bottlenecks still apply offline, so a well-balanced operation earns more while you're away.

## Pacing (greedy auto-buyer simulation, no overdrive/geodes)

| Milestone | Planet 1 | Planet 2 (15 shards) |
|---|---|---|
| 100 m | 2.4 min | 1.3 min |
| 500 m (launch unlocked) | 10 min | 5.7 min |
| 1000 m | 42 min | 26 min |
| 1500 m | ~3.5 h (wall) | ~2.3 h |

Target feel: fast early layers to hook the player, first launch in a 15–45 minute session, and each new planet clearly faster than the last.

## Roadmap ideas

1. **Shard shop** (the long-term "epic research" layer): spend shards on permanent perks instead of only the passive bonus.
2. **Rig tiers**: unlock better rig types per layer (Laser Bore, Plasma Lance) with flat multipliers.
3. **Managers / automation**: auto-buy haulers to match dig rate.
4. **Missions/contracts**: "Reach Gold Reef in 15 min" for shard rewards. Gives sessions short-term goals.
5. **Artifacts**: rare drops from geodes that slot into the rig for bonuses.
6. **Events**: timed planet-wide boosts (meteor shower: x2 ore value for 10 min).
7. **Sound**: reuse the arcade's chiptune SFX engine for drill hum, sell ka-ching, geode crack.
8. **Number scaling**: swap to a big-number library (break_infinity.js) once values exceed ~1e300.
