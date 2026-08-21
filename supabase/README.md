# RiskRadar Supabase Setup

RiskRadar uses Supabase for passwordless accounts and member-owned data. The
backend remains the only component allowed to update subscription and billing
state.

## First-Time Dashboard Setup

1. In **Settings > API Keys**, rotate any secret key that has been shared or
   exposed. Create one `sb_publishable_...` key for the Expo client and one
   `sb_secret_...` key for the RiskRadar backend.
2. Open **SQL Editor > New query**. Run these files in order:
   - `supabase/migrations/202607270001_membership.sql`
   - `supabase/migrations/202607270002_watchlists.sql`
   - `supabase/migrations/202607270003_alerts.sql`
3. Open **Authentication > Providers > Email** and keep email authentication
   enabled. RiskRadar uses email magic links rather than passwords.
4. Open **Authentication > URL Configuration** and add:
   - Local site URL: `http://localhost:8083`
   - Local redirect: `http://localhost:8083/?auth=callback`
   - Production redirect: `https://YOUR-WEBSITE/?auth=callback`
   - Future native redirect: `riskradar://auth/callback`
5. Copy `.env.example` to `.env` locally and replace every Premium placeholder.
   `.env` is ignored by Git. Never paste an `sb_secret_...` key into an
   `EXPO_PUBLIC_...` variable.

## Verify the Local Configuration

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run membership:check
```

The command prints missing variable names and remediation only. It never prints
secret values. A successful check confirms configuration shape; the full
Stripe test-mode checkout and webhook test is still required before launch.

## Security Model

- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is bundled into the web/mobile client
  and is safe only because database access is protected by Row Level Security.
- `SUPABASE_SECRET_KEY` is backend-only, bypasses Row Level Security, and must
  be stored as a deployment secret.
- `profiles`, `watched_places`, `alert_preferences`, and `alert_runs` use owner
  relationships and RLS.
- Subscription writes and Stripe event records have no user-write policy and
  are handled only by the RiskRadar backend.
- Legacy anon/service-role aliases remain supported during migration, but new
  deployments should use publishable/secret keys.
