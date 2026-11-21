# Retiring the old setup

The rule from the plan: each old part stops after two weeks without use; the last one closes the old setup. This
page maps every old part to its new home and names the cutovers that wait for me. Nothing here stops on its own —
I stop each part when its new home has carried it for two quiet weeks.

## The map

| The old part                             | Its new home                                           | The cutover                                                                   |
| ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Job Hunt (the hunts tool's job searches) | Searches: specs, runs, scoring, Priority               | Final import, enable the browser specs in the data folder, stop the old timer |
| Deal hunts (the chair searches)          | Searches: the same engine, a deal is its link          | Write the deal specs in the data folder when the browser collectors move over |
| The apply flow                           | Applications: queue → claim → report, `kestrel` CLI    | The old flow stops when the agents speak kestrel's commands                   |
| Learn (the old lessons app)              | Learn: packs by topic (imported, 63 lessons)           | Done — the old page stays readable until unused                               |
| Guides (tech terms)                      | Learn: the guide's entries and its glossary (imported) | Done — the prose page stays in the old app until unused                       |
| Interview helper's packs                 | Learn: answer-packs (imported, 186 answers)            | Live replaces the helper when the door's ear model loads                      |
| Demo notes                               | Learn: a demo script is a lesson                       | Write new ones as lessons; the old page stays until unused                    |
| The Hub's Tasks                          | Tasks: the screen and the agent commands (45 carried)  | Agents post to kestrel once their instructions point here                     |
| Cost                                     | Models: what each use cost, from the recorded calls    | Done — local models charge time, nothing else                                 |
| The morning look-around                  | The brief on Home                                      | Done                                                                          |

## What the mirror carries meanwhile

The nightly mirror (`mirror-v1.json`) keeps kestrel's listings — jobs and deals — matched to the old database, which
stays the authority for statuses until each cutover. The mirror's last word shows on the Searches page.

## What waits for me

- The search cutover: the final import, the browser specs enabled, the old timer off.
- The apply cutover: pointing the agents' instructions at `kestrel` commands.
- The ear: oMLX's parakeet files fail to load ("not supported for stt") — reload the model, then check Live by hand.
- Naming Notes' real folders (uploads already work).
