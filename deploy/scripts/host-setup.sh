#!/usr/bin/env bash
# Reproduce the Emix host configuration on a fresh Ubuntu 24.04 server.
# Idempotent. Run as root from /opt/emix. This is the record of everything
# configured outside Docker on the getemix.com VPS (2026-10-16).
#
# DANGER: enables a default-deny firewall. Port 22 is allowed first, but if
# SSH runs on another port, edit SSH_PORT before running.
set -euo pipefail
SSH_PORT="${SSH_PORT:-22}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

# ── Packages: Docker (official repo), GitHub CLI, firewall, backup ──
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw restic p7zip-full >/dev/null
install -m 0755 -d /etc/apt/keyrings
[ -f /etc/apt/keyrings/docker.asc ] || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
[ -f /etc/apt/keyrings/githubcli-archive-keyring.gpg ] || curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin gh >/dev/null

# ── Docker: bounded logs, containers survive daemon restarts ──
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true
}
EOF
systemctl enable docker >/dev/null 2>&1; systemctl restart docker

# ── Swap (4 GB) and kernel tuning ──
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/60-emix-swap.conf
cat > /etc/sysctl.d/61-emix-webrtc.conf <<'EOF'
# Larger UDP socket buffers for LiveKit (WebRTC media); LiveKit suggests >= 5 MB.
net.core.rmem_max=5000000
net.core.wmem_max=5000000
EOF
sysctl -q --system

# ── Firewall (SSH first, then default deny) ──
ufw allow "$SSH_PORT/tcp" comment 'SSH' >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 80/tcp comment 'HTTP (ACME + redirect)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 7881/tcp comment 'LiveKit prod ICE/TCP' >/dev/null
ufw allow 50000:60000/udp comment 'LiveKit prod media' >/dev/null
ufw allow 3478/udp comment 'LiveKit TURN/UDP' >/dev/null
ufw allow 5349/tcp comment 'LiveKit TURN/TLS' >/dev/null
ufw allow 7891/tcp comment 'LiveKit staging ICE/TCP' >/dev/null
ufw allow 7892/udp comment 'LiveKit staging media (mux)' >/dev/null
ufw allow from 172.30.0.0/24 to any port 7880,7890 proto tcp comment 'Caddy -> LiveKit signaling (docker)' >/dev/null
ufw --force enable >/dev/null

# ── Backups: restic config (password generated once, root-only) ──
install -d -m 700 /etc/emix
[ -f /etc/emix/restic-password ] || (umask 077; openssl rand -base64 48 > /etc/emix/restic-password)
[ -f /etc/emix/backup.env ] || (umask 077; printf 'RESTIC_REPOSITORY=/var/backups/emix-restic\nRESTIC_PASSWORD_FILE=/etc/emix/restic-password\n' > /etc/emix/backup.env)

# ── Tools and timers ──
ln -sf "$REPO/deploy/scripts/emixctl" /usr/local/bin/emixctl
for u in emix-turn-cert.service emix-turn-cert.timer emix-backup.service emix-backup.timer; do
  ln -sf "$REPO/deploy/systemd/$u" "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now emix-turn-cert.timer emix-backup.timer >/dev/null 2>&1

echo "host setup complete. Next: deploy/scripts/init-env.sh prod|staging, emixctl build, deploy (see deploy/README.md)"
