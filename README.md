# TechEd Academy

## Local development

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and provide the Supabase project URL and publishable key.

## Google AdSense

The homepage has one responsive AdSense placement, after the hero. Ads are not shown in sign-in flows or student, instructor, and admin workspaces. To enable it:

1. Get the site approved in your Google AdSense account and create a display ad unit.
2. Set `VITE_ADSENSE_CLIENT` to the publisher ID (`ca-pub-...`) and `VITE_ADSENSE_HOME_SLOT` to that ad unit's slot ID in `.env.local`.
3. Add the same variables to the production hosting environment and redeploy.

These are public browser configuration values, not secrets. The ad placement stays hidden until both are set. Google must approve the site and ad unit before ads can serve.
