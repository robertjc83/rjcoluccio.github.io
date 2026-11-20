# Tidepool Solitaire: Android app

Wraps the web game in [`../solitaire`](../solitaire) as a native Android app using [Capacitor](https://capacitorjs.com). It's set up exactly like [`../strata-app`](../strata-app); see its README for the full walkthrough (signing key, GitHub secrets, Play Console steps). Make game changes in `solitaire/`; this folder only packages them.

| | |
|---|---|
| App ID | `io.github.rjcoluccio.tidepoolsolitaire` (permanent once published) |
| Target SDK | 36 |
| Debug APK artifact | `tidepool-solitaire-debug-apk` |
| Release AAB artifact | `tidepool-solitaire-release-aab-vN` (once signing secrets are set) |
| Privacy policy URL | `https://rjcoluccio.github.io/solitaire/privacy.html` |

Both apps are built by the same **Android build** workflow and signed with the same upload key (the same four GitHub secrets). Google allows one upload key across several apps.

## Play Store listing

- Category: **Games → Card**. Free.
- Icon: `assets/play-icon-512.png`. Feature graphic: `assets/feature-graphic.png`.
- Short description: *Peak solitaire under the sea. Clear cards, rescue creatures, restore the reef.*
- Ads: No. Data safety: no data collected. In-app purchases: none (coins are earned in-game only).
- Content rating: no gambling with real money, and coins can't be bought, so expect *Everyone*.

## Regenerating art

```bash
npm install
node scripts/make-art.cjs   # needs Playwright (preinstalled in Claude Code cloud sessions)
npm run icons               # every Android icon/splash size, then compresses the splash PNGs
```
