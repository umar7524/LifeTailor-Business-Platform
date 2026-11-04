# LifeTailor — Cloud-Based Tailoring Operations Platform

**Real-world small-business workflow software** • JavaScript • Firebase • Firestore • Responsive PWA

LifeTailor is a mobile-first application designed for managing a tailoring business: customers, garment measurements, design preferences, orders, delivery schedules, and printable tickets. It demonstrates applied software engineering, managed cloud services, real-time data synchronization, browser persistence, and human-centered workflow design.

> **Portfolio code snapshot.** This public version does **not** contain production Firebase configuration, real customer records, or private business contact information. It is not a public demo of the client's live database. Authorization must be fixed before connecting it to production or real customer data.

## Key capabilities

- **Customer records:** search by name/phone, view prior orders and saved measurements; edit measurement profiles.
- **Order intake:** guided three-step workflow with clothing options (Shalwar Kameez, Waistcoat), Urdu-labeled measurement fields, notes and design choices.
- **Delivery workflow:** today/tomorrow and upcoming-due views, order state transitions and printable order/measurement slips.
- **Image handling:** client-side resize/compression for design references stored with Firestore order records.
- **Cloud data:** real-time Firestore listeners, batched writes and local persistent cache.
- **Installable web app:** service worker, web app manifest and responsive phone/desktop layout.

## Architecture

```text
Browser (HTML/CSS/JavaScript)
    |-- UI and workflow logic: public/js/app.js
    |-- Firebase client init: public/js/firebase.js
    |-- Firebase Auth (anonymous in this snapshot)
    |-- Firestore (customers, orders, meta)
    |-- Local browser cache + service worker
Firebase Hosting -> public/index.html and static assets
```

## Repository layout

```text
public/
  index.html
  css/style.css
  js/app.js
  js/firebase.js
  assets/                   # portfolio icons derived from supplied icon
  manifest.json
  sw.js
firebase.json              # Hosting-only configuration
firebase-config.example.js # Copy to public/js/firebase-config.js for own Firebase project
.firebaserc.example        # Project-ID example; do not use client's project
firestore.rules.example    # Deny-all reference, NOT safe for functional app
firestore.indexes.json
.gitignore
README.md
SECURITY.md
```

## Local setup (your own test Firebase project only)

1. Create a **separate test Firebase project**. Do not use an existing client's production project.
2. Register a Firebase web app and enable Firestore and the sign-in method needed for testing.
3. Copy `firebase-config.example.js` to `public/js/firebase-config.js` and fill in your test project's web config.
4. Start a static local server in the repository root:

   ```bash
   python -m http.server 5173 --directory public
   ```

5. Open `http://localhost:5173`. The UI shell loads, but Firestore access is denied unless you implement appropriate authentication/authorization rules in your test project.

**Do not** deploy the example Firestore rules or run `firebase deploy` against a live shop's project. The original app's anonymous-user rules are insufficient to isolate private data to one shop owner. Use Firebase Auth with an owner UID allow-list or custom claims, plus tested least-privilege rules, before enabling private records.

## Deployment (after security review)

The app was developed for Firebase Hosting. For a **new test project only**, configure your own `.firebaserc`, install Firebase CLI and verify your security rules, then use `firebase deploy --only hosting`. Hosting deployment does not imply Firestore rules have been safely configured.

## Engineering notes / known limitations

- Order numbers are derived from the client's cached/current order list rather than a single atomic increment; simultaneous writers may collide. The `meta/counter` batch write **does not** solve concurrency.
- Anonymous auth plus broad `request.auth != null` rules would expose all customer records to any signed-in anonymous user. This code snapshot intentionally does not ship those permissive rules.
- UI string interpolation uses `innerHTML` for some customer/order fields; use escaped text or safe DOM construction to prevent stored XSS.
- Photos are stored inside Firestore documents after compression, subject to Firestore document-size limits.
- Automated tests, formal performance benchmarks and multi-tenant authorization are not included.
- The original project included additional logo artwork; this portfolio bundle uses the supplied icon as a placeholder for logo paths.

## Why this project matters

This project complements AI-agent work by demonstrating the **application and cloud engineering foundations** needed to deliver useful user-facing products: persistence, state, synchronization, workflow design, secure data modeling and deployment. **No AI or machine-learning model is claimed for this application.**

## Portfolio-safe demonstration

Use synthetic customer names, fake phone numbers and sample orders in screenshots or walkthroughs. Never expose client data, Firebase console details, or production credentials. Do not connect a public demo to the existing client database.
