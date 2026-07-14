# Repository rules for agents

## Interactive poker tables

Whenever a learner is asked to choose a poker action — fold, check, call, raise, or all-in — the table shown for that decision must be functional.

- Use the shared simulator snapshot (`FFTrainerSimulatorSnapshot`) or the full simulator instead of drawing a static table.
- Put the action controls into the functional table and make a click update the rendered answer state and feedback.
- Do not pair a decorative/static table illustration with separate poker-action buttons.
- A static table is allowed only when it is purely explanatory, offers no poker decision, and is marked as decorative where appropriate.
- Keep a focused contract test for every lesson that introduces an interactive table.
