---
title: "Patch Recap: Beta v0.110.0"
author: Spire Codex
date: 2026-07-30
channel: beta
category: general
tags: ["patch notes", "balance", "v0.110.0"]
summary: "Everything in the July 30 beta patch, pulled from the game files: the Silent poison shake-up, the Mirage and Pillar reverts, a new keyboard-only mode, and the changes the patch notes left out."
---

# Patch Recap: Beta v0.110.0

The July 30 beta patch is mostly a balance pass with a theme: walking back the v0.109.0 experiments that didn't land. Mirage and Pillar of Creation revert to their old designs, Silent's poison package gets reshuffled around a reworked Outbreak, and the game picks up a keyboard-only control mode. Here is everything that matters, pulled straight from the game files, including a couple of changes the notes did not mention.

## The stuff the patch notes didn't tell you

- The [[power:Child of the Stars]] power now gives 2 Block for each star spent, up from 1. Regent's star-heavy turns just got noticeably safer, and it is nowhere in the notes.
- The Brain Leech event had its flavor text quietly touched up. Nothing mechanical, but if the wording looks different, you are not imagining it.

## The revert patch

Three v0.109.0 changes got rolled back, with small tweaks on the way out:

- [[Mirage]] is back to "Gain Block equal to Poison on ALL enemies" at 1 cost (0 upgraded), and it no longer Exhausts. The energy-next-turn version lasted exactly one patch.
- [[Pillar of Creation]] triggers on every card you create again, at 2 (3) Block per creation instead of the old 3 (4). The once-per-turn design did not die though, because...
- [[relic:Regalite]] took it. The relic went from 2 Block per created card to 6 Block the first time you create a card each turn. Pillar and Regalite effectively swapped philosophies.
- [[relic:Fiddle]] also reverts: back down to 2 additional draws per turn.

## Silent's poison shuffle

- [[Outbreak]] is a completely different card: the 1-cost power ("whenever you apply Poison, deal 4 damage to ALL enemies") is gone, replaced by a 3-cost Rare skill that applies 9 (12) Poison to ALL enemies and triggers it immediately. It is a burst finisher now, not an engine. The old Outbreak power page is retired with it.
- [[Haze]] drops from 3 cost to 2, loses Sly, and now applies 1 (2) Weak on top of its 4 (6) Poison to ALL enemies.
- [[Sidestep]] replaces Scare, and here is the fun part: its effect ("Next turn, gain 1 (2) Energy" at 0 cost) is exactly what Mirage was for the last two weeks. The design survived, it just moved to a new card.
- [[Well-Laid Plans]] costs 2 (1) now, up from 1 (0).
- [[Echoing Slash]] drops from Rare to Uncommon, so expect to see it in rewards more often.

## Ancient changes

- [[Abundance]] now always creates Upgraded powers, and its own upgrade lowers the cost to 0.
- [[relic:Toasty Mittens]] exhausts a card from your hand instead of the top of your draw pile. You pick the fodder now, which is most of the relic's downside gone.
- [[relic:Seal of Gold]] costs 3 Gold per turn instead of 5.
- [[relic:Beautiful Bracelet]] enchants 4 cards, up from 3, but the Swift amount drops from 3 to 2.
- [[relic:Fur Coat]] marks 8 combats, up from 7.
- [[relic:Signet Ring]] pays out 888 Gold instead of 999.
- [[Relax]] blocks for 16 (18), [[Whistle]] costs 2 instead of 3, and [[Maul]] scales all Mauls by 2 (3) per play instead of 1 (2).

## Number changes worth knowing

- [[Mangle]] jumps from 15 (20) to 20 (26) damage, easily the biggest single buff in the patch.
- [[Pact's End]] hits for 18 (24).
- [[Biased Cognition]] gives 5 (6) Focus, up from 4 (5).
- [[Refract]] deals 10 (13) twice.
- [[Synchronize]] no longer Exhausts, and its upgrade now gives 3 temp Focus per unique Orb instead of 2.
- [[Rocket Punch]] gets a quiet nerf: creating a Status reduces its cost by 1 instead of straight to 0.
- [[Crush Under]] deals 8 (9) to ALL enemies.
- [[Terraforming]] gives 7 (10) Vigor.
- [[The Scythe]] permanently grows by 5 (7) damage per play, up from 4 (5).
- [[Sacrifice]] gives Block equal to triple Osty's max HP, up from double.
- [[Eidolon]] can no longer be generated mid-combat, so no more pulling it out of card-creation effects.

## Everything else

- A keyboard-only control mode is in, remappable bindings and all. Mega Crit is asking for feedback on it, so if you play mouse-free, this patch is for you.
- The map screen has a Share button that screenshots the whole map.
- Seven cards got new portrait art (Constellation, Blade Symphony, Concoct, Tutor, Imitation Learning, Soulbound, Fade), characters have VFX on their unique forms, and Test Subject's burn animation actually burns now.
- Uncommon cards show up slightly more often in rewards. That was always the intent; the patch just fixed the odds.
- A nasty Timeline bug is fixed: an Epoch unlock earned at the end of a run could be lost forever and block progress. Affected saves repair themselves on load.
- Multiplayer cleanup: Tutor un-ends the target's turn, Feral puts The Ball in your own hand, and the Imitation Learning and Tutor softlocks with Replay are gone.

The full field-by-field diff is on the [changelog](/beta/changelog) page, and every card and relic above shows its own patch history on its detail page.
