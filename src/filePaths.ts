/////////////////////:
/// config
import fs from 'fs'
import * as dbg from './dbg'
import * as uConf from './userConf'
import { isAndroid } from './platformUtil';
let hasValidFolders = false;
let baseAppPath = '';
let viewerHTMLBasePath = "../view-dist";
let rwPathIsSet = false;

let conf = getConf(true)
const usehttps = false;
export function getConf(ignoreInvalid = false) {
    // if (!rwPathIsSet && !ignoreInvalid) {
    //     dbg.error("!!!!!!!!!get conf before RW path")
    // }
    if (!ignoreInvalid && !hasValidFolders) {
        dbg.error("base path not valid", baseAppPath)
    }
    return {
        viewerHTMLBasePath,
        baseDir: baseAppPath + 'public/data',
        groupFile: baseAppPath + 'public/data/groups.json',
        knownDevicesFile: baseAppPath + 'public/data/knownDevices.json',
        knownLoraDevicesFile: baseAppPath + 'public/data/knownLoraDevices.json',
        agendasFolder: baseAppPath + 'public/data/agendas/',
    }
}


export function setViewerHTMLBasePath(n: string) {
    dbg.log("setting base html path ", n)
    viewerHTMLBasePath = n;
    conf = getConf(true);
}

export function setRWBasePath(n: string, doInitFolders = true) {
    if (n.length && !n.endsWith('/'))
        n = n + '/'
    baseAppPath = n;
    dbg.warn("setting RW base path", n)
    conf = getConf(true);
    if (doInitFolders)
        initFolders();
    rwPathIsSet = true;
}

export function getFileObj(p: string) {
    if (!fs.existsSync(p)) {
        dbg.error("inexistent file", p)
        return undefined
    }
    let str;
    try {
        str = fs.readFileSync(p).toString()
        return JSON.parse(str)
    } catch (error) {
        dbg.error("can't parse file", p, error)
        dbg.error(">>>>>>was", str)
    }
    return undefined
}

export function writeFileObj(p: string, data: any) {
    dbg.log("writing to file", p);
    uConf.setRW(true);
    try {
        // const stripped = {};
        // for (const [k, v] of Object.entries(data))
        //     if (!k.startsWith("_"))
        //         stripped[k] = v
        fs.writeFileSync(p, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    } catch (error) {
        dbg.error("can't parse file", p, error)
    } finally {
        uConf.setRW(false);
    }
    return undefined
}

const targetAndroidPath = "/storage/emulated/0/Android/data/com.androidjs.lumestrio/files/"

function initFolders() {
    uConf.setRW(true);
    if (isAndroid && baseAppPath != targetAndroidPath) { // bad hack
        console.warn("android hack")
        setRWBasePath(targetAndroidPath, false)
    }
    dbg.warn("init base files at " + conf.baseDir);
    try {
        if (!fs.existsSync(conf.agendasFolder))
            fs.mkdirSync(conf.agendasFolder, { recursive: true })
        if (!fs.existsSync(conf.groupFile))
            fs.writeFileSync(conf.groupFile, '{}', { encoding: 'utf-8' })
        if (!fs.existsSync(conf.knownDevicesFile))
            fs.writeFileSync(conf.knownDevicesFile, '{}', { encoding: 'utf-8' })
        if (!fs.existsSync(conf.knownLoraDevicesFile))
            fs.writeFileSync(conf.knownLoraDevicesFile, '{"list":[]}', { encoding: 'utf-8' })
        hasValidFolders = true;
    }
    catch (e) {
        dbg.error("can't init files for base path", baseAppPath, e)
    } finally {
        uConf.setRW(false);
    }

}


initFolders();
rwPathIsSet = false;



// dbg.log("cer",conf.credentials)
