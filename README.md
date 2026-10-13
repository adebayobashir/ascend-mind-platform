# Ascend Mind Institute — Online Learning Platform (Phase 2)

Includes original public website plus `portal.html`, Supabase authentication and database schema, tutor/parent/student/admin views, lessons with meeting links, attendance, assignment submission, progress reports, invoices and Paystack payment initialization + verified webhook.

## Setup (required before live use)
1. Create a Supabase project. In SQL Editor, run `schema.sql`. **Review RLS policies with a security professional before serving real learners.**
2. In Supabase Auth settings, configure your public site URL and permitted redirect URL (`https://YOUR-DOMAIN/portal.html`). Enable email confirmation and appropriate password policies.
3. Set `SUPABASE_URL` and **public/publishable anon key only** in `config.js`. Never put the service-role key or Paystack secret key here.
4. Deploy repository to Vercel (Other framework). Set Vercel server-side environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`. Redeploy after adding them.
5. In Paystack Dashboard, configure webhook URL `https://YOUR-DOMAIN/api/payments/webhook` and obtain live keys only after business verification. Start with Paystack test keys.
6. Register an initial parent user, then in Supabase SQL Editor assign that user `admin` role by ID. Create student/tutor accounts via the Supabase Auth admin console (or a secure provisioning service), then assign their roles in the profiles table. Link students to guardians via `student_guardians` and assign tutor/student relationships by creating a lesson as admin.
7. Use portal management forms for lessons, assignments, attendance, reports, and invoices. The tutor must have an existing assigned lesson with a learner before they can create additional records for that learner.
8. Test every role with separate accounts, including permission-denied scenarios, Paystack test payment, webhook delivery and mobile layout.

## Important limitations / production checklist
- This is an **integration-ready implementation**, not a hosted or fully configured live service. External credentials, database provisioning, operational testing and deployment are required.
- Live class integration is **join-by-link** (Google Meet/Zoom); it does not create meetings via provider APIs or host video itself.
- Assignment submission supports text and links, not direct file upload.
- Tutor management forms currently require student/lesson UUIDs. A production administrator should add a controlled student directory, secure account invitations, scheduling conflict checks, audit logs, rate limiting and role-specific workflows.
- The payment webhook validates Paystack HMAC signatures and invoice amounts; confirm webhook reliability and reconcile payments in Paystack before live billing.
- No public self-selection of tutor/admin/student role. Parent signup always creates a parent profile.
- Because learners may be children, obtain guardian consent, publish a privacy notice, define retention/deletion policies, restrict meetings to authorised participants and review applicable child data protections.
- Parent registration does not automatically create a student account; the admin must provision and link it.
- The email shown on the public site should be confirmed by the owner.

## Local preview
The public site can open as a static page. Portal requires a configured Supabase project and should be served over HTTP locally (for example `python -m http.server 8000`) rather than opened with file://. Serverless payment endpoints run only after Vercel deployment or Vercel local development.


## Corrected schema compatibility update
This updated portal uses `tutor_students` for assignments and provides administrator dropdowns for tutor/student/parent linking. Use the **corrected schema already installed** in Supabase, not the original bundled `schema.sql`. The old schema.sql has been removed from this updated distribution to prevent accidental execution.

Create student/tutor accounts through Supabase Authentication, then assign `profiles.role` using trusted SQL Editor access. Admin can then assign tutors and link parents in the portal. This is a testing build: validate RLS, payment endpoints, and privacy requirements before using real student data.
