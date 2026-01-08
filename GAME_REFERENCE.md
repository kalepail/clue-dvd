# Clue DVD Game (2006) - Game Reference

> **VERIFIED FROM PHYSICAL CARDS** (January 2026)
> All card names confirmed against actual game components

> **NOTE**: This project's web app **replaces the DVD** as game master. Players still use the physical board, cards, pawns, and magnifying glass. The DVD is no longer needed.

---

## Game Overview

| Property | Value |
|----------|-------|
| **Full Name** | Clue DVD Game (US) / Cluedo DVD Game (UK) |
| **Publisher** | Parker Brothers / Hasbro |
| **Release** | 2006 (US), October 2005 (UK) |
| **Players** | 1-6 (expanded from original 3-5) |
| **Duration** | ~45-60 minutes per mystery |
| **Theme** | THEFT investigation (not murder) |
| **Setting** | Tudor Mansion, September 1925 - May 1926 |
| **Game Master** | Web app (replaces DVD) |

### The Four Mystery Categories

| Element | Question | Count |
|---------|----------|-------|
| WHO | Which suspect? | 10 |
| WHAT | Which item stolen? | 11 |
| WHERE | Which location? | 11 |
| WHEN | Which time? | 10 |

**Total Cards**: 42
**Possible Solutions**: 10 × 11 × 11 × 10 = **12,100**

---

## Suspects (10) - VERIFIED

| Name | Notes |
|------|-------|
| Miss Scarlet | Classic suspect |
| Colonel Mustard | Classic suspect |
| Mrs. White | Classic suspect (housekeeper) |
| Mr. Green | Reverend Green in UK version |
| Mrs. Peacock | Classic suspect |
| Professor Plum | Classic suspect |
| Mrs. Meadow-Brook | Widow of Mr. Boddy's late solicitor |
| Prince Azure | Art and arms dealer, aristocrat |
| Lady Lavender | Herbalist of Asian heritage |
| Rusty | Gardener (full name: Rusty Nayler) |

---

## Stolen Items (11) - VERIFIED

These are **valuables stolen from Mr. Boddy's collection**, NOT weapons.

| US Name | UK Name | Notes |
|---------|---------|-------|
| Spyglass | Telescope | Optical instrument |
| Revolver | Revolver | Collectible firearm (not a weapon in this game) |
| Rare Book | Rare Book | From Mr. Boddy's library |
| Medal | Medal | Gift from uncle Dr. Black |
| Billfold | Wallet | Leather accessory |
| Gold Pen | Gold Pen | Writing instrument |
| Letter Opener | Letter Opener | Desk accessory |
| Crystal Paperweight | Crystal Paperweight | Desk ornament |
| Pocket Watch | Pocket Watch | Timepiece |
| Jade Hairpin | Jade Hairpin | Jewelry piece |
| Scarab Brooch | Scarab Brooch | Egyptian-style pin |

---

## Locations (11) - VERIFIED

### Indoor Rooms (9)

| Room | Secret Passage To |
|------|-------------------|
| Hall | - |
| Lounge | Conservatory |
| Dining Room | - |
| Kitchen | Study |
| Ballroom | - |
| Conservatory | Lounge |
| Billiard Room | - |
| Library | - |
| Study | Kitchen |

### Outdoor Locations (2)

| Location |
|----------|
| Rose Garden |
| Fountain |

### Special Location

- **Evidence Room** - Center of board, starting point, accusation-only (NOT a theft location)

---

## Time Periods (10) - VERIFIED

| Time | Sequence |
|------|----------|
| Dawn | 1st |
| Breakfast | 2nd |
| Late Morning | 3rd |
| Lunch | 4th |
| Early Afternoon | 5th |
| Tea Time | 6th |
| Dusk | 7th |
| Dinner | 8th |
| Night | 9th |
| Midnight | 10th |

---

## Mystery Themes (12 Total)

