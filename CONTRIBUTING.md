# Contributing to Emix

Thanks for your interest in Emix.

- **Bugs and ideas:** open an issue using the bug report or feature request
  form.
- **Security problems:** do not open an issue. See [SECURITY.md](SECURITY.md).
- **Pull requests:** keep each change focused, and describe what it changes
  and how you tested it. CI must pass (lint, typecheck, build and tests).

## Development

Emix is a pnpm monorepo (Node.js 24):

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

- `packages/web`: React web app
- `packages/server`: Fastify server
- `packages/desktop`: Electron desktop app
- `packages/shared`: shared types and helpers
- `deploy/`: the getemix.com deployment (see `deploy/README.md`)

## License

By contributing, you agree that your contribution is licensed under the
project's license, the GNU Affero General Public License v3.0 (see
[LICENSE](LICENSE)).
