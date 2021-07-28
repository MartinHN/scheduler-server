
import { startServer } from './server'
import { listenDNS,advertiseDNS ,PiConInfo} from './dns'
import {startWS} from './wsServer'
import { startSchedule} from './schedule'
import * as uConf from './userConf'
import conf from './config'
import fs from 'fs'
import { startEndpointServer } from './endpointServer'
import http from 'http'

const isMainServer = true;//uConf.getVariable("isMainServer");


if(isMainServer){
  fs.writeFileSync(conf.connectedPiFile,'{}',{ encoding: 'utf-8' })
  
  const server = startServer()
  const wsServer = startWS(server)
  
  wsServer.on("connection",(w)=>{
    wsServer.sendTo(w,{type:"deviceList",data:pis.getAvailablePis()})
  })
  wsServer.on("message",(w)=>{
    console.log("ws message", w);
  })
  const pis = listenDNS()
  
  pis.on("open",(pi)=>{
    console.log("newPI",pi)
    wsServer.broadcast({type:"deviceList",data:pis.getAvailablePis()})
  })
  pis.on("close",(pi)=>{
    console.log("no more pi",pi)
    wsServer.broadcast({type:"deviceList",data:pis.getAvailablePis()})
  })
  
  async function sendEventToPi(pi:PiConInfo,event:any){
    console.log(JSON.stringify(pi))
    const deviceURL = pi.addresses[0];
    const devicePORT = conf.endpointPort;
    const path = "/event"
    const data = JSON.stringify(event)
    console.log('http POST',deviceURL,path,data)
    const options:http.RequestOptions = {
      hostname: deviceURL,
      port: devicePORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Content-Length': data.length
      },
    }
    
    const req = http.request(options, res => {
      console.log(`statusCode: ${res.statusMessage} : ${res.statusCode}`)
      
      res.on('data', d => {
        console.log('resp from post',d)
      })
    })
    
    req.on('error', error => {
      console.error(error)
    })
    
    req.write(data)
    req.end()
    
    // return await fetch(`http://${deviceURL}:${devicePORT}/${path}`, requestOptions)
  }
  
  wsServer.onMessage = (ws,msg)=>{
    console.log('Received Message: ' + JSON.stringify(msg));
    if(!msg){
      console.error("empty msg")
      return;
    }
    const {addr,args} = msg;
    if(addr == "deviceEvent"){
      const pi = pis.availableRPI[args.deviceName]
      if(!pi){console.warn('pi not found',Object.keys(pis.availableRPI));return;}
      sendEventToPi(pi.service,args.event)
    }
  }
  
  
}
startEndpointServer()

advertiseDNS();
startSchedule((state)=>{
  console.log("scheduling State is",state?"on":"off")
})
