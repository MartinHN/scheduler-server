
import { startServer } from './server'
import { listenDNS,advertiseServerDNS ,PiConInfo} from './dns'
import * as crypto from 'crypto'
import {startWS} from './wsServer'
import { startSchedule} from './schedule'
import conf from './config'
import * as appPaths from './filePaths'
import fs from 'fs'
import { startEndpointServer } from './endpointServer'
import http from 'http'
import {OSCServerModule} from './lib/OSCServerModule'
import { DeviceDic, Groups } from './types/DeviceTypes'
import { postJSON } from './lib/HTTPHelpers'


export function startMainServer(serverReadyCb){
  advertiseServerDNS()
  const server = startServer(serverReadyCb)
  // to from web page
  const wsServer = startWS(server)
  // to XXXstrios
  const oscSender = new OSCServerModule(msgFromPi)
  oscSender.connect()
  
  wsServer.on("connection",(w)=>{
    wsServer.sendTo(w,{type:"connectedDeviceList",data:pis.getAvailablePis()})
  })
  
  const pis = listenDNS()
  
  pis.on("open",(pi)=>{
    console.log("newPI",pi)
    wsServer.broadcast({type:"connectedDeviceList",data:pis.getAvailablePis()})
  })
  pis.on("close",(pi)=>{
    console.log("no more pi",pi.uuid)
    wsServer.broadcast({type:"connectedDeviceList",data:pis.getAvailablePis()})
  })
  
  async function sendToPi(pi:PiConInfo,addr:string,args?:any[]){
    console.log(JSON.stringify(pi))
    const deviceURL = pi.ip;
    const devicePORT = pi.port;
    oscSender.send(addr,args,deviceURL,devicePORT)
  }
  
  wsServer.onMessage = (ws,msg)=>{
    console.log('[wsServer] Received Message: ' + JSON.stringify(msg));
    if(!msg){
      console.error("[wsServer] empty msg")
      return;
    }
    const {addr,args} = msg;
    if(addr == "deviceEvent"){
      const pi = Object.values(pis.getAvailablePis()).find(p=>p.uuid==args.uuid)
      if(!pi){console.warn('pi not found',args,JSON.stringify(pis.getAvailablePis()));return;}
      const ev = args.event;
      const pArg = ev.value!==undefined?[ev.value]:undefined;
      sendToPi(pi,"/"+ev.type,pArg)
    }
    
    else if(addr == "server"){
      if(args &&(args.type==="req")){
        if(args.value==="connectedDeviceList")
        wsServer.sendTo(ws,{type:"connectedDeviceList",data:pis.getAvailablePis()})
        else
        console.error('[wsServer] unknown msg',msg);
      }
      else
      console.error('[wsServer] unknown msg',msg);
    }
    else{
      console.error('[wsServer] unknown msg',msg);
      
    }
    
    
  }
  
  function msgFromPi(msg,time,info){
    const pi = pis.getPiForIP(info.address)
    if(pi){
      if(msg && msg.address!="/rssi")
        console.log(">>>>>>> from pi",msg )
      const toWeb = {uuid:pi.uuid,type:"resp",msg};
      wsServer.broadcast(toWeb)
    }
  }


  async function  checkEndpointAgendaIsUpToDate(p:PiConInfo){
    const appFilePaths = appPaths.getConf();
    const knownDevices = JSON.parse(fs.readFileSync(appFilePaths.knownDevicesFile).toString()) as DeviceDic
    const groups = JSON.parse(fs.readFileSync(appFilePaths.groupFile).toString()) as Groups

    const curDev = knownDevices[p.uuid]
    if(!curDev){
      console.error('no known device for pi',p.uuid)
      return;
    }

    const curGroupObj = groups[curDev.group]
    if(!curGroupObj){
      console.error('no known group for pi')
      return;
    }

    let agendaName = curGroupObj.agendaFileName
    if(!agendaName.endsWith('.json'))agendaName+='.json'
    const agendaPath = appFilePaths.agendasFolder+"/"+agendaName
    if(!fs.existsSync(agendaPath)){
      console.error('no known path for agenda')
      return;
    }
    const data = fs.readFileSync(agendaPath).toString()

    const baseEPURL = "http://"+p.ip+":"+p.port
    http.get(baseEPURL+"/agendaFile", async res=>{
       // Buffer the body entirely for processing as a whole.
        const bodyChunks = [];
        res.on('data', function(chunk) {
          // You can process streamed parts here...
          bodyChunks.push(chunk);
        }).on('end', async function() {
          const remoteData = Buffer.concat(bodyChunks).toString();
          // console.log(remoteData)
          const remoteAg = remoteData?JSON.parse(remoteData):{}; 
          const localAg = JSON.parse(data)
          if(JSON.stringify(localAg)!==JSON.stringify(remoteAg)){
            console.warn("need update",localAg,remoteAg,p.port);
             postJSON(p.ip,"/post/agendaFile",p.port,data)
          }
          else{
            // console.log(p.uuid, "agenda is uptoDate")
          }
          // ...and/or process the entire body here.
        }).on('error',()=>{
          console.error("http.con error")
        })
    }).on('error',()=>{
      console.error("http.con error")
    }) 
  }

  setInterval(()=>{
    for (const c of pis.getAvailablePis()){

      try{
      checkEndpointAgendaIsUpToDate(c)
    }catch(e){
      console.error("trying to update ep",e)
    }}
  },10000)
  
  
}
