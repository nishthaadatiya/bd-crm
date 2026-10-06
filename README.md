This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Case exports

Use **Download All Cases (Excel)** on Cases to export all cases accessible to your
signed-in account, across every page and regardless of the current filters. The
workbook includes all stored case columns plus related customer, property, stage
and employee details. IDs and stored dates are retained, financial amounts remain
numeric, and text is never interpreted as an Excel formula.

Use **Download PDF** inside a case to choose a client update or an internal report.
Client updates exclude internal notes, delay explanations and activity history.
Internal reports include task details, case notes and the latest 20 activity
entries. Reports are generated from fresh data, include document checklist status,
and use INR and India time. Neither export includes uploaded file contents.
Exports run in the browser using the existing signed-in user's permissions; no
database migration or external document service is required.

### Completion, flags and employee queue

To enable **Delete** in Case Documents & Checklist, run
`supabase-document-delete-v7.sql` in the Supabase SQL Editor. Employees can delete
their own uploads; owners and managers can delete any upload. Each deletion is
recorded in case activity. Only the chosen version is removed, and the checklist
uses the latest remaining version. File removal uses the Storage API. If storage
cleanup fails after the checklist record is deleted, a warning and retry button
appear; the app does not report the stored file as successfully deleted.

After applying the earlier scripts, run `supabase-workflow-v6.sql` in the Supabase
SQL Editor before using this version. The migration adds the workflow RPCs,
waiting/blocked flags, handoff acknowledgements, mapped loan steps and flag-aware
analytics. It is transactional and rerunnable. The application deliberately does
not fall back to unchecked status updates when this migration is missing.

- **Complete & Handoff** saves selected task completions, status, stage, assignee,
  next-step tasks, history and notification in one database transaction. Employees
  can move to the next step; owners/managers may skip or move back with a reason.
- Configure each step's checklist titles in **Settings → Workflow Stages** and
  mandatory documents in **Settings → Document Requirements**. All current-step
  tasks must be complete. Collection requires uploaded documents; verification
  requires approved latest versions of both collection and verification documents.
  Other steps require approval of their mandatory documents. Existing cases that
  lack a configured checklist task must have that task created in the workspace.
  Manager overrides record the reason and unmet requirements in activity history.
- **Waiting / Blocked** requires a reason, action owner and follow-up date without
  changing the case's step. Resolve the flag before advancing, or use a recorded
  manager override.
- **My Work Queue** shows assigned cases/tasks, unaccepted handoffs, work due today
  and overdue work. Follow-ups appear for their action owner. Accepting a handoff
  removes it from New handoffs. The queue refreshes on focus, every minute while
  visible, and after actions. Dates use the employee's browser timezone.

Run `npm test` for in-memory PostgreSQL migration / permission / transaction tests
and work queue unit tests. They do not touch the live Supabase database.

Case status choices follow the loan process from Lead to Closed. Existing New and
Completed cases display as Lead and Closed; other historical statuses stay readable
until an employee explicitly selects a new step. Task statuses are independent.

For an existing Supabase database, run `supabase-case-statuses-v5.sql` in its SQL
Editor after the earlier migrations. This sets the database default to Lead and
installs analytics that count every step before Closed as active. The application
already saves the new statuses to the existing text column and uses updated
table-based analytics until the v5 analytics function is installed. This script
does not rewrite existing case statuses or workflow stages.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
