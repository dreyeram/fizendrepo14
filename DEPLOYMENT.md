# LoyalMed Raspberry Pi 5 Deployment Guide

**Goal**: Power On → **Perfectly Black Screen** → **LoyalMed Kiosk Interface**

---

## Prerequisites
- Raspberry Pi 5 + Power Supply + MicroSD (32GB+) + Monitor (1920x1080)
- Raspberry Pi Imager (on your PC/Mac)

---

## PART 1: Flash the OS

1. Open **Raspberry Pi Imager**.
2. **OS**: Select `Raspberry Pi OS (64-bit)` — **Desktop Version** (NOT Lite).
3. **Storage**: Your SD card.
4. **Settings** (Gear Icon):
   - Hostname: `lm` (or `loyalmed-pi`)
   - Username: `lm`
   - Password: `lmadmin`
   - WiFi: Configure your network.
   - SSH: **Enable**.
5. **Write** and wait for verification.

---

## PART 2: Silent Boot Configuration (On PC BEFORE First Boot)

After flashing, **do NOT eject the card yet**. Open the `bootfs` partition (shows up as a drive).

### Step 2.1: Edit `config.txt`
Add these lines at the **very end**:
```ini
# Silent Boot
disable_splash=1
```

### Step 2.2: Edit `cmdline.txt`
This must be a **SINGLE LINE**. Replace the entire content with:
```
console=tty3 loglevel=0 quiet logo.nologo vt.global_cursor_default=0 plymouth.enable=0 root=PARTUUID=XXXXXXXX-XX rootfstype=ext4 fsck.repair=yes rootwait
```
> **IMPORTANT**: Replace `PARTUUID=XXXXXXXX-XX` with the original PARTUUID value that was in your file. **Do not change this value.**

### Step 2.3: Eject & Boot
Safely eject the SD card and insert it into the Pi. Power on.

---

## PART 3: First Boot & System Configuration

### Step 3.1: Connect via SSH
```bash
ssh lm@lm.local
# Password: lmadmin
```

### Step 3.2: Disable Plymouth & Greeter Completely
```bash
sudo systemctl mask plymouth-start.service
sudo systemctl mask plymouth-quit-wait.service
sudo systemctl mask plymouth-quit.service
```

### Step 3.3: Set Desktop Autologin (REQUIRED for Kiosk)
```bash
sudo raspi-config
```
Navigate to: **1 System Options** → **S5 Boot / Auto Login** → **B4 Desktop Autologin**

### Step 3.4: Update System
```bash
sudo apt update && sudo apt upgrade -y
```

---

## PART 4: Install Application

### Step 4.1: Install Node.js & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### Step 4.2: Clone & Build
```bash
cd ~
git clone https://<YOUR_GITHUB_PAT>@github.com/dreyeram/m1esosent.git loyalmed
cd loyalmed
npm install
npm run build
```

### Step 4.3: Setup Database
```bash
echo 'DATABASE_URL="file:./dev.db"' > .env
npx prisma generate
npx prisma db push
node scripts/seed-admin.js
```
**Login**: `demo@clinic.com` / `demo123`

### Step 4.4: Start with PM2
```bash
pm2 start npm --name "loyalmed" -- start
pm2 save
pm2 startup
# ↑ Run the command PM2 outputs!
```

---

## PART 5: Kiosk Mode Setup (THE KEY PART)

### Step 5.1: Install Kiosk Dependencies
```bash
sudo apt install -y chromium-browser unclutter xdotool
```

### Step 5.2: Create Kiosk Script
```bash
nano ~/kiosk.sh
```
Paste this:
```bash
#!/bin/bash

# Wait for desktop to fully initialize
sleep 5

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 0.1 -root &

# Start Chromium in Kiosk Mode
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --check-for-update-interval=31536000 \
  http://localhost:3000
```
Save: `Ctrl+O`, Enter, `Ctrl+X`

Make it executable:
```bash
chmod +x ~/kiosk.sh
```

### Step 5.3: Create Autostart Entry
```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/kiosk.desktop
```
Paste:
```ini
[Desktop Entry]
Type=Application
Name=LoyalMed Kiosk
Exec=/home/lm/kiosk.sh
X-GNOME-Autostart-enabled=true
```
Save and exit.

### Step 5.4: Disable Desktop Panels & Wallpaper (Optional but Cleaner)
```bash
# Hide the desktop panel (taskbar)
echo "@lxpanel --profile LXDE-pi" | sudo tee -a /etc/xdg/lxsession/LXDE-pi/autostart
# OR simply:
mkdir -p ~/.config/lxpanel/LXDE-pi/panels
echo "" > ~/.config/lxpanel/LXDE-pi/panels/panel
```

---

## PART 6: Reboot & Verify

```bash
sudo reboot
```

**Expected Result**:
1. Screen stays BLACK during boot (no logos, no text).
2. After ~20-30 seconds, LoyalMed app appears in fullscreen.
3. No desktop, no taskbar, no mouse cursor visible.

---

## Troubleshooting

### Still seeing Raspberry Pi logo at boot?
- Double-check `cmdline.txt` has `logo.nologo` and is ONE LINE.
- Verify `config.txt` has `disable_splash=1`.

### Desktop still visible before app?
- Increase the `sleep 5` in `kiosk.sh` to `sleep 10`.
- Verify the autostart file is in `~/.config/autostart/`.

### Mouse cursor still visible?
- Run: `pkill unclutter && unclutter -idle 0 -root &`

### PM2 / App not starting?
```bash
pm2 delete all
pm2 start npm --name "loyalmed" -- start
pm2 save
```
