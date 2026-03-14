'use server'

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

// Helper function to execute commands safely
async function executeCommand(command: string) {
    try {
        const { stdout, stderr } = await execAsync(command);
        return { success: true, message: stdout.trim() };
    } catch (error) {
        return { success: false, error: 'Command failed' };
    }
}

/**
 * Retrieves real-time system diagnostics for the console footer.
 * Designed for Raspberry Pi OS (Linux).
 */
export async function getSystemStatus() {
    const isLinux = process.platform === 'linux';

    // 1. WiFi SSID - Use iwgetid -r
    let ssid = null;
    if (isLinux) {
        const result = await executeCommand('iwgetid -r');
        if (result.success && result.message) ssid = result.message;
    } else {
        ssid = "MLN-Clinic-5G"; // Mock for dev
    }

    // 2. Camera Status - Check if /dev/video0 exists
    let cameraDetected = false;
    if (isLinux) {
        try {
            await fs.promises.access('/dev/video0', fs.constants.F_OK);
            cameraDetected = true;
        } catch {
            cameraDetected = false;
        }
    } else {
        cameraDetected = true; // Mock for dev
    }

    // 3. Power Stability - Check vcgencmd get_throttled (Raspberry Pi specific)
    let powerStable = true;
    if (isLinux) {
        const result = await executeCommand('vcgencmd get_throttled');
        if (result.success && result.message) {
            // throttled=0x0 means everything is fine
            // If the first bit is 1 (e.g. 0x1, 0x50001, etc.), it means undervoltage has occurred
            const parts = result.message.split('=');
            if (parts.length > 1) {
                const hexValue = parts[1];
                const bits = parseInt(hexValue, 16);
                // Bit 0: Under-voltage detected
                // Bit 16: Under-voltage occurred
                if ((bits & 0x1) || (bits & 0x10000)) {
                    powerStable = false;
                }
            }
        }
    } else {
        powerStable = true; // Mock for dev
    }

    // 4. USB Storage Detection
    let usbConnected = false;
    if (isLinux) {
        // Look for mounts in /media (standard for Raspberry Pi) or /mnt
        const result = await executeCommand("lsblk -o MOUNTPOINT -nr | grep -E '^/media|^/mnt'");
        if (result.success && result.message) {
            usbConnected = true;
        }
    } else {
        // Windows: Check logical disks with drive type 2 (Removable)
        const result = await executeCommand('wmic logicaldisk where drivetype=2 get deviceid');
        if (result.success && result.message && result.message.includes(':')) {
            usbConnected = true;
        }
    }

    return {
        wifi: ssid,
        camera: cameraDetected,
        power: powerStable ? 'stable' : 'warning',
        usb: usbConnected,
        timestamp: new Date().toISOString()
    };
}


export async function shutdownSystem() {
    return executeCommand('sudo shutdown -h now');
}

export async function restartSystem() {
    return executeCommand('sudo reboot');
}

export async function sleepSystem() {
    return executeCommand('sudo systemctl suspend');
}