The original DVD contained 10 pre-programmed cases. **The web app uses these themes as context for AI-generated mysteries**, creating unlimited unique scenarios.

| Theme | Setting |
|-------|---------|
| The Monte Carlo Affair | September 1925 |
| The Garden Party | Fall 1925 |
| A Bad Sport | Fall 1925 |
| The Hunt | Fall 1925 |
| The Autumn Leaves | Late Fall 1925 |
| The Costume Party | Winter 1925 |
| Spring Cleaning | Spring 1926 |
| A Princess Is Born | Spring 1926 |
| A Grand Ball | Spring 1926 |
| The Last Straw | May 1926 |
| Christmas at the Mansion | December 1925 |
| A Dark and Stormy Night | Winter 1925-1926 |

**AI Generation**: Each theme provides narrative context for the AI to generate period-appropriate clues and commentary

---

## Key Characters (Non-Playable)

| Character | Role |
|-----------|------|
| **Inspector Brown** | Scotland Yard detective, provides Inspector's Notes |
| **Ashe** | Butler, provides testimonies when summoned |
| **Mr. Boddy** | Victim of theft (Dr. Black in UK) |

---

## Gameplay Mechanics

### Card Distribution

1. **Case File Envelope**: 4 solution cards (1 each category)
2. **Butler's Pantry**: Item cards (dealt during game, not at start)
3. **Player Hands**: Remaining suspect/location/time cards
4. **Evidence Room**: Leftover cards displayed publicly

### Turn Actions

- **Make a Suggestion** - Name 3 of 4 categories (leave one out)
- **Summon the Butler** - Get public clue + private item card
- **Read Inspector's Note** - Get private clue from rulebook
- **Make an Accusation** - From Evidence Room only, name all 4

### Key Differences from Classic Clue

| Feature | Classic Clue | DVD Game |
|---------|--------------|----------|
| Crime | Murder | Theft |
| Categories | 3 | 4 (adds time) |
| Movement | Dice | Room-to-room |
| Item cards | Dealt at start | Dealt during game |
| Wrong accusation | Eliminated | Reveal cards, continue |

---

## Clue Logic for Scenario Generation

Clues work by **elimination**. Examples from DVD testimonies:

| Clue Type | Example | What It Eliminates |
|-----------|---------|-------------------|
| Alibi | "Mrs. White never left the Lounge during Dusk" | Eliminates Mrs. White as suspect |
| Group | "Colonel Mustard, Professor Plum, and Mr. Green were arguing together" | Eliminates those 3 suspects |
| Item secured | "All jewelry was locked up by midnight" | Eliminates jewelry items after midnight |
| Location | "The Study was locked all weekend" | Eliminates Study as theft location |
| Time | "The item was still there at Tea Time" | Eliminates times before Tea Time |

**CRITICAL RULE**: Generated clues must NEVER eliminate the actual solution.

---

## Card Symbol System - VERIFIED

Each card has hidden symbols on the back, visible only through the red magnifying glass. **The web app displays these symbols so players can find the matching physical cards** to set up the game.

### Symbols (5 types)
- Spyglass
- Fingerprint
- Whistle
- Notepad
- Clock

### Positions (6 per card)
1. Top Left
2. Top Right
3. Middle Left
4. Middle Right
5. Lower Left
6. Lower Right

### Physical Setup Process (Using Web App)
1. **Web app generates mystery** and displays symbol grids for 4 solution cards
2. **Players use magnifying glass** to find physical cards matching the displayed symbols
3. **Place solution cards in envelope** (Case File)
4. **Deal remaining cards** and begin play

**Complete symbol data**: See `src/data/card-symbols.ts` (252 total assignments)

### Why Symbols Still Matter
The symbol system enables **physical/digital mirroring**. Players can:
- Use the web app as game master for unlimited new mysteries
- Still enjoy the tactile experience of physical cards and the magnifying glass
- Set up the physical game to match the app-generated solution
