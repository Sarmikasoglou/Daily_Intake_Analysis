# Intake Plotter

This is now a Vercel-ready Next.js app for the CSV format in `1654_3.30.26_4.21.26.csv`.

## What it does

- Upload one or more intake CSV files directly in the browser.
- Merge data from multiple cows into one analysis session.
- Upload a second CSV that maps `Transponder` values to your own cow IDs.
- Separate `Unlimited` and `Stolen` into two chart lines.
- Convert intake values from lbs to kg by default.
- Show three views:
  - specific day
  - summarized day range
  - weekly average of daily summaries
- Switch between:
  - all uploaded cows combined
  - average per cow for a selected roughage type

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
- The lookup file should contain a transponder column and a cow ID column. Common names like `Transponder`, `Transponder ID`, `Cow ID`, `CowID`, or `cow_id` are supported.
