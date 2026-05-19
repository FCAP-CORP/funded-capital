# Funded Capital — Setup Guide

## Prerequisites
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- npm (comes with Node)
- A GitHub account (free)
- A Vercel account (free — [vercel.com](https://vercel.com))

---

## Step 1 — Install dependencies

Open your terminal, navigate to the `funded-capital` folder, then run:

```bash
npm install
```

## Step 2 — Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you should see the Funded Capital homepage.

---

## Step 3 — Deploy to Vercel

1. Push this `funded-capital` folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo
4. Vercel auto-detects Next.js — click **Deploy**
5. Your site goes live at a `*.vercel.app` URL

---

## Step 4 — Connect fundedcapital.com

1. In Vercel → your project → **Settings → Domains**
2. Add `fundedcapital.com` and `www.fundedcapital.com`
3. Vercel shows you DNS records to enter (usually an A record and CNAME)
4. Log in to **Wix** → **Domains** → manage DNS for fundedcapital.com
5. Replace the existing DNS records with the ones Vercel provided
6. Wait 1–24 hours for DNS propagation
7. Cancel sintra.ai hosting once confirmed live

---

## Project Structure

```
funded-capital/
├── app/
│   ├── layout.tsx          # Root layout — Header + Footer
│   ├── page.tsx            # Homepage
│   ├── globals.css         # Global styles + Tailwind
│   ├── loan-programs/      # Loan Programs page
│   ├── how-it-works/       # How It Works page
│   ├── about/              # About Us page
│   ├── why-us/             # Why Us page
│   ├── broker-program/     # Broker Program page
│   ├── contact/            # Contact page
│   └── apply/              # Apply Now page (lead capture)
├── components/
│   ├── Header.tsx          # Sticky nav with Apply Now CTA
│   └── Footer.tsx          # Footer with Apply Now CTA banner
├── package.json
├── next.config.ts          # Next.js 15 + PPR enabled
├── tailwind.config.ts      # Navy/gold design tokens
└── tsconfig.json
```

---

## Next Steps (Future Enhancements)

- **Form backend**: Connect Apply Now and Contact forms to a service like Formspree, EmailJS, or a custom API route
- **CRM integration**: Pipe leads directly into your CRM (HubSpot, GoHighLevel, etc.)
- **Analytics**: Add Vercel Analytics or Google Analytics
- **Logo**: Replace the text logo with an SVG in `components/Header.tsx`
- **Images**: Add property photos using Next.js `<Image />` in the Hero section
- **SEO**: Update meta descriptions and OG images in each `page.tsx`
