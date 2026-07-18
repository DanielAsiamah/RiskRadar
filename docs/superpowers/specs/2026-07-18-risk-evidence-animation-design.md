# Risk Evidence and Scanner Design

## Objective

Make RiskRadar's evidence understandable and navigable without overstating what Police.uk publishes, and make the loading sequence feel faster and more premium while preserving the existing visual style.

## Evidence Experience

- Hotspot and risk-signal evidence opens inside RiskRadar instead of navigating directly to raw Police.uk JSON.
- The evidence screen shows the published category, recorded month, approximate mapped road, coordinates, and a neutral outcome timeline.
- A prominent `Back to report` action returns to the same report. On Android, the hardware back action does the same.
- `View raw Police.uk source` remains a secondary verification action.
- The UI never claims an exact address, exact incident day, named person, or a violent-crime subtype that the public feed does not provide.
- Outcome wording removes suspect-identification language and uses neutral statuses such as `Investigation complete`.

## Risk Signals

- Replace generic prose with structured signals based on the top local categories.
- Each signal includes the count, recorded month, up to three approximate roads, and links to representative anonymised records when persistent IDs are available.
- The violent-crime signal explicitly explains that Police.uk groups these records under a broad category when no finer subtype is published.
- Area-volume wording describes the observed postcode radius, not the whole borough or city and not an inferred population count.

## Scanner Motion

- Keep the centre and ring visually stable.
- Orbit the four data-source icons while counter-rotating them so they remain upright.
- Add staggered icon pulses, a subtle ring sweep, and a short final lock pulse inspired by Sherlock Search's motion language.
- Target a 1.8-second minimum reveal. A slower network request continues showing honest staged status rather than falsely reaching 100 percent early.
- Respect reduced-motion preferences where supported.

## Data Flow

1. Postcode analysis returns structured risk signals and representative evidence IDs.
2. Selecting a record opens an in-app evidence screen and requests `/api/crime-evidence/:persistentId`.
3. The backend validates the ID, fetches the official Police.uk outcome endpoint, and returns a stable, sanitised view model.
4. The raw official URL is retained only for secondary verification.

## Error Handling

- Missing record history shows a readable unavailable state and retains `Back to report`.
- Invalid IDs return HTTP 400 JSON.
- Police.uk timeout or upstream failure returns HTTP 502 JSON; raw HTML is never passed to the app parser.
- The evidence screen keeps navigation available during loading and error states.

## Verification

- Node tests cover ID validation, sanitised outcomes, structured risk-signal specificity, and upstream errors.
- TypeScript typecheck covers navigation and evidence types.
- Expo web export verifies universal bundling.
- A live API smoke check verifies analysis, evidence detail, JSON content type, and representative SE10 8EP data.
