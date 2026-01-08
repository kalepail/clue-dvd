- Write a suite of comprehensive end-to-end tests for every endpoint and scenario. Work carefully and ensure everything passes as expected

- do some research on the game for the concept of summoning the butler. I don't see this in the frontend. Actually we should read all our .md files and see how our frontend is doing with exposing all neccesary game play mechanics both from the backend and all the .md files for how the game is played. Keep in mind the frontend is meant to take the place of the DVD flow so we need to mimic how that flow worked with all the actions and behaviors required to get through a game

---

- Line 76 CARD_SYMBOLS.md "2. Tell players: "Look for the [symbol] in the [position] position"" Correct operation for premade mysteries. Adjust for generated mysteries to list all 6 symbols to avoid incorrect card selection
- Not required to the gameplay basics, but would want to add/make sure implementation the secret passage situations and inspector interruptions to the game flow
- Summon the butler: Only 7 times (dependant on item cards). Perhaps could be allowed to have more or less - dependant on difficulty as is programmed in game-constants.ts, line 207
- Inspector Notes templates are too specific to pre-made mysteries. Too little variation from original. Want general "make-up"/example but not as is coded rn in game-elements.ts

IDEAS:
-  Make the butler's pantry a potential place of the crime
-  Have the inspector be a suspect