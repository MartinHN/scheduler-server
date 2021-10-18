
import fs from 'fs'
import conf from './config'
import  * as endp from './endpointConfig'
import * as dbg from './dbg'

import * as ScheduleTypes from './types/ScheduleTypes'
import {Agenda} from './types/ScheduleTypes'

let curAgenda:Agenda = ScheduleTypes.createDefaultAgenda()
let isRunning = false;
let runCB = undefined

export async function startSchedule(cB){
    isRunning=undefined
    runCB = cB;
    if(!fs.existsSync(endp.conf.agendaFile)){
        console.warn("generating default agenda")
        fs.writeFileSync(endp.conf.agendaFile,JSON.stringify(ScheduleTypes.createDefaultAgenda()),{ encoding: 'utf-8' })
    }
    reloadFile('init')
    fs.watch(endp.conf.agendaFile, { encoding: 'utf-8' }, reloadFile);

}

export function getAgenda(){
    return curAgenda
}
export function willBeRunningForDate(d:Date){
    if(!curAgenda){return -1}
    return  ScheduleTypes.isAgendaActiveForDate(d,curAgenda)
}

function setRunning(b:boolean,force?:boolean){
    console.log((b?"start":"stop") + " all services " + (force?"(forcing)":""))
    isRunning = b;
    if(runCB){
        runCB(b);
    }
}


function checkIfShouldBeActive(){
    const curDate = new Date();
    if(!curAgenda){console.error('no agenda loaded');return -1}
    console.log('applying schedule',curDate,curAgenda)
    const shouldBeActive = ScheduleTypes.isAgendaActiveForDate(curDate,curAgenda)
    if(shouldBeActive==undefined){dbg.error("what do we do?? nothing"); return;}
    setRunning(shouldBeActive)
    
}


function applyNewSchedule(o:Agenda){
    curAgenda = o;
    checkIfShouldBeActive();
}

 function reloadFile(hint?:string){
    
    console.log(hint || 'watch' , 'load json file');
    fs.readFile(endp.conf.agendaFile,(err,data)=>{
        if(err) throw err
        try{
            console.log('loading current agenda')
            const json = JSON.parse(data.toString())
            applyNewSchedule(json);
        }
        catch (e){
            console.error("corrupted file erasing",e)
            fs.writeFileSync(endp.conf.agendaFile,JSON.stringify(ScheduleTypes.createDefaultAgenda()),{ encoding: 'utf-8' })
            reloadFile('default');
            
        }
    })
    
}
