
import fs from 'fs'
import conf from './config'
import * as dbg from './dbg'

let scheduleAgendas:any = {default:{}}
let isRunning = false;
let runCB = undefined

export async function startSchedule(cB){
    isRunning=undefined
    runCB = cB;
    if(!fs.existsSync(conf.agendaFile))
        fs.writeFileSync(conf.agendaFile,'{}',{ encoding: 'utf-8' })
    reloadFile('init')
    fs.watch(conf.agendaFile, { encoding: 'utf-8' }, reloadFile);

}

function setRunning(b:boolean,force?:boolean){
    console.log((b?"start":"stop") + " all services " + (force?"(forcing)":""))
    isRunning = b;
    if(runCB){
        runCB(b);
    }
}

function getExceptionZoneForDate(d:Date){
    for(const [k,v] of Object.entries(scheduleAgendas)){
        if(k==="default") continue
        const dates = (v as any).dates ;
        const {start,end} = dates
        if(!start || !end){dbg.error("no date"); continue;}
        if(d>=start &&  d < end ){
            return v;
        }
    }
    return scheduleAgendas.default
}

const days=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]


function getHourRangeFromExceptionZone(z:any,d:Date){
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
    if(!scheduleAgendas){return -1}
    console.log('applying schedule')
    
    const z = getExceptionZoneForDate(curDate);
    console.log('got agenda',z);
    const hR = getHourRangeFromExceptionZone(z,curDate)
    console.log('got hours',hR);
    const shouldBeActive = mustBeActiveForHourRange(hR,curDate)
    if(shouldBeActive==undefined){dbg.error("what do we do?? nothing"); return;}
    setRunning(shouldBeActive)
    
}


function applyNewSchedule(o:any){
    if(o.agendas)scheduleAgendas = o.agendas;
    checkIfShouldBeActive();
}

 function reloadFile(hint?:string){
    
    console.log(hint || 'watch' , 'load json file');
    fs.readFile(conf.agendaFile,(err,data)=>{
        if(err) throw err
        try{
            console.log('loading current agenda')
            const json = JSON.parse(data.toString())
            applyNewSchedule(json);
        }
        catch{
            console.error("corrupted file")
            fs.writeFileSync(conf.agendaFile,'{}',{ encoding: 'utf-8' })
            reloadFile('default');
            
        }
    })
    
}
