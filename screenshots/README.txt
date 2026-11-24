Screenshots for the Phase II submission
---------------------------------------
01-login-dialog.png                  Login dialog
02-register-dialog.png               Register dialog (name, email, password, confirmation)
03-my-catalogue-statuses.png         My Catalogue: pending / approved / rejected / edit pending / edit rejected
04-rejected-with-reason.png          Rejected filter: the owner sees the rejection reason
05-public-library-approved-only.png  Public library shows approved books only
06-catalogue-search-and-pending-edit.png  Search within My Catalogue; a pending edit of a public book
07-notifications.png                 Approval / rejection notifications
08-admin-review-new-and-edit.png     Admin Review: new submissions and a proposed-changes diff
09-audit-log.png                     Audit log
10-demo-output.txt                   Output of `npm run demo` (all 8 required test cases)

How they were made: the real React app and the real service code (same rules as the Express routes)
were run in a headless browser. Express and MongoDB were not installable in the sandbox, so a small
stand-in HTTP adapter with an in-memory store served the API. Please retake them on your machine
(Express + MongoDB) before submitting; the screens will look the same.
