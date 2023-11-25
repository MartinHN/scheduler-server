import { isAndroid } from '../platformUtil';
import { execSync } from 'child_process';
import * as os from 'os'


function getAndroidCurIp() {
    // execSync("ifconfig wlan0 | grep 'inet addr' | cut -d: -f2 | awk '{print $1}'").toString()
    return "127.0.0.1"
}

export function getIpOfInterface(targetIf: string) {
    if (targetIf as string === "") return undefined
    if (isAndroid) { return getAndroidCurIp() }
    const interfaces = os.networkInterfaces();

    for (const ifName of Object.keys(interfaces)) {
        if (ifName !== targetIf) { continue }
        const addresses = interfaces[ifName];
        for (const addressInfo of addresses) {
            if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
                return addressInfo.address;
            }
        }
    }

    return "";
};

export function getIPAddresses() {
    if (isAndroid) { return [getAndroidCurIp()] }
    const interfaces = os.networkInterfaces();
    const ipAddresses = new Array();

    for (const ifName of Object.keys(interfaces)) {
        const addresses = interfaces[ifName];
        for (const addressInfo of addresses) {
            if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
                ipAddresses.push(addressInfo.address);
            }
        }
    }
    return ipAddresses;
};
