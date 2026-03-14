# Endoscopy Suite — Complete Raspberry Pi Deployment Guide

**Goal**: Power On → **No Desktop/Logos** → **App in Full-Screen Kiosk Mode**

---

## 1. PREPARE THE RASPBERRY PI (First-Time Setup)

### 1.1 Flash Raspberry Pi OS

1. Open **Raspberry Pi Imager** on your PC.
2. Select **OS**: `Raspberry Pi OS (64-bit)` — **Desktop Version**.
3. Select **Storage**: Your SD card.
4. Click the **⚙ Gear Icon (Settings)**:
   - Hostname: `lm` (or `loyalmed-pi`)
   - Username: `lm` / Password: `lmadmin`
   - Configure your WiFi network
   - **Enable SSH**
5. **Write** the OS to the SD card and wait for it to finish.

### 1.2 Silent Boot Configuration (On PC BEFORE First Boot)

After flashing, keep the SD card in your PC. Open the `bootfs` partition.

**Edit `config.txt`**
Add these lines at the very end of the file:
```ini
[all]
# ===== SILENT BOOT =====
disable_splash=1
boot_delay=0
gpu_mem=256
max_usb_current=1
hdmi_blanking=0
dtoverlay=dwc2

# Force HDMI Hotplug and Resolution (Strictly 1920x1080)
hdmi_force_hotplug=1
hdmi_group=1
hdmi_mode=16
```

**Edit `cmdline.txt`**
This must be exactly ONE line. Replace the entire content with:
```text
console=tty3 loglevel=0 quiet logo.nologo vt.global_cursor_default=0 plymouth.enable=0 root=PARTUUID=XXXXXXXX-XX rootfstype=ext4 fsck.repair=yes rootwait
```
> **⚠️ IMPORTANT**: Replace `PARTUUID=XXXXXXXX-XX` with the original value from your file. Do not change the PARTUUID.

Eject the SD card, insert it into the Raspberry Pi, and power it on.

---

## 2. SYSTEM CONFIGURATION & DEPENDENCIES

### 2.1 SSH into the Pi

```bash
ssh lm@lm.local
# Password: lmadmin
```

### 2.2 Disable Boot Splash (Plymouth)

```bash
sudo systemctl mask plymouth-start.service
sudo systemctl mask plymouth-quit-wait.service
sudo systemctl mask plymouth-quit.service
```

### 2.3 Set to Console Autologin

```bash
sudo raspi-config
```
Navigate to: **1 System Options** → **S5 Boot / Auto Login** → **B2 Console Autologin**
> *We use Console Autologin with manual X11 to avoid loading a full desktop environment.*

### 2.4 Update System & Install Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y xserver-xorg xinit openbox firefox-esr unclutter xdotool x11-xserver-utils curl git python3-opencv python3-numpy
```

### 2.5 Grant Camera Permissions

```bash
sudo usermod -aG video lm
```

### 2.6 Install Node.js 20 & PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

## 3. INSTALLING THE ENDOSCOPY APP

### 3.1 Clone the Repository

Clone from your new repository (`fizendrepo14`):

```bash
cd ~
git clone https://github.com/dreyeram/fizendrepo14.git endoscopy-suite
cd endoscopy-suite
```

### 3.2 Install NPM Packages

```bash
npm install --production=false
```

### 3.3 Setup Environment Variables

```bash
cat > .env << 'EOF'
# Database
DATABASE_URL="file:/home/lm/endoscopy-suite/prisma/prod.db"

# JWT Secrets (Customize these for production)
JWT_SECRET="endoscopy-suite-jwt-secret-change-in-production-to-random-string"
JWT_REFRESH_SECRET="endoscopy-suite-refresh-secret-change-in-production-to-random-string"

# Storage paths
INTERNAL_STORAGE_PATH="./data"
EXTERNAL_STORAGE_PATH="./usb-mock"

# Node environment
NODE_ENV="production"
PORT="3000"
EOF
```

### 3.4 Database Setup & Seeding

```bash
# Generate Prisma Client
npx prisma generate

# Create tables matching the schema
npx prisma db push

# Create initial admin user
node scripts/seed-admin.js
```
> Default admin login: `demo@clinic.com` / `demo123`

### 3.5 Build the Next.js Application

```bash
npm run build
```
*(This process takes a few minutes on a Raspberry Pi).*

### 3.6 Create Logs Directory

```bash
mkdir -p ~/endoscopy-suite/logs
```

---

## 4. STARTING THE APP WITH PM2

### 4.1 Start the Application

```bash
cd ~/endoscopy-suite
pm2 start ecosystem.config.js
```

### 4.2 Validate it is running

```bash
pm2 status
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Should return 200
```

### 4.3 Configure PM2 to Start on Boot

```bash
pm2 save
pm2 startup
```
> **⚠️ IMPORTANT**: The `pm2 startup` command will print a command that looks like `sudo env PATH=$PATH:/usr/bin...`. You **MUST** copy and paste that command into your terminal and run it to enable auto-start.

---

## 5. KIOSK MODE SETUP

This configures the Pi to automatically boot into Firefox in full-screen mode, showing the app seamlessly without a desktop environment.

### 5.1 Create the X11 Kiosk Script

```bash
cat > ~/.xinitrc << 'XINITRC'
#!/bin/bash

# Force resolution securely
xrandr --output HDMI-1 --primary --mode 1920x1080
xrandr --output HDMI-2 --off

# Set black background, disable screensaver/blanking
xsetroot -solid black
xset s off -dpms s noblank

# Hide the mouse cursor after 5 seconds of inactivity
unclutter -idle 5 -root &

# Start window manager
openbox-session &

# Wait until the Next.js server is ready
until curl -s http://localhost:3000 > /dev/null 2>&1; do
  sleep 0.5
done

# Launch Firefox in kiosk mode
exec firefox-esr --kiosk http://localhost:3000
XINITRC

chmod +x ~/.xinitrc
```

### 5.2 Auto-Start X Server on Boot

```bash
cat >> ~/.bash_profile << 'BASHPROFILE'

# Auto-start X (kiosk) if on tty1 and X is not already running
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  exec startx -- -nocursor 2>/dev/null
fi
BASHPROFILE
```

---

## 6. FINALIZE & REBOOT

```bash
sudo reboot
```

### Expected Boot Sequence
1. Black screen for 5-15 seconds (X Server starting silently).
2. App starts in the background.
3. Firefox appears directly into the Endoscopy Suite dashboard.

You are now fully deployed!

### Updating the Codebase Later
When updating, use the following sequence:

```bash
cd ~/endoscopy-suite
git pull origin main
npm install
npx prisma generate
npx prisma db push
npm run build
pm2 restart endoscopy-suite
```
