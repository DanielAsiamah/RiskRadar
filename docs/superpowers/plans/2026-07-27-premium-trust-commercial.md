# RiskRadar Premium Trust and Commercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a useful FAQ, support and advertiser enquiry experience, ethical sponsor placement rules, legal transparency, and a controlled transition toward private future source.

**Architecture:** FAQ, support, pricing, privacy, and advertising are first-class screens within the existing Expo website. Sponsor inventory is a small backend-delivered public view model with strict separation from risk data. Repository visibility/licensing is a separate confirmed GitHub operation after product verification.

**Tech Stack:** React Native Web, TypeScript, Node.js 22, mailto links, Stripe invoices/payment links for approved businesses, Git/GitHub.

## Global Constraints

- Support and business enquiries use `supr3ltd@gmail.com`.
- Sponsors appear only on free pages and are always labelled.
- Sponsors cannot affect scores, evidence, trends, maps, or wording.
- Premium is ad-free.
- The consumer GBP 8.99 Payment Link is never used for advertisers.
- Do not claim that changing GitHub visibility revokes existing MIT grants.
- Do not change repository visibility without explicit confirmation after the warning is shown.

---

### Task 1: Add FAQ, Privacy, and Advertising Content Contracts

**Files:**
- Create: `content/faq.ts`
- Create: `content/privacy.ts`
- Create: `content/advertising.ts`
- Test: `content/content-contract.typecheck.ts`

**Interfaces:**
- Produces: `FaqItem[]`, `PrivacySection[]`, and `AdvertisingPolicy`.

- [ ] **Step 1: Define FAQ content**

Include answers for score method, postcode versus city reputation, data month,
approximate roads, official evidence, Premium, monthly alerts, cancellation,
billing recovery, advertising, and support.

- [ ] **Step 2: Define privacy content**

State which data is used for public search, one-time location suggestions,
accounts, watched postcodes, Stripe billing identifiers, email alerts,
retention, deletion, and contact. State that RiskRadar does not continuously
track GPS on the website.

- [ ] **Step 3: Define advertising policy**

Include labelled placement, independence from analysis, Premium ad-free
promise, review rights, prohibited misleading safety claims, and enquiry-first
payment flow.

- [ ] **Step 4: Verify and commit**

```powershell
npm run typecheck
git add content
git commit -m "content: define RiskRadar trust policies"
```

### Task 2: Build FAQ, Support, Privacy, and Advertise Screens

**Files:**
- Create: `components/Faq.tsx`
- Create: `components/Privacy.tsx`
- Create: `components/Advertise.tsx`
- Create: `components/SiteFooter.tsx`
- Modify: `App.tsx`
- Modify: `components/Landing.tsx`
- Modify: `components/Pricing.tsx`

**Interfaces:**
- Produces screens: `FAQ`, `PRIVACY`, `ADVERTISE`.

- [ ] **Step 1: Build FAQ**

Use accessible pressable disclosure rows, keyboard focus on web, one expanded
answer at a time, and direct navigation back to the prior screen.

- [ ] **Step 2: Build support and advertising**

The primary business CTA opens:

```text
mailto:supr3ltd@gmail.com?subject=RiskRadar%20advertising%20enquiry
```

The page asks for company, website, area, desired dates, and placement goal. It
explains manual approval and a separate Stripe invoice/payment link.

- [ ] **Step 3: Build privacy**

Render the approved content with account-deletion and support actions. Do not
invent a registered company address or legal entity.

- [ ] **Step 4: Add a restrained footer**

Add FAQ, Privacy, Advertise, and support links to Home, Pricing, Account, and
Dashboard without changing the main RiskRadar hierarchy.

- [ ] **Step 5: Verify and commit**

```powershell
npm run typecheck
npm run build:web
git add App.tsx components
git commit -m "feat: add FAQ privacy and advertising pages"
```

### Task 3: Implement Strict Sponsor Placement Separation

**Files:**
- Create: `backend/sponsors.mjs`
- Create: `backend/sponsors.test.mjs`
- Modify: `backend/server.mjs`
- Create: `api/sponsors.ts`
- Create: `components/SponsorCard.tsx`
- Modify: `components/Landing.tsx`
- Modify: `components/Results.tsx`

**Interfaces:**
- Handles: `GET /api/sponsors?placement=<home|result>&district=<name>`.
- Produces: `SponsorView | null`.

- [ ] **Step 1: Write failing backend tests**

Allow only HTTPS destinations, plain text title/body, approved placement,
optional district match, start/end dates, and `active=true`. Strip all HTML.

- [ ] **Step 2: Implement sponsor view**

Read an optional server-side JSON file configured by `SPONSOR_CONFIG_FILE`.
Return only:

```js
{
  id,
  label: 'Sponsored local business',
  businessName,
  message,
  destinationUrl,
  placement
}
```

Invalid or missing configuration returns `null` without affecting search.

- [ ] **Step 3: Build SponsorCard**

