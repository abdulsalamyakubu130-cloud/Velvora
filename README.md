# Velvora

Social commerce marketplace web app built with React (JSX) + Vite + Tailwind + Supabase.

## Stack

- React + React Router
- Vite
- Tailwind CSS (white + green theme)
- Supabase JS client
- Supabase PostgreSQL + Auth + Realtime + Storage + RLS

## Pages Implemented

- `/` homepage feed with feed/grid toggle, left nav, and right trend rail
- `/explore` categories, countries, trending, most liked, new listings
- `/profile/:username` profile header, followers/following, bio, location, available/sold toggle
- `/sell` create post with drag/drop area, details, negotiable toggle
- `/messages` two-column chat with product preview, seen receipts, typing/online presence, attachments, and request moderation controls
- `/notifications` likes/comments/follows/messages timeline
- `/following`, `/saved`, `/categories`
- `/safety` trust & safety center
- `/admin/moderation` admin moderation panel shell
- `/guidelines` community guidelines
- `/monetization` sponsored/boosted/premium revenue model
- `/auth` email-code verified auth UI with anti-bot throttling
- `/settings` account/profile/security/language settings

## Authentication

- Real Supabase email/password signup
- Email verification code flow for account confirmation
- Real Supabase email/password login
- Required unique phone and unique email per account
- Session persistence with automatic auth state updates
- Protected routes for seller and account pages
- Header sign out action for active sessions

### Email Code Delivery

- In Supabase Dashboard, enable email confirmation under Auth settings.
- In `Auth > Email Templates > Confirm signup`, include the token placeholder so users can see a code (for example `{{ .Token }}`).
- Keep your site URL / redirect URL aligned with local dev (for example `http://localhost:5173`).

## Local Setup

1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `cp .env.example .env.local`
3. Add your Supabase project values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_PROFILE_PICTURE_BUCKET` (preferred, default: `avatars`)
   - `VITE_SUPABASE_AVATAR_BUCKET` (legacy fallback, default: `avatars`)
   - `VITE_AUTH_REDIRECT_URL` (example: `http://localhost:5173/auth`)
   - `VITE_ADMIN_PANEL_PASSWORD`
   - `VITE_ADMIN_EMAILS` (comma-separated admin emails)
4. Run dev server:
   - `npm run dev`

## Deploy To Vercel

1. Push this project to GitHub.
2. In Vercel, import the repository.
3. If Vercel asks for Root Directory, set it to `velvora` (if your repo has this app in a subfolder).
4. Set environment variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_PROFILE_PICTURE_BUCKET` (optional, default `avatars`)
   - `VITE_SUPABASE_AVATAR_BUCKET` (optional legacy fallback)
   - `VITE_AUTH_REDIRECT_URL` (set to `https://YOUR_DOMAIN/auth`)
   - `VITE_ADMIN_PANEL_PASSWORD`
   - `VITE_ADMIN_EMAILS`
5. Deploy.

Notes:
- `vercel.json` is included with SPA rewrite so routes like `/profile/:username` and `/settings` work after refresh.
- Add your Vercel domain to Supabase Auth allowed redirect URLs.

## Supabase Setup

Run SQL in this order from Supabase SQL Editor:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/realtime.sql`
4. `supabase/email_security.sql` (blocks disposable/fake email domains and bans existing matching users)
5. `supabase/identity_enforcement.sql` (requires signup phone + email and enforces one phone/one email per account)
6. `supabase/storage_avatars.sql` (creates `avatars` bucket and upload/read policies)
7. `supabase/kyc_and_limits.sql` (verification tiers + post limits for unverified sellers)
8. `supabase/anti_fraud.sql` (suspicious signup blocking rules + risk audit table)
9. `supabase/location_defaults.sql` (sets default account location to Nigeria for existing users)

## Database Collections/Tables

- `users`
- `categories`
- `posts`
- `post_images`
- `followers`
- `likes`
- `comments`
- `conversations`
- `messages`
- `notifications`
- `reports`
- `blocked_users`
- `kyc_verifications`
- `signup_risk_audit`

## Security

RLS policies are included for:

- profile ownership and admin verification control
- post/comment/like ownership
- conversation participant-only message access
- report and blocked user controls
- notification read scope per user
- KYC request ownership and admin review flow
- unverified seller listing limit enforcement at insert time

## Notes

- Auth is wired to live Supabase.
- Marketplace feed, notifications, and profile content currently use mock data.
- Supabase client utilities are in `lib/supabase/client.js`.
