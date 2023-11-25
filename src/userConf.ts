import path from 'path'
import { execSync, execFileSync } from "child_process"
import { readFileSync, writeFileSync } from 'fs'
import { isPi } from './platformUtil'
import * as dbg from './dbg'
export const thisPath = isPi ? "/home/pi/raspestrio/server" : "/home/tinmar/Dev/raspestrio/server"
const confBasePath = thisPath + "/public/data"
const defaultConfFileName = 'app.conf'


export const defaultConf = {
    nickName: "unknown",
    isMainServer: false,
    reboot: null,
    toggleState: null,
    MiniMadIp: "2.0.0.2",
    MiniMadCtl: null // play, pause, restart
};

export function load(fName?: string): any {
    const confPath = confBasePath + (fName || defaultConfFileName)
    try {
        const rawdata = readFileSync(confPath, { encoding: 'utf-8' });
        const conf = JSON.parse(rawdata);
        dbg.log('loaded', conf, 'from', confPath);
        return conf

    } catch (error) {

    }
    return {}
}


export function save(conf: any, fName?: string) {
    const confPath = confBasePath + (fName || defaultConfFileName)
    setRW(true)
    const jsonContent = JSON.stringify(conf);
    dbg.log('saving', jsonContent, 'in', confPath);

    writeFileSync(confPath, jsonContent, 'utf8');

    setRW(false)

}

export function setVariable(vName: string, v: any, confName?: string) {
    const actualConf = load(confName);
    actualConf[vName] = v;
    save(actualConf, confName);
}

export function getVariable(vName: string, confName?: string): any {
    const actualConf = load(confName);
    return actualConf[vName] || defaultConf[vName]
}


export function isRW() {
    try {
        const out = execSync("mount | grep 'type ext4' | grep rw")
        if (out) { return true }
    } catch (e) {

    }
    return false
}

export const bootedInRW = (!isPi || isRW())

export function setRW(isRW) {
    if (bootedInRW) {
        dbg.log('ignoring rw as it was booted rw')
        return;
    }
    if (isPi) {
        const out = execFileSync(thisPath + "/src/rw.sh", [isRW ? "rw" : "ro"])
        if (out) dbg.log("rw out", out);
    }
}
