
import fs from 'fs'
import conf from './config'
import * as dbg from './dbg'

let scheduleZones:any = {default:{}}
let isRunning = false;
let runCB = undefined

export function startSchedule(cB){
    isRunning=undefined
    runCB = cB;
    reloadFile('init');
    fs.watch(conf.filePath, { encoding: 'utf-8' }, reloadFile);

}

function setRunning(b:boolean,force?:boolean){
    console.log((b?"start":"stop") + " all services " + (force?"(forcing)":""))
    isRunning = b;
    if(runCB){
        runCB(b);
    }
}

function getZoneForDate(d:Date){
    for(const [k,v] of Object.entries(scheduleZones)){
        if(k==="default") continue
        const dates = (v as any).dates ;
        const {start,end} = dates
        if(!start || !end){dbg.error("no date"); continue;}
        if(d>=start &&  d < end ){
            return v;
        }
    }
    return scheduleZones.default
}

const days=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]


function getHourRangeFromZone(z:any,d:Date){
    const wh = z && z.weekHours
    if(!wh)return undefined;
    const day = (d.getDay()+6)%7
    const dayName = days[day];
    const dob = wh[dayName] || wh.default;
    console.log('dayname',dayName,dob)
    if( dob ){
        if( dob.type=="custom" ){
            return dob.hourRange
        }
        if(dob.type=="no"){
            return null
        }
    }
    dbg.error("wtf")
}


function mustBeActiveForHourRange(hR,d:Date){ 
    if(hR == null){return false}
    let{start,end} = hR
    if(start && end){
        console.log(start,end)
    }
    dbg.error('no hours given')
    return undefined 
}


function checkIfShouldBeActive(){
    const curDate = new Date();
    if(!scheduleZones){return -1}
    console.log('applying schedule')
    
    const z = getZoneForDate(curDate);
    console.log('got zone',z);
    const hR = getHourRangeFromZone(z,curDate)
    console.log('got hours',hR);
    const shouldBeActive = mustBeActiveForHourRange(hR,curDate)
    if(shouldBeActive==undefined){dbg.error("what do we do?? nothing"); return;}
    setRunning(shouldBeActive)
    
}


function applyNewSchedule(o:any){
    if(o.zones)scheduleZones = o.zones;
    checkIfShouldBeActive();
}

async function reloadFile(hint?:string){
    
    console.log(hint || 'watch' , 'load json file');
    fs.readFile(conf.filePath,(err,data)=>{
        if(err) throw err
        const json = JSON.parse(data.toString())
        applyNewSchedule(json);
    })
    
}
