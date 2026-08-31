This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

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

## Production Deployment (Hostinger Static Export)

This frontend builds to a static export and must **never** be run as a persistent Node.js server.

1. **Configure Environment Variables**: Set `NEXT_PUBLIC_API_URL` in `.env.production` (or `.env.local`) to point to your backend API URL (e.g. `https://api.yourrestaurant.com`).
2. **Build Locally**:
   ```bash
   npm install && npm run build
   ```
3. **Static Output**: This produces a static `out/` folder â€” **NOT** `.next/`.
4. **Hostinger Upload**: Upload the *contents* of `out/` directly into Hostinger's `public_html/` (or your domain's document root), so `index.html` sits at the root.
5. **No Node.js App**: Do **NOT** create a Node.js app in Hostinger hPanel for the frontend. It must be served as plain static files to preserve process budget on shared hosting.
