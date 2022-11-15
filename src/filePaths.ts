/////////////////////:
/// config
import fs from 'fs'
import * as dbg from './dbg'
import * as uConf from './userConf'
let hasValidFolders = false;
let baseAppPath = '';
let viewerHTMLBasePath = "../view-dist";


let conf = getConf(true)
const usehttps = false;
export function getConf(ignoreInvalid = false) {
    if (!ignoreInvalid && !hasValidFolders) {
        dbg.error("base path not valid", baseAppPath)
    }
    return {
        viewerHTMLBasePath,
        baseDir: baseAppPath + 'public/data',
        groupFile: baseAppPath + 'public/data/groups.json',
        knownDevicesFile: baseAppPath + 'public/data/knownDevices.json',
        agendasFolder: baseAppPath + 'public/data/agendas/',
    }
}


export function setViewerHTMLBasePath(n: string) {
    dbg.log("setting base html path ", n)
    viewerHTMLBasePath = n;
    conf = getConf(true);
}

export function setRWBasePath(n: string) {
    if (!n.endsWith('/'))
        n = n + '/'
    baseAppPath = n;
    conf = getConf(true);
    initFolders();
    rwPathIsSet = true;
}

export function getFileObj(p: string) {
    try {
        return JSON.parse(fs.readFileSync(p).toString())
    } catch (error) {
        dbg.error("can't parse file", p, error)
    }
    return undefined
}

export function writeFileObj(p: string, data: any) {
    dbg.log("writing to file", p);
    uConf.setRW(true);
    try {
        fs.writeFileSync(p, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    } catch (error) {
        dbg.error("can't parse file", p, error)
    } finally {
        uConf.setRW(false);
    }
    return undefined
}


function initFolders() {
    uConf.setRW(true);
    try {
        if (!fs.existsSync(conf.agendasFolder))
            fs.mkdirSync(conf.agendasFolder, { recursive: true })

        if (!fs.existsSync(conf.groupFile))
            fs.writeFileSync(conf.groupFile, '{}', { encoding: 'utf-8' })
        if (!fs.existsSync(conf.knownDevicesFile))
            fs.writeFileSync(conf.knownDevicesFile, '{}', { encoding: 'utf-8' })
        hasValidFolders = true;
    }
    catch (e) {
        dbg.error("can't init files for base path", baseAppPath, e)
    } finally {
        uConf.setRW(false);
    }

}

initFolders();

let rwPathIsSet = false;



// dbg.log("cer",conf.credentials)
