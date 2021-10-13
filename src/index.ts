
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
  wsServer.on("message",(w)=>{
    console.log("ws message", w);
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
    console.log('Received Message: ' + JSON.stringify(msg));
    if(!msg){
      console.error("empty msg")
      return;
    }
    const {addr,args} = msg;
    if(addr == "deviceEvent"){
      const pi = Object.values(pis.getAvailablePis()).find(p=>p.deviceName==args.deviceName)
      if(!pi){console.warn('pi not found',JSON.stringify(pis.getAvailablePis()));return;}
      const ev = args.event;
      const pArg = ev.value!==undefined?[ev.value]:undefined;
      sendToPi(pi,"/"+ev.type,pArg)
    }



  }

  function msgFromPi(msg,time,info){
    const pi = pis.getPiForIP(info.address)
    if(pi){
      console.log(">>>>>>> from pi",pi,msg )
      const toWeb = {deviceName:pi.deviceName,type:"resp",msg};
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
