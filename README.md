# RJC Arcade

A retro arcade cabinet in the browser, hosted on GitHub Pages. Plain HTML/CSS/JS, no build step.

- **Meteor Dash**: dodge falling rocks, grab gems
- **Byte Stacker**: time your drops, overhang gets chopped
- **Reflex Grid**: hit green tiles, never red

Insert a coin (`C`), press start (`Enter`), and chase the high score. Scores are saved in your browser.

## FareFinder (`/fares/`)

A ride share price comparison prototype. Enter pickup and dropoff, and it ranks Uber, Lyft and taxi options by estimated price (or by "best value", which also counts your time).

How it works:
- **Addresses → coordinates:** OpenStreetMap Nominatim (or type `lat,lon`, or use your location).
- **Distance and time:** OSRM public routing server, padded 20% for traffic. If that's unavailable it falls back to a straight-line estimate.
- **Price:** each service's rate card (base + per mile + per minute + booking fee, with a minimum fare), times an expected demand multiplier for the time of day (rush hour, late-night weekends). Rate cards are editable in the page and saved in your browser.
- **Real quotes:** type the price an app actually shows into any card and the ranking uses it.
- **Booking:** "Open in Uber/Lyft" deep links prefill the trip in that app.

Limits: Uber and Lyft don't offer public price APIs, so these are estimates, not live quotes. Default rates are typical US big-city values; edit them for your city.
