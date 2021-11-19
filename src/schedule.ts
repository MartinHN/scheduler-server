
import fs from 'fs'
import conf from './config'
import  * as endp from './endpointConfig'
import * as dbg from './dbg'

import * as ScheduleTypes from './types/ScheduleTypes'
import {Agenda} from './types/ScheduleTypes'
import ConfFileWatcher from './ConfFileWatcher'

let curAgenda:Agenda = ScheduleTypes.createDefaultAgenda()
let isRunning = false;
let runCB = undefined

const confWatcher = new ConfFileWatcher(endp.conf.agendaFile,(o)=>{
    applyNewSchedule(o)
},ScheduleTypes.createDefaultAgenda())

export async function startSchedule(cB){
    isRunning=undefined
    runCB = cB;


}

export function getAgenda(){
    return curAgenda
}
export function willBeRunningForDate(d:Date){
    if(!curAgenda){return -1}
    return  ScheduleTypes.isAgendaActiveForDate(d,curAgenda)
}

function setRunning(b:boolean,force?:boolean){
    dbg.log((b?"start":"stop") + " all services " + (force?"(forcing)":""))
    isRunning = b;
    if(runCB){
        runCB(b);
    }
}


function checkIfShouldBeActive(){
    const curDate = new Date();
    if(!curAgenda){dbg.error('no agenda loaded');return -1}
    dbg.log('applying schedule',curDate,JSON.stringify(curAgenda))
    const shouldBeActive = ScheduleTypes.isAgendaActiveForDate(curDate,curAgenda)
    if(shouldBeActive==undefined){dbg.error("what do we do?? nothing"); return;}
    setRunning(shouldBeActive)
    
}


function applyNewSchedule(o:Agenda){
    curAgenda = o;
    checkIfShouldBeActive();
}
