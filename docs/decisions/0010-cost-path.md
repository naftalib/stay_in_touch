# Prototype cost path

## Context
The owner wants predictable spend from zero users through ~100 families.

## Options considered
- **Backend:** Supabase only vs Supabase plus a separate API (Python, Java, or Node).
- **Frontend hosting:** Cloudflare Workers/Pages vs Vercel Hobby (non-commercial only), Netlify Free, Render static.
- **Media:** Cloudflare R2 (10 GB free, no egress) vs Supabase Storage (1 GB free, 5 GB egress).
- **Video later:** Mux vs Cloudflare Stream vs Bunny Stream.
- **Email:** Resend vs Postmark, AWS SES, Brevo, SendGrid.
- **API host later:** Google Cloud Run vs Render Free, Railway, Fly.io.
- **Expected monthly cost:** prototype $0; first paid step $27–34; ~100 families $115–170.

## Decision
Target **$0** for the prototype on free tiers; roughly **$27–34/month** at the first paid step; roughly **$115–170/month** at ~100 families (AI usage extra).

## Consequences
Drives Cloudflare, Supabase free/pro tiers, and R2. Exact line items are owner estimates, not verified invoices.

## Status
Accepted

## Date
2026-11-12
