# FieldLink

**The digital workplace for humanitarian field work.**

One account, one database, one workspace, all devices. An officer visits a family on a
phone, fills the assessment, takes the required photographs and records a call; a
supervisor opens the same workspace on a laptop and sees all of it immediately.

## Run it

```bash
npm install          # installs the server and the web client
npm run seed:reset   # a demonstration organisation to explore
npm start            # workspace on http://localhost:5173
```

Then sign in with any of the demonstration accounts (password `fieldlink`):

| Email | Person | Role |
| --- | --- | --- |
| `officer@fieldlink.org` | Mohammed Abdulai | Field Officer |
| `supervisor@fieldlink.org` | Rashid Bello | Supervisor |
| `admin@fieldlink.org` | Amina Yusuf | Administrator |
| `volunteer@fieldlink.org` | Sadia Musah | Volunteer |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the workspace (API + built interface) on port 5173 |
| `npm run dev:web` | Vite dev server on 5174 with hot reload, proxying `/api` to 5173 |
| `npm run build` | Builds the interface into `web/dist` |
| `npm run typecheck` | Type-checks the web client |
| `npm run check` | Syntax-checks every server file |
| `npm run seed` | Adds the demonstration organisation (add `--reset` to start clean) |
| `npm run smoke` | End-to-end test of the whole workspace (run it with the server up) |

## The mini-apps

- **Home** — today's work: visits, tasks due, calls to make, what needs attention.
- **Families** — the register, each family record with members, media, assessments,
  calls, notes, documents and tasks.
- **Forms** — the family assessment in fourteen sections, saved automatically, submitted
  for supervisor review, returned with corrections when needed, with comments and a full
  revision history.
- **Field Camera** — the required photography checklist for a visit (house, people,
  child documents, adult documents). Each item can be photographed, uploaded or marked
  *not available* with a reason, and the counter shows progress such as
  “12 of 18 required items completed”.
- **Tasks** — everything promised, with due dates, priorities, sources and reminders.
- **Planner** — today, this week, upcoming and a month calendar; field visits, meetings,
  trainings, distributions, NGO programmes, deadlines, religious events and celebrations,
  each with its own muted theme and event workspace (participants, tasks, documents,
  messages, photos).
- **Messages** — direct and group conversations with attachments, unread indicators and
  search. Families and events carry their own conversation.
- **Media** — every file in the workspace with its metadata: family, section, category,
  subcategory, who captured it and when; grid, list and gallery views.
- **Documents** — certificates, letters, reports and distribution lists, attached to a
  family or an event.
- **Notifications**, **Team**, **Reports** and **Administration** — who did what, how the
  programme is doing, and the people and imports behind it.

## Click-to-call

Every saved number is callable. FieldLink asks “Call this number?”, hands the call to the
device's own dialer, and on return records the outcome (answered, no answer, number
unavailable, wrong number, call again later) with a note. An unanswered call can create a
follow-up task straight away, which appears in Tasks, Notifications and the Planner.

## How the workspace is built

```
server/        Express API. One SQLite database (data/fieldlink.db) holds everything.
  routes/      auth, families, forms, media, tasks, planner, messages, workspace, sync
shared/        form template, media checklist, event types and role capabilities
web/           React + Vite + Tailwind interface (desktop sidebar, mobile bottom bar)
  src/screens  one file per mini-app
scripts/       smoke test
data/          database and uploaded files (created on first run, not in git)
```

**Sync** — the interface keeps the last copy of every screen, a queue of actions taken
while offline and photographs waiting to upload. When the connection returns they are sent
to the same workspace as everyone else's, and the live change stream (server-sent events)
refreshes the other devices. There is no separate mobile or desktop database.

**Roles** — administrators manage accounts, imports and the activity log; supervisors
review assessments and plan events; field officers and volunteers see the families assigned
to them and cannot open family media outside their work.

**Calls** are never placed by FieldLink itself: the device's telephone dialer does that.

## Backups

Everything lives in `data/`. Copy the folder to back up the organisation's workspace; copy
it back to restore one.
