# Retiring the old setup

The rule from the plan: each old part stops after two weeks without use; the last one closes the old setup. This
page maps every old part to its new home and names the cutovers that wait for me. Nothing here stops on its own —
I stop each part when its new home has carried it for two quiet weeks.

## The map

| The old part                       | Its new home                                                                                                              | The cutover                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Job Hunt (the hunts tool's jobs)   | Searches: the hunt page, cards, the whole listing, deep checks; my stars and notes                                        | Final import, enable the browser specs in the data folder, stop the old timer          |
| Deal Hunt (the chair searches)     | Searches: the chair hunt runs here at 10:00 and 20:00, On, and pings a great deal through ntfy                            | Done 2026-11-23: the old chair hunt is Paused; it stops for good after two quiet weeks |
| The apply flow                     | Applications: the queue, the numbers, every attempt (193 carried); the old runner takes the queue                         | kestrel starts the agent itself, with the old runner's report and ping                 |
| Learn (the old lessons app)        | Learn: the same method, packs by topic, my progress carried (21 in review)                                                | Done — the old page stays readable until unused                                        |
| Guides (tech terms)                | Learn: each topic a page with its blocks and diagrams, Listen in the computer's voice                                     | Done — the old page stays until unused                                                 |
| The interview packs and the helper | Interview prep: answer-packs (186), the work lessons, the helper (local Parakeet)                                         | Use the helper here; the old one stays until unused                                    |
| Demo notes                         | Learn or Interview prep: a demo script is a lesson                                                                        | Write new ones as lessons; the old page stays until unused                             |
| The apply flow's letters           | Writing: letters, form answers and any text, written and checked the way an application does it                           | The applications keep writing their own until the apply cutover                        |
| The Hub's Tasks                    | Tasks: the screen and the agent commands (45 carried)                                                                     | Agents post to kestrel once their instructions point here                              |
| Live                               | Live: the header's dot, what runs now step by step (an application's chat too, read from the old Live), the last 24 hours | kestrel reads dsh's chats itself at the apply cutover                                  |
| Cost                               | Cost: oMLX's count, the cloud at my prices, the electricity, the 30 days                                                  | Done — prices.json now lives in kestrel's data folder                                  |
| The Hub's link to my chats (dsh)   | Chat: dsh's chats page inside kestrel, in kestrel's look                                                                  | Done; opened on its own, the page keeps the old app menu                               |
| The morning look-around            | The brief on Home                                                                                                         | Done                                                                                   |

## What the mirror carries meanwhile

The mirror (`mirror-v1.json`) brings the old setup's finds about five minutes after each of its rounds, and everything
at least once a day; it keeps kestrel's listings — jobs and deals — matched to the old database, which
stays the authority for statuses until each cutover. The mirror's last word shows on the Searches page. Search now on
a job hunt the old setup runs starts the old setup's own (`settings.oldLive` names its server); the mirror after it
brings the finds.

## What waits for me

- The search cutover: the final import, the browser specs enabled, the old timer off.
- The apply cutover: kestrel starting the agent itself. Until then the old runner takes kestrel's queue and reports
  each end back (2026-11-23).
- The deal cutover is done (2026-11-23): the old chair hunt waits, Paused, for its two quiet weeks.
- The ear: oMLX's parakeet files fail to load ("not supported for stt") — reload the model, then check Live by hand.
- Naming Notes' real folders (uploads already work).
