#!/usr/bin/env bash
# AlgoFin v1 — VPS Initial Setup Script
# Run this ONCE on a fresh Ubuntu 22.04 / 24.04 VPS as root.
# After this script completes, use GitHub Actions for all future deploys.
#
# Prerequisites:
#   - Ubuntu 22.04 LTS or 24.04 LTS VPS (2GB+ RAM recommended)
#   - Domain DNS A record pointing to your VPS IP
#   - SSH access as root
#
# Usage:
#   scp setup-vps.sh root@YOUR_VPS_IP:/root/
#   ssh root@YOUR_VPS_IP "bash /root/setup-vps.sh YOUR_DOMAIN YOUR_EMAIL"
#
# Arguments:
#   $1 — Your domain (e.g. algofin.io)
#   $2 — Your email (for Let's Encrypt notifications)

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"
DEPLOY_DIR="/opt/algofin"
DEPLOY_USER="algofin"

log()  { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
err()  { echo "  ✗ $*" >&2; exit 1; }

echo ""
echo "  AlgoFin VPS Setup"
echo "  Domain: $DOMAIN"
echo "  Email:  $EMAIL"
echo "  ─────────────────────────────────────"
echo ""

# ── 1. System update ──────────────────────────────────────────────
log "Updating system packages..."
apt-get update -q && apt-get upgrade -y -q
apt-get install -y -q curl wget git ufw fail2ban unattended-upgrades

# ── 2. Docker ─────────────────────────────────────────────────────
log "Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi
log "Docker installed: $(docker --version)"

# ── 3. Docker Compose ─────────────────────────────────────────────
log "Installing Docker Compose v2..."
if ! docker compose version &>/dev/null 2>&1; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
    curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi
log "Docker Compose: $(docker-compose --version)"

# ── 4. Deploy user ────────────────────────────────────────────────
log "Creating deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
fi

# ── 5. Deploy directory ───────────────────────────────────────────
log "Creating deploy directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/nginx"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

# ── 6. Certbot / Let's Encrypt ────────────────────────────────────
log "Installing Certbot..."
apt-get install -y -q certbot

# Obtain certificate (standalone mode — no web server yet)
log "Obtaining SSL certificate for $DOMAIN..."
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    || warn "Certbot failed — ensure DNS is pointing to this server IP"

# Auto-renewal cron
log "Setting up certificate auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker-compose -f $DEPLOY_DIR/docker-compose.prod.yml exec -T nginx nginx -s reload'") | crontab -

# ── 7. Firewall (UFW) ─────────────────────────────────────────────
log "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # Port 22
ufw allow http         # Port 80
ufw allow https        # Port 443
ufw --force enable
log "Firewall active: $(ufw status | head -1)"

# ── 8. Fail2ban ───────────────────────────────────────────────────
log "Enabling fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ── 9. Unattended upgrades ────────────────────────────────────────
log "Enabling automatic security updates..."
dpkg-reconfigure -f noninteractive unattended-upgrades

# ── 10. GitHub Actions SSH key ────────────────────────────────────
log "Generating deploy SSH key for GitHub Actions..."
SSH_KEY_FILE="/root/.ssh/algofin_deploy"
if [[ ! -f "$SSH_KEY_FILE" ]]; then
    ssh-keygen -t ed25519 -f "$SSH_KEY_FILE" -N "" -C "algofin-github-actions"
    cat "${SSH_KEY_FILE}.pub" >> /root/.ssh/authorized_keys
fi

echo ""
echo "  ─────────────────────────────────────"
echo "  VPS setup complete!"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Copy your .env.production to the server:"
echo "     scp algofin-backend/.env.production root@$(hostname -I | awk '{print $1}'):$DEPLOY_DIR/.env"
echo ""
echo "  2. Copy your nginx configs:"
echo "     scp algofin-backend/nginx/* root@$(hostname -I | awk '{print $1}'):$DEPLOY_DIR/nginx/"
echo "     Then replace YOUR_DOMAIN in $DEPLOY_DIR/nginx/algofin.conf with $DOMAIN"
echo ""
echo "  3. Add these GitHub Actions secrets:"
echo "     VPS_HOST:           $(hostname -I | awk '{print $1}')"
echo "     VPS_USER:           root"
echo "     VPS_SSH_KEY:        (copy the key below)"
echo "     PRODUCTION_DOMAIN:  $DOMAIN"
echo ""
echo "  4. Deploy SSH private key (add as VPS_SSH_KEY secret):"
echo "  ─────────────────────────────────────"
cat "$SSH_KEY_FILE"
echo "  ─────────────────────────────────────"
echo ""
echo "  5. Push to main branch — GitHub Actions will deploy automatically."
echo ""