Render only for free accounts. Include the label above the business name.
Opening the link uses the platform URL API. Do not place the card inside score,
evidence, category, or map panels.

- [ ] **Step 4: Verify and commit**

```powershell
node --test backend/sponsors.test.mjs
npm run typecheck
npm run build:web
git add backend api components
git commit -m "feat: add ethical free-tier sponsorship"
```

### Task 4: Add Trust and Commercial Documentation

**Files:**
- Modify: `README.md`
- Modify: `backend/DEPLOYMENT.md`
- Create: `docs/ADVERTISING.md`
- Create: `docs/PREMIUM_SUPPORT.md`

**Interfaces:**
- Produces operational instructions without exposing secrets or private pricing.

- [ ] **Step 1: Document support workflow**

Cover billing lookup by email, never requesting card details, Stripe portal,
failed payment, cancellation date, refund escalation, data correction, and
account deletion.

- [ ] **Step 2: Document advertiser workflow**

Cover review, approval, creative fields, separate Stripe invoice/link, start/end
dates, sponsor config update, and post-campaign removal.

- [ ] **Step 3: Remove obsolete claims**

Remove `free and open-source` product positioning, `PRO`, unredacted logs,
sandbox bypass instructions, and claims of live emergency data.

- [ ] **Step 4: Verify and commit**

```powershell
Select-String -Path README.md,backend\DEPLOYMENT.md,docs\*.md -Pattern 'unredacted|live emergency|sandbox bypass'
git add README.md backend/DEPLOYMENT.md docs
git commit -m "docs: publish premium support and sponsor policy"
```

Expected: no obsolete product claims outside historical design documents.

### Task 5: Prepare the Prospective Proprietary Licence Change

**Files:**
- Create: `docs/LICENSING_TRANSITION.md`
- Prepare but do not apply without confirmation: `LICENSE`
- Prepare but do not apply without confirmation: `package.json`
- Prepare but do not apply without confirmation: `README.md`

**Interfaces:**
- Produces a dated record of what can and cannot change.

- [ ] **Step 1: Record the MIT limitation**

Document:

```text
RiskRadar versions already distributed under MIT remain available to existing
recipients under those granted terms. A later proprietary licence applies only
prospectively to code the owner has the right to relicense.
```

- [ ] **Step 2: Audit third-party obligations**

Keep `THIRD_PARTY_NOTICES.md`, dependency licences, map attribution, Police.uk
source attribution, and OpenStreetMap/Leaflet attribution intact.

- [ ] **Step 3: Verify ownership before relicensing**

Run:

```powershell
git shortlog -sne --all
git log --format='%an <%ae>' | Sort-Object -Unique
```

Record any contributor whose code may require permission. Do not silently
relicense third-party contributions.

- [ ] **Step 4: Commit only the transition record**

```powershell
git add docs/LICENSING_TRANSITION.md
git commit -m "docs: record RiskRadar licensing transition"
```

### Task 6: Confirm and Apply GitHub Privacy Separately

**Files:**
- Modify after explicit confirmation: `LICENSE`
- Modify after explicit confirmation: `package.json`
- Modify after explicit confirmation: `README.md`
- External: `DanielAsiamah/RiskRadar` repository visibility

**Interfaces:**
- Produces a private repository and prospective proprietary notices only after
  confirmation.

- [ ] **Step 1: Present the irreversible-effects warning**

State before acting:

```text
Existing public forks remain public, existing MIT grants remain valid,
stars/watchers can be affected, GitHub Pages may be unpublished, and visibility
changes can alter security-feature availability.
```

- [ ] **Step 2: Obtain explicit confirmation**

Required confirmation text:

```text
Make DanielAsiamah/RiskRadar private and apply the prospective proprietary licence.
```

- [ ] **Step 3: Change visibility**

After confirmation only:

```powershell
gh repo edit DanielAsiamah/RiskRadar --visibility private --accept-visibility-change-consequences
gh repo view DanielAsiamah/RiskRadar --json visibility,url
```

Expected: `visibility` is `PRIVATE`.

- [ ] **Step 4: Apply owned-code licence wording**

Set package licence to `UNLICENSED`, mark the package private, replace RiskRadar's
own `LICENSE` with an all-rights-reserved proprietary notice, and preserve
`THIRD_PARTY_NOTICES.md`.

- [ ] **Step 5: Verify and commit**

```powershell
npm run typecheck
npm run test:backend
npm run build:web
git add LICENSE package.json README.md THIRD_PARTY_NOTICES.md
git commit -m "chore: make future RiskRadar source proprietary"
git push origin master
```

## Plan Acceptance

- FAQ and privacy wording accurately describe the score, data, billing, alerts,
  and one-time location behavior.
- `supr3ltd@gmail.com` is reachable from support and advertiser pages.
- Free sponsor placements are labelled and isolated from risk intelligence.
- Premium remains ad-free.
- Existing MIT grants and third-party notices are not misrepresented.
- GitHub privacy/licensing changes occur only after the exact confirmation.
