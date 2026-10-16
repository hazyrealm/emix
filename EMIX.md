# Emix

Emix is a self-hosted messaging, voice, video and screen-sharing service running
at https://getemix.com. It is a modified version of
[Backspace](https://github.com/TheZwiss/backspace) by Jannis Braun.

## License and attribution

- Backspace is licensed under the **GNU Affero General Public License v3.0**
  (`AGPL-3.0-only`); see [LICENSE](LICENSE). Emix is distributed under the same
  license. The complete source of the running Emix service is this repository,
  as required by AGPL-3.0 section 13.
- Copyright and third-party notices are preserved in [NOTICE](NOTICE).
- "Backspace" and its logos are trademarks of the Backspace project and are not
  used as Emix branding. Emix branding replaces them in the user interface.
- [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md) and [CLA.md](CLA.md) describe the
  upstream project's own licensing and contribution terms; they are kept for
  reference and grant nothing beyond what their text says.

## What Emix changes

- `deploy/`: the getemix.com deployment (edge proxy, prod/staging stacks,
  operations scripts). See [deploy/README.md](deploy/README.md).
- Emix branding and voice/video tuning (listed in the git history).

## Upstream

The `upstream` remote tracks Backspace. Upstream fixes are merged in through the
staging workflow described in `deploy/README.md`.
