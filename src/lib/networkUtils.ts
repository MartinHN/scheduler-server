import * as os from 'os'

export function getIpOfInterface(targetIf: string) {
    if (targetIf as string === "") return undefined
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
