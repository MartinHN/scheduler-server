import fs from 'fs'
import { execSync, execFileSync } from "child_process"
import {isPi} from './platformUtil'
import * as uConf from './userConf'
import * as dbg from './dbg'
import conf from './config'
import * as appPaths from './filePaths' 

import os from 'os'


export function getHostName(){
    return fs.readFileSync("/etc/hostname").toString().trim();  
}


export function setHostName(newhost:string){
    dbg.warn('hostname will be set to' ,newhost)
    if(!isPi)
    {
        return
    }
    const hostn = getHostName();
    uConf.setRW(true);
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hosts`);
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hostname`);
    uConf.setRW(false);
}


export function getMac(){
    // we will only use it as uuid so take the first available
    const ifs = os.networkInterfaces();
    let firstMac =undefined;
    for(const [k,v] of Object.entries(ifs)){
        const curMac = v.find(i=>!!i.mac);
        if(curMac===undefined || !curMac.mac)continue;
        const isValidMac = curMac.mac.split(":").find(e=>e!="00")!==undefined
        if(!isValidMac)continue;
        // dbg.warn(">>> mac",k,v,curMac,isValidMac)
        if(k.startsWith("e") || firstMac===undefined  )
            firstMac = curMac
    } 
    
    return (firstMac && firstMac.mac) || "unknown"
    

}

export function getRSSI(){
    let res = 0
    try{ 
        res = parseInt(execSync("cat /proc/net/wireless | awk 'END { print $4 }' | sed 's/\.$//'").toString())
    // res=parseInt( execSync('iwlist wlan0 scanning | grep  -Eo "....dBm"').toString());
    }
    catch(e){
        dbg.error("rssi failed")
    }
    return res;
}


export function reboot(){
    if(isPi)
       execSync('sudo reboot')
    else
       dbg.warn("should reboot")
}


export async function  removeAllRasps(){
    const paths =[appPaths.getConf().knownDevicesFile,appPaths.getConf().groupFile]
    dbg.warn("clearing all files",paths);
    uConf.setRW(true);
    for(const p of paths){
        await fs.writeFileSync(p,'{}',{ encoding: 'utf-8' })
    }
    uConf.setRW(false);
}

export async function  removeAllAgendas(){
    const paths =fs.readdirSync(appPaths.getConf().agendasFolder).map(e=>appPaths.getConf().agendasFolder+e)
    dbg.warn("clearing all files",paths);
    uConf.setRW(true);
    for(const p of paths){
        await fs.unlinkSync(p)
    }
    uConf.setRW(false);
}


export function setFromDatestring(ds:string){
    const spl = ds.split('/')
    const day = spl[0]
    const month = spl[1]
    spl[1] = day
    spl[0] = month
    const nDs = spl.join('/');
// may Need RW Access???
    const cmd = `sudo date --set "${nDs}" && sudo hwclock -w`
    dbg.warn("will set time to",ds, cmd);
    if(!isPi){
        return;
    }
        const res = execSync(cmd).toString()
        dbg.warn(res)
        
}
