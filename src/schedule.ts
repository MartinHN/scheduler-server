
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
let checkAgendaInt:any;

let wasActive:any

const delBeforeFirstAct = 5000;
let initScheduleTime = new Date();

const confWatcher = new ConfFileWatcher(endp.conf.agendaFile,(o)=>{
    applyNewSchedule(o)
},ScheduleTypes.createDefaultAgenda())

export async function startSchedule(cB){
    isRunning=undefined
    runCB = cB;
    initScheduleTime = new Date();
    wasActive = undefined
    if(!checkAgendaInt)
        checkAgendaInt = setInterval(()=>{checkIfShouldBeActive(true)},1000)
    
    
}

export function getAgenda(){
    return curAgenda
}
export function willBeRunningForDate(d:Date){
    if(!curAgenda){return -1}
    return  ScheduleTypes.isAgendaActiveForDate(d,curAgenda)
}

function setRunning(b:boolean,force?:boolean){
    if(wasActive!==b)
    dbg.log((b?"start":"stop") + " all services " + (force?"(forcing)":""))
    isRunning = b;
    if(runCB){
        runCB(b);
    }
}


function checkIfShouldBeActive(quiet?:boolean){
    const curDate = new Date();
    if(curDate.getTime() - initScheduleTime.getTime() < delBeforeFirstAct){
        dbg.log('skipping firsts')
        return;
    }
    if(!curAgenda){dbg.error('no agenda loaded');return -1}
    if(!quiet){
        dbg.log('checking schedule',curDate,JSON.stringify(curAgenda))
    }
    
    const shouldBeActive = ScheduleTypes.isAgendaActiveForDate(curDate,curAgenda)
    if(shouldBeActive==undefined){dbg.error("what do we do?? nothing"); return;}
    if(shouldBeActive!==wasActive){
        setRunning(shouldBeActive)
        wasActive = shouldBeActive
    }
    
}

export function getAgendaShouldActivate(){
    return wasActive;
}

function applyNewSchedule(o:Agenda){
    curAgenda = o;
    wasActive = undefined;
    checkIfShouldBeActive();
}
