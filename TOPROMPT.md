- Seems like there are a lot of type errors, add type checking and check and fix all type errors. Be careful and ensure modern programming best practices

- Remove wrong accusation counter
- Remove specific accusation made
- Adjust investigation board section for host computer
- Continue to work on overall style and flow
- Implement mobile compatibility
- Adjust header for WHO/WHAT/WHERE/WHEN (accusation screen) so the question is not repeated underneath

- We may want to build out a bunch of supporting factual reference docs which the AI can use as context to ensure it doesn't hallucenate or make up stuff that doesn't exist. We need to ensure
  accuracty to the actual game elements as folks will be playing this on the actual gameboard.

  - Line 76  CARD_SYMBOLS.md "2. Tell players: "Look for the [symbol] in the [position] position"" Correct operation for premade mysteries. Adjust for generated mysteries to list all 6 symbols to avoid incorrect card selection

  - Not required to the gameplay basics, but would want to add/make sure implementation the secret passage situations and inspector interruptions to the game flow
  - Summon the butler: Only 7 times (dependant on item cards). Perhaps could be allowed to have more or less - dependant on difficulty as is programmed in game-constants.ts, line 207

  - Inspector Notes templates are too specific to pre-made mysteries. Too little variation from original. Want general "make-up"/example but not as is coded rn in game-elements.ts

  - Remove the summarized detail given in the butler clue from "latest Clue" card in the UI i.e. "Eliminates time: T06
  - Remove/adjust investigation board to be more useful in group settings // OR build in mobile utility where that is individualized
 - Continue to work towards adding variety and true cohesion in generated story and remove the specificity of the clues being given
- Need to add inspector interruption for mini game item card reveal
- Add menu music (SPECIFIC TO DVD)
- Clues clearly single out the answers by their wording without meaning to. needs to be much more subtle
- Inspectors Notes only gives 1 type of clue. Needs clue overhaul


  IDEAS:
 -  Make the butler's pantry a potential place of the crime
 -  Have the inspector be a suspect
