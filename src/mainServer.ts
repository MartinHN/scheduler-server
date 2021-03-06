import { startServer } from './server'
import { listenDNS,advertiseServerDNS ,PiConInfo,setDNSActive} from './dns'
import {startWS} from './wsServer'
import * as appPaths from './filePaths'
import fs from 'fs'
import http from 'http'
import {OSCServerModule} from './lib/OSCServerModule'
import { DeviceDic, Groups, newEmptyDevice } from './types/DeviceTypes'
import { postJSON } from './lib/HTTPHelpers'
import * as dbg from './dbg'
import jdiff from 'json-diff';
import chokidar from 'chokidar';
import _ from 'lodash'


let isInaugurationMode = false;

let isAgendaDisabled = false;


export function startMainServer(serverReadyCb){
  advertiseServerDNS()
  const server = startServer(serverReadyCb)
  // to from web page
  const wsServer = startWS(server)
  // to XXXstrios
  const oscSender = new OSCServerModule(msgFromPi)
  oscSender.connect("0.0.0.0",0)
  
  wsServer.on("connection",(w)=>{
    wsServer.sendTo(w,{type:"connectedDeviceList",data:pis.getAvailablePis()})
  })
  
  const pis = listenDNS()
  
  function updateKnownPi(pi:PiConInfo){
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {} ) as DeviceDic
    const knownPi = knownDevices[pi.uuid];
    if(!knownPi){dbg.log("pi known up to date");return;}
    const props = ['ip','port','caps','deviceName']
    let change = false;
    props.map(p=>{if(jdiff.diff(knownPi[p],pi[p])){
      knownPi[p] = pi[p]
      change = true;
      dbg.warn("known changed prop :",p ,jdiff.diffString(knownPi[p],pi[p]) )
    }})
    if(change){
      appPaths.writeFileObj(appFilePaths.knownDevicesFile,knownDevices)
    }
  }
  pis.on("open", async  (piUuid) => {
    dbg.log("newPI",piUuid)
    const pi  = pis.getPiForUUID(piUuid)
    if(pi){
      updateKnownPi(pi)
    }
    sendToPi(pi,"/activate",[])
    
    
    wsServer.broadcast({type:"connectedDeviceList",data:pis.getAvailablePis()})
    await checkEndpointUpToDate(pi);
    
    
  })
  pis.on("close",(pi)=>{
    dbg.log("no more pi",pi.uuid)
    wsServer.broadcast({type:"connectedDeviceList",data:pis.getAvailablePis()})
  })
  
  async function sendToPi(pi:PiConInfo,addr:string,args?:any[]){
    const deviceURL = pi.ip;
    const devicePORT = pi.port;
    if(addr !== "/rssi"){dbg.log("send event to pi:",pi.ip,pi.port,addr)}
    oscSender.send(addr,args,deviceURL,devicePORT)
  }
  
  wsServer.onMessage = (ws,msg)=>{
    if(!msg){
      dbg.error("[wsServer] empty msg")
      return;
    }
    const {addr,args} = msg;
    if(!(addr==="deviceEvent" && args.event && args.event.type === "rssi")){
      dbg.log('[wsServer] Received Message: '+addr + JSON.stringify(msg));
    }
    if(addr == "deviceEvent"){
      let pi = Object.values(pis.getAvailablePis()).find(p=>p.uuid==args.uuid)
      if(!pi){
      const knownDevices = (appPaths.getFileObj(appPaths.getConf().knownDevicesFile) || {} ) as DeviceDic
      const knownPi = knownDevices[args.uuid];
      if(knownPi===undefined){
        dbg.error("what pi are we talking about?");
        return;
      }
      pi = knownPi;
      dbg.warn('pi not found',args?.uuid,"using registred on ilast known ip",pi.ip);
      dbg.log("connected : ",Object.values(pis.getAvailablePis()).map(e=>e.uuid))
      
      }

      const ev = args.event;
      const pArg = ev.value!==undefined?[ev.value]:undefined;
      // dbg.log('sending to pi',ev.type,pi)
      sendToPi(pi,"/"+ev.type,pArg)
    }
    
    else if(addr == "server"){
      if(args &&(args.type==="req")){
        if(args.value==="connectedDeviceList")
        wsServer.sendTo(ws,{type:"connectedDeviceList",data:pis.getAvailablePis()})
        else if(args.value==="isInaugurationMode"){
          wsServer.sendTo(ws,{type:"isInaugurationMode",data:isInaugurationMode})
        }
        else if(args.value==="isAgendaDisabled"){
          wsServer.sendTo(ws,{type:"isAgendaDisabled",data:isAgendaDisabled})
        }
        else
        dbg.error('[wsServer] unknown msg',msg);
      }
      else if(args.type==="isInaugurationMode"){
        setInaugurationMode(!!args.value)
      }
      else if(args.type==="isAgendaDisabled"){
        isAgendaDisabled = !!args.value
        checkAgendaDisabledOnPis();
        
      }
      else if(args.type==="isDNSActive"){
        dbg.log("activating DNS : ",!!args.value)
        setDNSActive(!!args.value)
      }
      
    }
    else{
      dbg.error('[wsServer] unknown msg',msg);
      
    }
    
    
  }
  
  function msgFromPi(msg,time,info){
    const pi = pis.getPiForIP(info.address)
    if(pi){
      if(msg){
        if( msg.address!="/rssi"){
          dbg.log(">>>>>>> from pi",msg )
        }
        const toWeb = {uuid:pi.uuid,type:"resp",msg};
        wsServer.broadcast(toWeb)
      }
    }
    else{
      dbg.error("msg from unknown pi", info.address)
    }
  }
  
  async function checkRemoteResource(p:PiConInfo,addr:string,tgtObj:any){
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {} ) as DeviceDic
    
    const curDev = knownDevices[p.uuid]
    if(!curDev){
      dbg.error('[app] checkRemoteResource no known device for pi',p.uuid || p)
      return false;
    }
    
    const baseEPURL = "http://"+p.ip+":"+p.port
    return new Promise((resolve,reject)=>{
      http.get(baseEPURL+addr, async res=>{
        // Buffer the body entirely for processing as a whole.
        const bodyChunks = [];
        res.on('data', function(chunk) {
          // You can process streamed parts here...
          bodyChunks.push(chunk);
        }).on('end', async function() {
          const remoteData = Buffer.concat(bodyChunks).toString();
          // dbg.log(remoteData)
          const remoteInfo = remoteData?JSON.parse(remoteData):{}; 
          
          if(JSON.stringify(tgtObj)!==JSON.stringify(remoteInfo)){
            dbg.warn("need update  "+addr,jdiff.diffString(remoteInfo,tgtObj));
            postJSON(p.ip,"/post"+addr,p.port,tgtObj)
            resolve(false);
          }
          else{
            dbg.log(p.uuid, "res "+addr+" is uptoDate")
            resolve(true);
          }
          // ...and/or process the entire body here.
        }).on('error',(e)=>{
          dbg.error("http.con dl error")
          reject(e)
        })
      }).on('error',(e)=>{
        dbg.error("http.con error")
        reject(e)
      })  
    })
  }
  
  
  async function  checkEndpointAgendaIsUpToDate(p:PiConInfo){
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {} ) as DeviceDic
    const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {} )as Groups
    const curDev = knownDevices[p.uuid]
    if(!curDev){
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known device for pi',p.uuid || p)
      return;
    }
    
    const curGroupObj = groups[curDev.group]
    if(!curGroupObj){
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known group for pi ignore checking agenda')
      return;
    }
    
    let agendaName = curGroupObj.agendaFileName
    if(!agendaName.endsWith('.json'))agendaName+='.json'
    const agendaPath = appFilePaths.agendasFolder+"/"+agendaName
    if(!fs.existsSync(agendaPath)){
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known path for agenda')
      return false;
    }
    const data = fs.readFileSync(agendaPath).toString()
    return await checkRemoteResource(p,"/agendaFile",JSON.parse(data));
    
  }
  
  
  // async function  checkEndpointInfoIsUpToDate(p:PiConInfo){
  //   const appFilePaths = appPaths.getConf();
  //   const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {} ) as DeviceDic
  //   const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {} )as Groups
  
  //   const curDev = knownDevices[p.uuid]
  //   if(!curDev){
  //     dbg.error('no known device for pi',p.uuid || p)
  //     return false;
  //   }
  
  
  //   return await checkRemoteResource(p,"/info",{niceName:curDev.niceName});
  
  // }
  

  async function checkAgendaDisabledOnPi(p:PiConInfo){
    sendToPi(p,"/isAgendaDisabled",[isAgendaDisabled?1:0]);
  }

  async function checkAgendaDisabledOnPis(){
    for (const c of pis.getAvailablePis()){
      try{
        checkAgendaDisabledOnPi(c)
      }catch(e){
        dbg.error("trying to update agenda disabled",e)
      }
    }
  }

  async function checkEndpointUpToDate(pi:PiConInfo){
    
    const agOk=  !! (await checkEndpointAgendaIsUpToDate(pi));
    const infoOk=  true;//!! (await checkEndpointInfoIsUpToDate(p));
    checkAgendaDisabledOnPi(pi);
    
    const isUpToDate = agOk && infoOk
    if(isUpToDate){
      dbg.log("endpoint already up to date",pi.deviceName,pi.uuid)
    }
    else{
      dbg.warn("endpoint has been updated",pi.deviceName,pi.uuid)
    }
    return isUpToDate;
  }
  
  async function checkAllEndpoints(){
    
    if(!fs.existsSync(appPaths.getConf().knownDevicesFile)){
      dbg.warn('no file ')
      return
    }
    const curDev = appPaths.getFileObj(appPaths.getConf().knownDevicesFile);
    if(!curDev){
      dbg.warn('infalid file ')
      return
    }
    dbg.log('>>>> checking all up to date')
    for (const c of pis.getAvailablePis()){
      try{
        await checkEndpointUpToDate(c)
      }catch(e){
        dbg.error("trying to update ep",e)
      }
    }
    dbg.log('>>>> All checked all up to date')
  }
  const checkAllEndpointsDbnc = _.debounce(checkAllEndpoints, 2000, {})
  var watcher = chokidar.watch(appPaths.getConf().baseDir, {ignored: /^\./, persistent: true});
  watcher.on("change",(e)=>{dbg.log("chg",e); checkAllEndpointsDbnc()});
  watcher.on("add", checkAllEndpointsDbnc);
  watcher.on("unlink", checkAllEndpointsDbnc);
  watcher.on("error", e=>dbg.error("watch error",e));
  
  
  function setInaugurationMode(b:boolean){
    isInaugurationMode = b
    if(!isAgendaDisabled)
      {isAgendaDisabled = true;
      checkAgendaDisabledOnPis();
    dbg.error("force disabling agenda ")}
    dbg.warn('inauguration set to ' + isInaugurationMode?'on':'off');
    for (const p of pis.getAvailablePis()){
      try{
        sendToPi(p,"/activate",[isInaugurationMode?1:0])
        // checkEndpointUpToDate(c)
      }catch(e){
        dbg.error("trying to update ep",e)
      }
    }
  }
  
  
}
