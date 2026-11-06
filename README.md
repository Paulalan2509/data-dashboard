# Chai House sales dashboard

An interactive sales dashboard built with plain HTML, CSS and JavaScript. Every chart is drawn by hand in SVG: no chart library, no framework, no build step.

**The data is generated sample data** for an imaginary café (90 days, fixed random seed, see `data/sample-sales.csv`). It is not real sales.

## What it does
- **Filters** for date range (7 / 30 / 60 days / all) and category. Every figure and chart responds to the same slice, so the numbers always agree
- **Key figures** with change against the previous equal period (shown only when that earlier period exists in the data)
- **Five charts:** daily revenue with a 7-day average, top items, average revenue by weekday, a weekday-by-hour heat map, and revenue share by category
- **Plain-language insight** under each chart title, computed from the current view
- **Table view** for every chart, so all values are reachable without hovering
- **Upload your own CSV** (`date`, `item`, `qty`, `unit_price`, optional `category`, `hour`). It is read in your browser and never uploaded. Bad files get a specific error with line numbers
- **Download the current view** as CSV
- **Light and dark themes** (follows your system, with a toggle)

## Chart design
Marks and colours follow a validated palette: categorical colours are assigned by category (not rank) so a filter never repaints a series, bars are thin with rounded data-ends, lines are 2px, grids are hairlines, and text never wears a data colour. Labels inside coloured segments pick white or near-black by contrast. Tooltips appear on hover and on keyboard focus (arrow keys move along the line chart).

## Accessibility
Skip link, visible focus, labelled controls, radio-group semantics for the range filter, `aria-label`s on every mark, a table alternative for every chart, no information carried by colour alone (legend, labels and tables), reduced-motion respected.

## Checked
KPI totals were compared against an independent Python calculation for every date range and category. Tested at 360 / 390 / 768 / 1024 / 1440px with no horizontal overflow, in both themes, with valid and invalid CSV files, and with HTML in item names (shown as text, never run).

## Files
`index.html` · `css/style.css` · `js/app.js` · `js/sample-data.js` (sample CSV as a string, so it works when opened from disk) · `data/sample-sales.csv` · `assets/` · `docs/` (screenshots)

## Run it
Open `index.html`, or run `python3 -m http.server` in this folder.

## Publish on GitHub Pages
Repo named `data-dashboard`, upload everything, Settings → Pages → `main` / root. Expected URL: `https://paulalan2509.github.io/data-dashboard/`.

Author: Paul Alain Nyoum
