# CampusOD – Automated Student OD and Leave Approval

Web application for OD and leave requests with parent notification, faculty approval,
hostel-warden sync and automatic attendance update.

**Stack:** Node.js · Express · MongoDB (Mongoose) · JWT · bcrypt · plain HTML/CSS/JavaScript frontend

## 1. Run it

Requirements: Node.js 18+ and a running MongoDB (local install or a free MongoDB Atlas cluster).

```bash
npm install
cp .env.example .env        # then edit MONGODB_URI and JWT_SECRET
npm run seed                # loads demo users, attendance and requests (clears the database!)
npm start                   # http://localhost:3000
```

Open http://localhost:3000. On the login screen, click a role chip to fill the demo account, or type an email (or a student's roll number such as CSE-101), the password and pick the matching Role.

| Role | Email | Password |
|---|---|---|
| Student (hosteller) | govinth@campus.edu | Demo@1234 |
| Student | ananya@campus.edu, karthik@campus.edu | Demo@1234 |
| Parent | parent.govinth@campus.edu (also parent.ananya@, parent.karthik@) | Demo@1234 |
| Faculty | faculty@campus.edu | Demo@1234 |
| Warden | warden@campus.edu | Demo@1234 |
| Admin | admin@campus.edu | Admin@1234 |

Try the whole flow: sign in as Govinth and submit an OD, sign in as the parent and acknowledge it,
as Faculty approve it, as Warden mark the student out and returned, then check Govinth's attendance.

`npm test` runs an end-to-end API check against a real MongoDB. It re-seeds the database in
`MONGODB_URI`, so point it at a throwaway database.

## 2. Folder structure

```
server.js                 starts the server
src/app.js                Express app, security headers, routes, static frontend
src/config/               settings (.env) and Mongo connection
src/models/               User, Student, Parent, ODRequest, Approval, HostelExit,
                          Attendance, Notification, AuditLog, Counter   (= the ER diagram)
src/middleware/           JWT auth + role check, file upload, error handler
src/services/             requestService (submit / decide / acknowledge), attendanceService,
                          notify (in-app + email), mailer
src/routes/               auth, requests, admin, misc (notifications, attendance, hostel)
scripts/seed.js           demo data        scripts/smoke-test.js   end-to-end check
frontend/                 index.html, css/styles.css, js/api.js, js/app.js
docs/                     Review 1 presentation
uploads/                  proof documents (created at runtime)
```

## 3. How the main rules work

* **Submit:** validates input, stores the request (and optional PDF/image proof, 5 MB max), then notifies the parent
  (in-app, plus email if SMTP is set) and all faculty.
* **Decide (Faculty):** the status change is atomic, so a request can only be decided once (second attempt returns 409).
  A remark is required to reject.
* **On approval:** a `HostelExit` record is created for hostel residents (the OD is the exit permission, so no second
  out-pass) and the warden is notified; attendance rows are written for every subject on every covered day
  (Sundays skipped): `OD` counts as present, `Leave` counts as absent.
* **Warden:** `linked → out → returned`, each step checked on the server.
* **Security:** passwords hashed with bcrypt, JWT bearer tokens, role checks on every route, login rate limit,
  helmet headers, proof files only downloadable by people allowed to see the request.

## 4. REST API

All routes except login need `Authorization: Bearer <token>`.

| Method and path | Who | What |
|---|---|---|
| POST `/api/auth/login` | all | email + password, returns token |
| GET `/api/auth/me` | all | current user |
| POST `/api/requests` | Student | create (multipart: type, eventName, reason, location, fromTime, toTime, proof) |
| GET `/api/requests/mine` | Student | own requests |
| GET `/api/requests/ward?studentId=` | Parent | ward requests |
| GET `/api/requests?status=Pending\|decided` | Faculty, Admin | all requests |
| GET `/api/requests/:id` | allowed viewers | one request with timeline |
| POST `/api/requests/:id/decision` | Faculty | `{decision, remarks}` |
| POST `/api/requests/:id/acknowledge` | Parent | acknowledge |
| GET `/api/requests/:id/proof` | allowed viewers | download the document |
| GET `/api/me/profile` | Student | own profile |
| GET `/api/parent/wards` | Parent | linked students |
| GET `/api/attendance/summary?studentId=` | Student, Parent, staff | per-subject attendance |
| GET `/api/hostel/list` | Warden, Admin | approved hostel ODs |
| POST `/api/hostel/:exitId/out` and `/return` | Warden | mark out / returned |
| GET `/api/notifications`, POST `/api/notifications/read-all` | all | in-app notifications |
| GET/POST `/api/admin/users`, PATCH `/api/admin/users/:id` | Admin | list, add, activate/deactivate |
| GET `/api/admin/reports`, GET `/api/admin/audit` | Admin | totals, audit log |

## 5. Email verification and forgot password (OTP by email)

* **Verified email only:** accounts created by the admin start as *email not verified*. The first time that person signs in,
  the app emails a 6-digit code to the address on the account. They enter it, the email is marked verified, and they can sign in.
  Demo accounts from `npm run seed` are pre-verified (their addresses are fake), and accounts that existed before this feature stay usable.
* **Forgot password:** on the login page click *Forgot password?*, enter the email, receive a 6-digit code, then enter the code with a new
  password (8+ characters, a letter and a number). Resetting also marks the email as verified.
* **Code rules:** 6 digits, valid for 10 minutes, stored only as a hash, one use, locked after 5 wrong tries, a new code can be requested
  after 60 seconds, and requests are rate limited. The reply never says whether an address has an account.

**Turn on real email (Gmail example)**

1. In your Google account turn on 2-Step Verification, then create an App Password (Google Account, Security, App passwords).
2. Put these in `.env` and restart the server:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASS=the-16-letter-app-password
MAIL_FROM="CampusOD <youraddress@gmail.com>"
```
Any other provider works the same way (Outlook, Brevo, SendGrid SMTP, your college mail server).

**Without SMTP settings** the server still works: it prints the email, including the code, in the terminal where `npm start` is running.
That is handy for development, but real users only receive codes once SMTP is configured.

New API routes (public, rate limited): `POST /api/auth/verify-email/send`, `/verify-email/confirm`, `/forgot-password`, `/reset-password`.

## 6. Configuration (.env)

`PORT`, `MONGODB_URI`, `JWT_SECRET` (use a long random string), `JWT_EXPIRES_IN`,
`TZ_OFFSET_MIN` (minutes ahead of UTC, 330 for India), optional `SMTP_*` and `MAIL_FROM` for email.

## 7. Ideas to extend

SMS/push notifications, QR-based gate verification, mobile app, analytics dashboard, parent login by OTP.
