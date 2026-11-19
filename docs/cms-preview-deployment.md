# CMS preview deployment

The current redesign and Content Workspace are on `feat/cms-design`.
Push and deploy this branch without merging into or pushing to `main`.

## What is included

- Public school website at `/`, with a responsive rotating campus illustration.
- Content Workspace at `/admin`, with demo sign-in, content editing, images,
  publication controls, Trash, permanent removal, and Undo/Redo.
- The Public website link opens a separate tab. Direct navigation and refresh
  use the SPA rewrites already defined in `vercel.json`.

This is a design preview. The demo sign-in is implemented in the browser and
does not provide production access control. Edits and uploaded images are kept
in localStorage on each browser and origin. They update the public preview in
that same browser, including other tabs, but do not publish content to other
visitors. Existing edits from the standalone HTML are not automatically
transferred to the hosted URL. A shared CMS needs server authentication and
database-backed content and file storage.

Demo account for this preview:

- Email: `admin@sncs.example`
- Password: `SNCS-Preview-26!`

## GitHub source

Upload the complete source from this branch to the user's chosen repository.
For an empty destination repository, a separate remote preserves the original
APC repository connection:

```sh
git remote add personal YOUR_GITHUB_REPOSITORY_URL
git push personal HEAD:refs/heads/feat/cms-design
```

Verify that `HEAD` is `feat/cms-design` first. If the destination has existing
content, inspect its history before pushing. Do not force-push or overwrite
existing branches. Keep `.git`, `node_modules`, `dist`, `.env` files and Vercel
account metadata out of manual source uploads. `.env.example` contains only
configuration names and placeholders and belongs in the source.

## Vercel project

Import the chosen GitHub repository in the user's Vercel account. Deploy the
`feat/cms-design` branch. With an existing project, use a branch preview and
preserve its production branch. A separate new demo project can use
`feat/cms-design` as its production branch if a stable demo URL is wanted.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | Repository root, containing `package.json` and `vercel.json` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Install command | Default package-manager detection |
| Node.js | 22.x |
| Branch | `feat/cms-design` |
| Environment variable | `VITE_CMS_PREVIEW=true` |

Set `VITE_CMS_PREVIEW=true` for the environment being deployed: Preview for a
branch preview, or Production for a separate production demo. Redeploy after
changing it because Vite embeds this value during the build. Without it,
production builds intentionally omit the `/admin` preview route.

The public design and browser-local CMS do not need database credentials.
Live PDF resources use `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The existing enrollment API needs its own
server credentials and Turnstile configuration before it can accept real
submissions. Follow [enrollment setup](enrollment-setup.md) for that separate
integration. Keep server secrets in Vercel environment variables, never in
source or `VITE_` variables.

## Deployment checks

1. Open `/` and refresh it. The public homepage remains open.
2. Open `/admin` directly and sign in with the demo account.
3. Open Public website from the workspace. It opens in another tab.
4. Create and publish a test announcement with an image. It appears in the
   same browser's public preview.
5. Move that test item to Trash, restore it, and check Undo/Redo.
6. Use permanent removal only on a disposable test item. Confirm that refresh
   and Undo/Redo do not bring it back.
7. Check the sign-in and editor fields on phone and desktop widths.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[GitHub deployments](https://vercel.com/docs/git/vercel-for-github), and
[Vercel environment variables](https://vercel.com/docs/environment-variables).
