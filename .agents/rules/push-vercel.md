---
trigger: always_on
description: "When the user says 'push', deploy/push the project to Vercel."
---

# Push = Deploy to Vercel

- Whenever the user says **"push"** (without specifying another target), deploy the project to Vercel (`vercel --prod --yes` or `vercel deploy --prod --yes`) from the repository root.
- Do not ask for confirmation before deploying when the user says "push".
- After deploying, report the deployment URL and status.
