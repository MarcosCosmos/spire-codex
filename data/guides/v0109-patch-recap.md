---
title: "Patch Recap: Beta v0.109.0"
author: Spire Codex
date: 2026-07-17
updated: 2026-07-28
channel: beta
category: general
tags: ["patch notes", "balance", "v0.109.0", "v0.109.1"]
summary: "Everything in the July 16 beta patch, pulled from the game files: two new Neow relics, the reworks, the rarity shuffle, and the changes the patch notes left out. Updated with the v0.109.1 hotfix and the staged content sitting in the files."
---

# Patch Recap: Beta v0.109.0

The July 16 beta patch is a big one: two new Neow relics with exclusive rewards, a stack of reworks, a rarity shuffle across three characters, and the start of Traditional Chinese support. Here is everything that matters, pulled straight from the game files rather than the patch notes, which means it includes a couple of things the notes did not mention.

## Two new Neow relics

[[relic:Dowsing Rod]] adds a [[Dowsing]] quest card to your deck. Dowsing costs nothing and does nothing in combat, but after you enter 5 more ? rooms it transforms into [[Abundance]], an Ancient skill that lets you pick 1 of 3 upgraded Powers to add to your hand, free to play that turn. If you like reading ? room odds (see our unknown rooms page for how those actually work), this relic pays you for routing through them.

[[relic:Neow's Sacrifice]] gives you an [[potion:Ambergris]] and adds a Guilty curse to your deck. Ambergris heals 50% of your max HP and gives you an extra turn, which is the kind of potion you sit on until a boss tries to kill you. The curse is the price.

## The stuff the patch notes didn't tell you

Two changes shipped in the build without a line in the notes:

- [[Tutor]] is a brand new Regent rare for multiplayer: another player chooses a card in their draw pile to add into their hand. It was not announced anywhere.
- [[Mirage]] got completely reworked, from "Gain Block equal to Poison on ALL enemies" at 1 cost to a 0-cost skill that gives you energy next turn. Mega Crit quietly edited the patch notes after the fact to add this one.

## Reworks

- [[Well-Laid Plans]] is now a rare power, cost 1 (0 upgraded): at the end of your turn you no longer discard your hand. It also works in multiplayer now.
- [[Expertise]] no longer draws to a hand size. It draws 2 (3) cards and they gain Retain this turn.
- [[Eidolon]] now plays ALL Ethereal cards in your exhaust pile, then exhausts. Necrobinder players have some thinking to do.
- [[Pillar of Creation]] triggers once per turn now: the first time you create a card each turn, gain 5 (7) Block instead of 3 per creation.
- [[relic:Diamond Diadem]] drops its play-2-or-fewer-cards condition entirely: start combat with 20 Block that is not removed at the start of your next turn.
- [[relic:History Course]] only repeats Attacks now, not Skills.

## The rarity shuffle

Rarity changes move cards between draft pools, so these change what you see in rewards more than what the cards do:

- [[Taunt]] is Common now (and blocks 6 (8), down from 7)
- [[Bloodletting]] moves up to Uncommon
- [[Cruelty]] drops from Rare to Uncommon
- [[Dominate]] climbs from Uncommon to Rare
- [[Accelerant]] drops from Rare to Uncommon

## Number changes worth knowing

- [[Demon Form]] gives 3 (4) Strength per turn, up from 2 (3)
- [[Hyperbeam]] hits for 30 (38), [[Sunder]] for 26 (34)
- [[Outbreak]] deals 4 (5), up from 3 (4)
- [[Primal Force]]'s Giant Rock tokens hit for 20 (24), up from 16 (20)
- [[Expect a Fight]] no longer locks your energy gain for the turn
- [[Collision Course]] drops to 10 (14) damage
- [[Trash to Treasure]]'s upgrade now lowers its cost instead of granting Innate

## Enemies

[[monster:Aeonglass]] got its front-loaded damage pulled back: Ebb drops from 26 (32) to 22 (26). Our encounter stats have Aeonglass as the deadliest boss in the game, so this nerf is aimed straight at that spike. Meanwhile [[monster:Torch Head Amalgam]] goes the other way with a new Strong Tackle opener at 26 (32), so act 3 hallway fights just got meaner.

## Ancients

- Tanx's [[relic:Meat Cleaver]] cook heal drops from 9 to 5
- Tezcatara's [[relic:Toy Box]] gives 5 wax relics, up from 4
- Vakuu's [[relic:Fiddle]] draws 3, up from 2
- Vakuu's [[relic:Sere Talon]] and [[relic:Distinguished Cape]] swapped downsides
- Orobos' [[relic:Sand Castle]] moved from Pool 1 to Pool 2
- Darv's blessing pools got shuffled for more variety, so expect Energy relics more often

## Multiplayer

The co-op damage kings all got taxed: [[Midnight]] drops from 99 (120) to 60 (72), [[The Ball]] scales at +10 (15) instead of +15 (25), and [[Blade Symphony]] costs 2 (1) with the upgrade no longer adding extra Shivs. You can also play nearly any potion on another player now, which makes Ambergris even more interesting in co-op.

## Traditional Chinese

The game started translating into Traditional Chinese this patch, and Spire Codex supports it already: the whole site runs in 繁體中文 on the beta channel, including the full set of game-rendered card images in Traditional Chinese. Pick it from the language menu.

Every change above is live in our beta channel data, and you can compare any card's stats across patches with the version filter on the stats pages. The full machine-generated diff is on the changelog page.

## Update: v0.109.1 (July 25)

The official notes for this hotfix are one line: corrected Traditional Chinese translations to fix broken plural evaluation. The data side is nearly as small. Three monsters got real attack patterns defined where the data previously had none: [[monster:Byrdonis]] cycles Swoop then Peck, [[monster:Haunted Ship]] goes Haunt then Swipe then Stomp instead of "always uses Haunt", and Leaf Slime (M) alternates Sticky Shot and Clump Shot. Our monster pages show those cycles now. That, plus the Traditional Chinese fix, is the whole patch.

### Staged content sitting in the files

Worth knowing while we are in here: the game files have been carrying a batch of unreleased content since at least v0.108.0, unchanged across builds and shipping in the current stable build too. The Adversary Mk 1, Mk 2, and Mk 3 are escalating versions of one kit (Smash becomes Bash becomes Crash, a Beam that grows from 15 to 18 damage, and a multi-hit Barrage), alongside an escalating Battleworn Dummy event chain (V1, V2, and V3 encounters, matching the three Mks) that reads like the delivery mechanism whenever it goes live. Four powers ride with them: Gravity (whenever you play a card this turn, deal 2 damage to ALL enemies), Leadership (all other allies deal 1 additional damage), Magic Bomb (take 20 damage at the end of your turn, cleared if the Magi Knight dies, and there is no Magi Knight in any build we have), and No Energy Gain (you cannot gain additional energy this turn). There is also the Slumbering Essence enchantment: a card still in your hand at end of turn drops its cost by 1 until played. None of it is reachable in normal play yet.

No card text, values, or art changed, so every existing card render stays current. The machine diff is on the changelog page under v0.109.1.
