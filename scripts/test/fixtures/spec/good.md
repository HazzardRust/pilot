# good: every spec line carries a bar

## 1. Problem

Nothing here is checked; it says it works.

## 2. Spec

The ticket's lines 1 to 3 against this artefact's lines.

| # | Ticket | Behaviour a user can watch | Evidence |
| --- | --- | --- | --- |
| 1 | 1 | A ticket with no reply for 20 minutes is paused. | a settle test |
| 2 | 2 | The lane takes the next of two queued tickets. | a lane test |
| 3 | – (*added*) | A retry runs at most once. | a retry test |

- *added*: the guard pins exactly 3 paths. practitioner: a site reliability engineer

## 3. Findings

- It works.

## 6. Assumed decisions

- A1 red team: none found, attacked the retry path.

## 8. Slices

red team: S1 and S2 each read the retry count; S1 owns it.
