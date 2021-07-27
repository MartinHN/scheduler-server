import fs from 'fs'
import { execSync, execFileSync } from "child_process"
import { getConfigFileParsingDiagnostics } from 'typescript';
import * as dbg from './dbg'

export function getHostName(){
    return fs.readFileSync("/etc/hostname").toString().trim();  
}


export function setHostName(newhost:string){
    const hostn = getHostName();
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hosts`);
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hostname`);
}


export function getRSSI(){
    let res = 0
    try{ 
    res=parseInt( execSync('iwlist wlan0 scanning | grep  -Eo "....dBm"').toString());
    }
    catch(e){
        dbg.error("rssi failed")
    }
    console.log('willRet')
    return res;
}


export function reboot(){
    execSync('sudo reboot')
}
