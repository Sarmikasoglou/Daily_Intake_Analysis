# Intake Plotter

This is now a Vercel-ready Next.js app for the CSV format in `1654_3.30.26_4.21.26.csv`.

## What it does

- Upload one or more intake CSV files directly in the browser.
- Merge data from multiple cows into one analysis session.
- Upload a second CSV that maps `Transponder` values to your own cow IDs.
- Show each tracked cow with its eartag and linked transponder/EID.
- Separate `Unlimited` and `Stolen` into two chart lines.
- Convert intake values from lbs to kg by default.
- Optionally switch the analysis to Dry Matter Intake by entering DM percent for each roughage type.
- Show three views:
  - specific day
  - summarized day range
  - weekly average of daily summaries
- Switch between:
  - all uploaded cows combined
  - average per cow for a selected roughage type
- Download two daily reports with one cow per row per day:
  - Intake from Midnight
  - Intake from AM Feeding

## Local development

1. Run `npm install`
2. Run `npm run dev`
3. Open `http://localhost:3000`

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Deploy with the default Next.js settings.

## Notes

- The sample CSV column is named `Intake (kg)`, but the app includes a unit selector because you said the uploaded values are actually in lbs.
- Negative intake values can be ignored with the checkbox. It is enabled by default because the sample file includes small negative readings.
- The lookup file should contain a transponder column and a cow ID column. Common names like `Transponder`, `Transponder ID`, `EID`, `Cow ID`, `CowID`, `cow_id`, and `EART` are supported.
- In your files, the intake `Transponder` is matched to the lookup-file `EID`, and the displayed cow identifier is the lookup-file `EART` eartag number.
- `Intake from Midnight` uses visits with start times from 12:00 AM through 11:59 PM on the same calendar day.
- `Intake from AM Feeding` uses visits with start times from 6:00 AM through the next day at 5:59 AM.
- In Dry Matter Intake mode, the app multiplies each intake value by the DM percent for that row's roughage type. Example: `45` means 45% DM.
