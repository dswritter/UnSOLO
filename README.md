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

## Mobile listing discovery

Listing cards use 16:9 banner frames on all screen sizes, matching the host
upload crop editor. Originals with other proportions are center-cropped for
display. Homepage rows start with the cached preview and request
additional public listing pages (eight cards at a time) only after the visitor swipes towards the row's end
(or taps "Load more"). Preview IDs are deduplicated against subsequent pages.
Each section's header keeps "View all" available without a large promotional
tile in the row. Failed page requests offer an explicit retry.

Explore ("View all") loads up to 20 results per batch, without first replaying
the homepage preview. More results append as the visitor approaches the bottom;
a Load more / Retry button is also available. Category/search controls stay
sticky above the results, and desktop filters remain visible in a separately
scrollable sticky sidebar. Mobile search is available through the bottom action
bar rather than a duplicate field above the results.

## Community conversations

Community renders the category controls before fetching conversation summaries.
Each category (All, DMs, Trips, Community) pages independently in batches of eight,
reusing matching conversations already loaded in other categories. Desktop opens
the last-visited chat, or the most recently active chat if there is no saved choice.
Other loaded chats' messages are warmed sequentially after the open chat.

At the top of a transcript, pull down on touch devices or scroll further upward
with a mouse/trackpad to refresh and fetch earlier messages, preserving the reading
position. The "Load earlier messages / refresh" button offers the same action.
Notification sound switches show explicit On/Off states and save each category's
preference on the device.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
