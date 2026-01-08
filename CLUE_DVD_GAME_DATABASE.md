# Clue DVD Game (2006) - Comprehensive Database

> Complete reference for AI-powered Clue DVD Game scenario generation

---

## Table of Contents

1. [Game Overview](#game-overview)
2. [The Four Mystery Elements](#the-four-mystery-elements)
3. [Suspects (10)](#suspects-10-total)
4. [Stealable Items (11)](#stealable-items-11-total)
5. [Locations (11 + Evidence Room)](#locations-11--evidence-room)
6. [Time Periods (10)](#time-periods-10-total)
7. [Mystery Scenarios (12 + Random)](#mystery-scenarios)
8. [Gameplay Mechanics](#gameplay-mechanics)
9. [DVD Interactive Elements](#dvd-interactive-elements)
10. [Card System & Red Magnifying Glass](#card-system--red-magnifying-glass)
11. [Game Components](#game-components)
12. [Data Structures for AI](#data-structures-for-ai-generation)

---

## Game Overview

| Property | Value |
|----------|-------|
| **Full Name** | Clue DVD Game (US) / Cluedo DVD Game (UK) |
| **Publisher** | Hasbro / Parker Brothers |
| **Designer** | Rob Daviau |
| **Release** | October 2005 (UK), 2006 (US) |
| **Players** | 3-5 |
| **Duration** | ~60 minutes per mystery |
| **Age** | 10+ |
| **Theme** | Theft investigation at Tudor Mansion |
| **In-Game Timeline** | September 1925 - May 1926 |

### Premise

Mr. Boddy (Dr. Black in UK) has had a valuable item stolen from his collection during a gathering at Tudor Mansion. Players work alongside Inspector Brown of Scotland Yard to determine:

- **WHO** committed the theft (suspect)
- **WHAT** was stolen (item)
- **WHERE** it was taken from (location)
- **WHEN** it happened (time)

### US vs UK Version Differences

| Element | UK Version | US Version |
|---------|------------|------------|
| Victim name | Dr. Black | Mr. Boddy |
| Green suspect | Reverend Green | Mr. Green |
| Item name | Telescope | Spyglass |
| Item name | Wallet | Billfold |

---

## The Four Mystery Elements

| Element | Category | Count | Total Cards |
|---------|----------|-------|-------------|
| WHO | Suspects | 10 | 10 |
| WHAT | Items | 11 | 11 |
| WHERE | Locations | 11 | 11 |
| WHEN | Times | 10 | 10 |
| **TOTAL** | | | **42 cards** |

### Solution Space

**10 × 11 × 11 × 10 = 12,100 possible solutions**

---

## Suspects (10 Total)

### Complete Suspect List

| ID | Name | Color | Role/Description |
|----|------|-------|------------------|
| S01 | Miss Scarlet | Red | Femme fatale, cunning socialite |
| S02 | Colonel Mustard | Yellow | Military officer, distinguished background |
| S03 | Mrs. White | White | Housekeeper/maid at Tudor Mansion |
| S04 | Mr. Green / Rev. Green | Green | Clergyman (Reverend in UK, Mr. in US) |
| S05 | Mrs. Peacock | Blue | High society matron, socialite |
| S06 | Professor Plum | Purple | Scholar and intellectual |
| S07 | Mrs. Meadow-Brook | Brown | Widow of Mr. Boddy's late solicitor Miles Meadow-Brook |
| S08 | Prince Azure | Light Blue | International art and arms dealer, aristocrat |
| S09 | Lady Lavender | Lavender | Herbalist of Asian heritage, rumored to have poisoned husband Sir Laurence |
| S10 | Rusty Nayler | Orange/Rust | Gardener at Tudor Mansion (name is pun on "rusty nail") |

### Supporting Characters (Non-Suspects)

| Name | Role | Function in Game |
|------|------|------------------|
| Inspector Brown | Scotland Yard Detective | Narrator, provides clues, controls game flow via DVD |
| Ashe | Butler | Can be summoned for clues, gives item cards as reward |
| Mr. Boddy / Dr. Black | Victim | Owner of Tudor Mansion, appears in Butler's testimonies |

---

## Stealable Items (11 Total)

### Complete Item List

| ID | US Name | UK Name | Category | Description |
|----|---------|---------|----------|-------------|
| I01 | Spyglass | Telescope | Antique | Optical instrument for observation |
| I02 | Revolver | Revolver | Antique | Collectible firearm |
| I03 | Rare Book | Rare Book | Antique | From Mr. Boddy's library collection |
| I04 | Medal | Medal | Antique | Given to Mr. Boddy by his uncle Dr. Black |
| I05 | Billfold | Wallet | Desk Item | Leather accessory, may contain documents |
| I06 | Gold Pen | Gold Pen | Desk Item | Expensive writing instrument |
| I07 | Letter Opener | Letter Opener | Desk Item | Ornate desk accessory |
| I08 | Crystal Paperweight | Crystal Paperweight | Desk Item | Decorative desk ornament |
| I09 | Pocket Watch | Pocket Watch | Jewelry | Timepiece, described as "very nice" |
| I10 | Jade Hairpin | Jade Hairpin | Jewelry | Ornate jade jewelry piece |
| I11 | Scarab Brooch | Scarab Brooch | Jewelry | Egyptian-style decorative pin |

### Item Categories

| Category | Items | Count |
|----------|-------|-------|
| Antiques | Spyglass, Revolver, Rare Book, Medal | 4 |
| Desk Items | Billfold, Gold Pen, Letter Opener, Crystal Paperweight | 4 |
| Jewelry | Pocket Watch, Jade Hairpin, Scarab Brooch | 3 |

### Item Card Mechanics

- Item cards are **NOT dealt to players** at game start
- Placed face-down in the **Butler's Pantry** location on the board
- Enter play gradually through:
  - Inspector Brown placing them face-down in rooms
  - Butler summons (summoning player receives top card from deck)
- To view face-down item cards in rooms, players must pass **observation tests**

---

## Locations (11 + Evidence Room)

### Indoor Rooms (9)

| ID | Room | Position | Secret Passage To |
|----|------|----------|-------------------|
| L01 | Hall | Center-North | None |
| L02 | Lounge | Corner (NE) | Conservatory |
| L03 | Dining Room | East | None |
| L04 | Kitchen | Corner (SE) | Study |
| L05 | Ballroom | South | None |
| L06 | Conservatory | Corner (SW) | Lounge |
| L07 | Billiard Room | West | None |
| L08 | Library | North-West | None |
| L09 | Study | Corner (NW) | Kitchen |

### Outdoor Locations (2)

| ID | Room | Description |
|----|------|-------------|
| L10 | Rose Garden | Outdoor garden area |
| L11 | Fountain | Outdoor water feature |

### Special Locations

| Location | Function |
|----------|----------|
| **Evidence Room** | Center of board. All players START here. Only place to make accusations. Cannot make suggestions here. Public cards displayed here. |
| **Butler's Pantry** | Holds item card deck. Not a playable room location. |

### Secret Passage Connections

```
Study (NW) ←――――――――――――――→ Kitchen (SE)
Lounge (NE) ←――――――――――――→ Conservatory (SW)
```

### Locked Room Mechanics

- Some rooms/passages start locked with plastic padlocks (4 included)
- DVD instructs which to lock during setup (varies by mystery)
- Inspector Brown announces when rooms unlock during play

---

## Time Periods (10 Total)

| ID | Time Period | Hours | Light Conditions | Description |
|----|-------------|-------|------------------|-------------|
| T01 | Dawn | 5-7 AM | Transitional | Staff beginning duties, early risers |
| T02 | Breakfast | 7-9 AM | Light | Morning meal in Dining Room |
| T03 | Late Morning | 9-11 AM | Light | Post-breakfast activities |
| T04 | Lunch | 11 AM-1 PM | Light | Midday meal |
| T05 | Early Afternoon | 1-3 PM | Light | Post-lunch leisure |
| T06 | Tea Time | 3-5 PM | Light | Afternoon tea gathering |
| T07 | Dusk | 5-7 PM | Transitional | Evening transition |
| T08 | Dinner | 7-9 PM | Dark | Formal evening meal |
| T09 | Night | 9 PM-12 AM | Dark | Evening activities |
| T10 | Midnight | 12-2 AM | Dark | Late night |

### Light/Dark Rules

- **Light outside**: Dawn through Dusk (T01-T07)
- **Dark outside**: After Dusk (T08-T10)
- **Transitional**: Dawn and Dusk are "neither light nor dark"
- Clue: "Any time all suspects are together, eliminate that time (no chance to sneak away)"

---

## Mystery Scenarios

### 10 Main Cases

| # | Case Name | Period | Theme |
|---|-----------|--------|-------|
| 1 | The Monte Carlo Affair | September 1925 | Gambling/casino |
| 2 | The Garden Party | Fall 1925 | Outdoor party |
| 3 | A Bad Sport | Fall 1925 | Competition |
| 4 | The Hunt | Fall 1925 | Hunting event |
| 5 | The Autumn Leaves | Late Fall 1925 | Seasonal |
| 6 | The Costume Party | Winter 1925 | Masquerade |
| 7 | Spring Cleaning | Spring 1926 | Household |
| 8 | A Princess Is Born | Spring 1926 | Royal visit |
| 9 | A Grand Ball | Spring 1926 | Formal dance |
| 10 | The Last Straw | May 1926 | Final case |

### 2 Hidden/Encrypted Cases

| # | Case Name | Position | Notes |
|---|-----------|----------|-------|
| 11 | Christmas at the Mansion | Between cases 5-6 | Hidden on DVD, requires decryption |
| 12 | A Dark and Stormy Night | Between cases 7-8 | Hidden on DVD, requires decryption |

### General/Random Case

- Provides unlimited replayability
- Randomized solution each play

### Case-Specific Elements

Each mystery includes:
- Unique opening narration from Inspector Brown
- Specific locked rooms at start
- Unique set of Inspector's notes (same note # = different clue per case)
- Different pacing of information revelation
- Themed dramatic events and interruptions
- Specific ending sequence

---

## Gameplay Mechanics

### Game Start

1. All players begin in the **Evidence Room** (center)
2. From Evidence Room, players can only exit via **secret passage** initially
3. DVD guides setup for selected mystery

### Turn Structure

1. **Move** (Required): Move to one adjacent room OR take secret passage
2. **Action** (Choose ONE):
   - Make a Suggestion
   - Summon the Butler
   - Look at an Item Card (observation test)
   - Read an Inspector's Note
   - Make an Accusation (Evidence Room only)

### Movement Rules

| Rule | Description |
|------|-------------|
| No Dice | Move freely to any adjacent room |
| Secret Passages | Require DVD confirmation, have random outcomes |
| Locked Doors | Cannot pass until Inspector Brown unlocks |

### Secret Passage Mechanic

- Select "TAKE A SECRET PASSAGE" on DVD menu
- DVD plays animation and determines random outcome
- Outcomes can be: beneficial (bonus info), neutral, or penalty (reveal a card)
- "You never know what you'll find in a secret passage"

### Suggestion Rules

| Rule | Description |
|------|-------------|
| Where | Any room EXCEPT Evidence Room |
| Elements | Name 3 of 4 categories (choose which to omit) |
| Suspect Pawns | Stay in place (NOT moved like in other versions) |
| Response | Clockwise - first player with matching card shows ONE privately |

### Accusation Rules

| Rule | Description |
|------|-------------|
| Where | Must be in Evidence Room |
| Method | Secret input via DVD and red magnifying glass |
| Elements | Must name all four (suspect, item, room, time) |
| Correct | Immediate victory, DVD reveals solution |
| Wrong | Reveal cards to Evidence Room, continue playing |

### Wrong Accusation Penalty

- Reveal 1 card per incorrect element (up to 4 cards)
- Surrendered cards go face-up in Evidence Room (public knowledge)
- Player continues playing (NOT eliminated)

---

## DVD Interactive Elements

### Inspector Brown

| Function | Description |
|----------|-------------|
| Narration | Opening context, case details, story progression |
| Item Placement | Announces discoveries, instructs placing items in rooms |
| Door Unlocking | Announces when locked areas become accessible |
| Resource Pooling | Periodically forces all players to reveal cards |
| Dramatic Events | Creates tension ("the revolver went off!") |
| Player Relocation | May force players to specific locations |

### Inspector's Notes

- Located in back of rulebook (~50 numbered entries)
- Accessed as a turn action
- DVD displays note number through red magnifying glass
- **Same note number = different clue in each mystery case**
- Provides observations about suspects, items, times, locations

#### Example Notes

> "Around midnight, Rusty discovered that one of the antiques was missing from its display case in the north wing."

> "Mr. Green and Mrs. Peacock left during dinner even before dessert was served, hardly said goodbye to anyone. Strange."

> "During tea time all guests were sitting around the Rose Garden sunning themselves."

### Butler (Ashe)

| Function | Description |
|----------|-------------|
| Summoning | Player selects "SUMMON THE BUTLER" on DVD |
| Clue Delivery | Verbal clue audible to ALL players |
| Item Reward | Summoning player receives top item card (private) |
| Limited Uses | Can only be summoned limited times per game |

#### Example Butler Clues

> "I'm embarrassed to tell you this, but I overheard Colonel Mustard, Professor Plum, and Mr. Green arguing over who had the best collection of antiques."

> "By the time I went to bed after midnight, all of the jewelry had been locked up and accounted for."

> "I had complimented Lady Lavender on the jewelry on her jacket when she arrived. She told me that Mr. Boddy had let her borrow it for the weekend."

### Room Observation Tests

| Step | Description |
|------|-------------|
| Trigger | Player in room with face-down item card chooses "Look at Item" |
| Test | DVD shows room panorama, asks observation question |
| Example | "What color is my teacup?" |
| Pass | Player views item card privately, returns it face-down |
| Fail | Cannot view card this turn |

### Scotland Yard Help (Younger Players)

- Page 19 of instructions contains hints for younger players
- Accessible via red magnifying glass decoder

---

## Card System & Red Magnifying Glass

### Fingerprint Symbol System

Each card has **6 hidden symbols** on its back, visible only through the red magnifying glass.

#### Setup Process

1. DVD instructs which symbol position to look for (e.g., "fingerprint in upper right")
2. Player examines card backs through red magnifying glass (without seeing fronts)
3. Cards with matching symbol go into Case File Envelope
4. This is how DVD "knows" the solution without electronic tracking

| Step | Action |
|------|--------|
| 1 | Separate 11 item cards → form deck in Butler's Pantry |
| 2 | Find item card with correct symbol → Case File Envelope |
| 3 | Find suspect card with correct symbol → Case File Envelope |
| 4 | Find room card with correct symbol → Case File Envelope |
| 5 | Find time card with correct symbol → Case File Envelope |
| 6 | Shuffle remaining suspect/room/time cards together |
| 7 | Deal evenly to players, extras go face-up in Evidence Room |

### Red Magnifying Glass Uses

1. **Card Selection**: Reveals fingerprint symbols during setup
2. **Screen Decoding**: Reveals hidden letters/numbers on TV
3. **Secret Accusations**: Decodes input interface for private guessing
4. **Inspector's Notes**: Reveals which numbered note to read

### Card Distribution Summary

| Location | Cards | Visibility |
|----------|-------|------------|
| Case File Envelope | 4 (solution) | Hidden from all |
| Player Hands | Dealt suspect/room/time cards | Private |
| Evidence Room | Leftover cards + penalty cards | Public |
| Butler's Pantry | Item deck (minus 1 in envelope) | Hidden deck |
| Rooms | Face-down items placed by Inspector | Hidden until examined |

---

## Game Components

### Complete Component List

| Component | Quantity | Description |
|-----------|----------|-------------|
| DVD | 1 | 12 mysteries + random mode + menus |
| Game Board | 1 | Tudor Mansion layout |
| Cards | 42 | 10 suspects, 11 items, 11 rooms, 10 times |
| Suspect Pawns | 10 | Colored playing pieces |
| Red Magnifying Glass | 1 | Decoder for hidden symbols |
| Case File Envelope | 1 | Holds 4 solution cards |
| Plastic Padlocks | 4 | For locking rooms/passages |
| Clue Pad | 1 pad | Tracking sheets |
| Instructions | 19 pages | Rules + Inspector's notes |

### Card Counts (Confirmed)

| Category | Count |
|----------|-------|
| Suspect Cards | 10 |
| Item Cards | 11 |
| Room Cards | 11 |
| Time Cards | 10 |
| **Total** | **42** |

---

## Data Structures for AI Generation

### Suspect Object

```json
{
  "id": "S10",
  "name": "Rusty Nayler",
  "displayName": "Rusty",
  "color": "rust",
  "role": "Gardener",
  "description": "Working-class staff, maintains mansion grounds",
  "traits": ["outdoor access", "knowledge of grounds", "early riser"]
}
```

### Item Object

```json
{
  "id": "I01",
  "nameUS": "Spyglass",
  "nameUK": "Telescope",
  "category": "antique",
  "description": "Optical instrument for observation",
  "likelyLocations": ["Study", "Library", "Conservatory"]
}
```

### Location Object

```json
{
  "id": "L02",
  "name": "Lounge",
  "type": "indoor",
  "position": "corner-NE",
  "secretPassageTo": "Conservatory",
  "canBeLocked": true,
  "adjacentRooms": ["Hall", "Dining Room"]
}
```

### Time Object

```json
{
  "id": "T07",
  "name": "Dusk",
  "order": 7,
  "hourRange": "5:00 PM - 7:00 PM",
  "lightCondition": "transitional",
  "typicalActivities": ["evening transition", "pre-dinner activities"]
}
```

### Clue Object

```json
{
  "id": "C001",
  "type": "butler",
  "speaker": "Ashe",
  "text": "By the time I went to bed after midnight, all of the jewelry had been locked up and accounted for.",
  "logic": {
    "eliminates": {
      "items": ["Pocket Watch", "Jade Hairpin", "Scarab Brooch"],
      "times": ["Midnight"]
    },
    "reasoning": "If jewelry was secured by midnight, theft of jewelry items could not occur at midnight"
  }
}
```

### Mystery Scenario Object

```json
{
  "id": "M01",
  "name": "The Monte Carlo Affair",
  "order": 1,
  "period": "September 1925",
  "theme": "gambling/casino",
  "lockedAtStart": ["Rose Garden", "Fountain"],
  "solution": {
    "suspect": null,
    "item": null,
    "location": null,
    "time": null
  }
}
```

---

## Appendix: Complete Reference Lists

### All Suspects (Alphabetical)

1. Colonel Mustard
2. Lady Lavender
3. Miss Scarlet
4. Mr. Green / Reverend Green
5. Mrs. Meadow-Brook
6. Mrs. Peacock
7. Mrs. White
8. Prince Azure
9. Professor Plum
10. Rusty (Nayler)

### All Items (Alphabetical, US Names)

1. Billfold
2. Crystal Paperweight
3. Gold Pen
4. Jade Hairpin
5. Letter Opener
6. Medal
7. Pocket Watch
8. Rare Book
9. Revolver
10. Scarab Brooch
11. Spyglass

### All Locations (Alphabetical)

1. Ballroom
2. Billiard Room
3. Conservatory
4. Dining Room
5. Fountain
6. Hall
7. Kitchen
8. Library
9. Lounge
10. Rose Garden
11. Study
- Evidence Room (special - not a theft location)
- Butler's Pantry (special - card storage only)

### All Times (Chronological)

1. Dawn
2. Breakfast
3. Late Morning
4. Lunch
5. Early Afternoon
6. Tea Time
7. Dusk
8. Dinner
9. Night
10. Midnight

### All Mystery Cases

1. The Monte Carlo Affair
2. The Garden Party
3. A Bad Sport
4. The Hunt
5. The Autumn Leaves
6. The Costume Party
7. Spring Cleaning
8. A Princess Is Born
9. A Grand Ball
10. The Last Straw
11. Christmas at the Mansion (hidden)
12. A Dark and Stormy Night (hidden)
13. General/Random Case (unlimited replay)

---

## Sources

- [Cluepedia Wiki - Clue DVD Game](https://cluepedia.fandom.com/wiki/Clue_DVD_Game)
- [Cluepedia Wiki - Rules](https://cluepedia.fandom.com/wiki/Clue_DVD_Game/Rules)
- [Wikipedia - Cluedo DVD Game](https://en.wikipedia.org/wiki/Cluedo_DVD_Game)
- [BoardGameGeek](https://boardgamegeek.com/boardgame/23263/clue-dvd-game)
- [Hasbro Official Instructions](https://instructions.hasbro.com/en-us/instruction/clue-dvd-game)
- [Hasbro PDF Rules](https://www.hasbro.com/common/instruct/Clue_DVD.pdf)
- [Internet Archive - DVD Video Files](https://archive.org/details/cluedvdvideos)
- [The Art of Murder Forums](https://theartofmurder.com/forums/viewtopic.php?t=19882)
- [RPGnet Review](https://www.rpg.net/reviews/archive/12/12107.phtml)

---

*Document compiled for AI scenario generation*
*Last updated: January 2026*
