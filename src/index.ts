
import { startServer } from './server'
import { listenDNS,advertiseDNS ,PiConInfo} from './dns'
import {startWS} from './wsServer'
import { startSchedule} from './schedule'
import * as uConf from './userConf'
import conf from './config'
import fs from 'fs'
import { startEndpointServer } from './endpointServer'
import http from 'http'
import {OSCServerModule} from './lib/OSCServerModule'
const isMainServer = true;//uConf.getVariable("isMainServer");


if(isMainServer){
  //
  const server = startServer()
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
    console.log("no more pi",pi)
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
      console.log(">>>>>>> from pi",pi,msg )
      const toWeb = {uuid:pi.uuid,type:"resp",msg};
      wsServer.broadcast(toWeb)
    }
  }
  
  
}
startEndpointServer()

advertiseDNS();
startSchedule((state)=>{
  console.log("scheduling State is",state?"on":"off")
  if(state){
    
  }
})
