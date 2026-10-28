# Demo video: voice-over

The video is built with [Remotion](https://remotion.dev). Each scene lasts as long as its voice-over file, so swapping the voice re-times the video automatically.

## Swap in a real voice

1. Record or generate one file per scene with the text below, saved as `public/vo/<id>.mp3`.
2. `node scripts/vo.mjs --measure` (updates `src/vo.json` with the new lengths).
3. `pnpm render` (writes `out/shielded-lp-demo.mp4`). Preview with `pnpm dev`.

The current files are the author's cloned voice, generated locally with the global `voiceover` CLI (OmniVoice on the Apple GPU, model from the VoiceStudio app): `node scripts/vo.mjs --studio` (speed 1.15, override with `SPEED=`). A macOS `say` scratch track is still available with `RATE=172 node scripts/vo.mjs`.

| Scene | id | scratch length |
| --- | --- | --- |
| hook | `hook` | 6.28s |
| problem | `problem` | 19.36s |
| options | `options` | 15.98s |
| idea | `idea` | 9.37s |
| how | `how` | 15.16s |
| landing | `landing` | 8.49s |
| terminal | `terminal` | 23.06s |
| app | `app` | 28.29s |
| cta | `cta` | 7.81s |

## Lines

### hook

Five hundred ZEC. One deposit. And now everyone can see your size, your timing, and your history.

### problem

Zcash has the strongest privacy in crypto, but no smart contracts. So native ZEC liquidity lives on THORChain, live since October second. The catch: THORChain only reads transparent ZEC. Every position is a public address anyone can look up. So private holders stay out, and the pool sits at twenty two ZEC.

### options

Today there are three ways in, and all of them leak. Deposit from one address, and you publish everything. Wrap through a bridge or custodian, and someone else holds your keys. Split it by hand, and the same sizes, the same minutes, and an exit back in the open give you away.

### idea

So we built shielded-lp. A self custody Zcash wallet that turns one shielded balance into many small, unlinked positions, and shields every coin back when you leave.

### how

Four moves. Split into standard sizes everyone uses. Space each slice out at its own random time. Fund each one from the shielded pool to a fresh address, and join THORChain alone. Then exit the same way, and shield back to a fresh Ironwood address.

### landing

The public sees nine strangers. Your wallet knows five of them are you. Pool data is live from THORChain, and install is five copy paste steps.

### terminal

Under the hood is slp, a Rust command line tool on the official Zcash libraries. Create a wallet: the seed never leaves your machine. Get a shielded address to fund it. Plan five ZEC: five one ZEC slices, six to forty eight hours apart, slip checked against the live pool. And the tests build real version six transactions with the THORChain memo, and shield straight back into Ironwood.

### app

Then the app. It reads like a DEX: live price, depth and fees, on a real chart. Pick an amount, a slice size and the spacing, and see every slice on a timeline. Confirm, and each slice moves on its own: funded, joined, earning. You are in range, always, because THORChain is full range, and your entry sits right on the chart. The public view shows only strangers. Remove, and every slice exits on its own, and lands back in your shielded balance.

### cta

shielded-lp. Your liquidity, nobody's business. Try the demo at shielded-lp dot vercel dot app, or grab the code on GitHub.

## Footage

`public/clips/*.mp4` were recorded from the real app (demo mode) with `scripts/rec.mjs` and the step scripts `scripts/landing.mjs`, `scripts/app.mjs`, `scripts/closed.mjs`. Terminal output in the video is copied from real `slp` and `cargo test` runs.
