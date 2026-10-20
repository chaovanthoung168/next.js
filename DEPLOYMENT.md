# Deploy with Shipora or Docker

The root `Dockerfile` installs locked npm dependencies, builds Next.js standalone
output, and runs the production server as a non-root user. Static assets and the
`public` directory are included. See the
[Next.js standalone output guide](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

Build and test locally:

```bash
docker build -t nextjs-local .
docker run --rm -p 127.0.0.1:3001:3000 nextjs-local
```

Open `http://localhost:3001`. Configure the Shipora application with:

| Setting | Value |
| --- | --- |
| Dockerfile path | `Dockerfile` |
| Build context | `.` |
| Container port | `3000` |
| Health path | `/` |

Commit these deployment files and push them to the tracked branch, then select
that new commit in Shipora. Retrying an older deployment uses its original commit
and cannot pick up a newly added Dockerfile.

Keep environment files and private keys out of the build context. Shipora injects
application environment variables at runtime. Browser-visible `NEXT_PUBLIC_*`
values are compiled during the image build and must never contain secrets.

This Dockerfile expects one npm application at the repository root and its
committed `package-lock.json`.
