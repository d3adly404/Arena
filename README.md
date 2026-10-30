# 🛏️ BedTrack — Hospital Bed & Emergency Tracker

A **simple, mobile-first web app** for tracking hospital beds, patients and incoming emergencies — fully **simulated** across all major emergency scenarios (mass casualty, building fire, disease outbreak, cardiac wave, natural disaster, and more).

> 🔬 Everything is simulated: patients, ambulances and emergencies are generated for training / demo purposes. No real data, no backend, no accounts.

## ✨ Features

- **📊 Dashboard** — live bed occupancy, ward-by-ward capacity, critical-patient counts and an activity feed
- **🛏️ Bed board** — every bed colour-coded (available / occupied / reserved / cleaning / maintenance) with filters by ward and status
- **🚨 Emergency queue** — ambulances en-route with ETA countdowns, triage levels (RED / YELLOW / GREEN / BLACK), one-tap bed assignment with auto-assign
- **🧪 Emergency simulator** — 12 scenarios:
  - 🚗 Multi-vehicle accident · 🚨 Mass casualty incident (MCI) · 🔥 Building fire
  - 🦠 Disease outbreak · ❤️ Cardiac emergency wave · 🌊 Storm & flooding
  - 🔪 Trauma surge · 🧸 Pediatric surge · 🤰 Maternity emergency · 🧠 Mental health crisis
  - ⚡ Full-scale surge (stress test) · 🚑 Rolling ambulances (continuous stream)
- **Simulation realism** — cleaning timers after discharge, beds auto-return to service, overflow alerts when the hospital fills up
- **Mobile-first** — big tap targets, bottom navigation, bottom sheets, safe-area aware, install-free (just a browser)

## 🚀 Run it

No build step, no dependencies. Either open `index.html` directly in a browser, or serve it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## 📱 How to use

1. **Dashboard** shows the state of the hospital at a glance.
2. Tap **🧪 Simulate** and pick an emergency scenario — ambulances start arriving within seconds.
3. Watch the **Emergencies** queue and let **auto-assign** place patients in beds (or assign manually).
4. Tap any bed on the **Beds** board to admit, discharge, reserve or send it to maintenance.
5. Discharged beds go through a short simulated **cleaning cycle** before becoming available again.

State is saved in your browser's `localStorage`, so you can close the tab and come back. Use **↺ Reset hospital** on the Simulate tab to start over.

## 🗂️ Structure

```
index.html        # App shell
css/styles.css    # Mobile-first UI
js/scenarios.js   # Emergency scenario definitions + patient generators
js/app.js         # State, simulation engine and rendering
```
