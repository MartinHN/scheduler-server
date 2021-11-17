

////////////////////////
// SERVE
import { hostname } from 'os';
import bonjourM, { RemoteService, Service }  from 'bonjour'
import * as dbg from './dbg'
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'
import  * as endp from './endpointConfig'
import * as uConf from "./userConf"
import path from 'path'
import https from 'https'
import http from 'http'
import * as sys from './sysUtils'
import {willBeRunningForDate,getAgenda, startSchedule} from './schedule'
import * as  crypto from 'crypto';

const app = express();

const endpointDir = path.dirname(endp.conf.agendaFile)
uConf.setRW(true)
if(!fs.existsSync(endpointDir))
fs.mkdirSync(endpointDir)

if(!fs.existsSync(endp.conf.agendaFile))
fs.writeFileSync(endp.conf.agendaFile,'{}',{ encoding: 'utf-8' })
uConf.setRW(false)


/*
endpoint caps
nickName
hostname
isMainServer
reboot
on/off
MiniMadIp
MiniMadCtl
...
active dmx
active sound


*/

function restGetSet(confName:string,getF:()=>any,setF:(any)=>void,typeV:string="string"){
  app.get("/"+confName,(req,res)=>{
    res.setHeader('Content-Type', 'application/json');
    res.json({value:getF()});
  })
  app.post("/"+confName,async (req,res)=>{
    const v = req.body.value
    if((v!==undefined) || typeof(v)!==typeV){
      setF(v);
    }
    else{
      dbg.error("undefined conf var",confName,typeof(v));
    }
    res.send()
  })
}

function restGetSetConf(confName:string){
  restGetSet(confName,()=>uConf.getVariable(confName),(v)=>uConf.setVariable(confName,v));
}

app.use(cors())
app.use(express.json())



////////////////
// persistent files
app.use(express.static(endpointDir, {
  etag: false
}))


app.get('/agendaFile',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(endp.conf.agendaFile);
  readable.pipe(res);
})



app.post('/post/agendaFile',async (req,res)=>{
  await fs.writeFile(endp.conf.agendaFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})


restGetSetConf("nickName");
restGetSet("hostName",sys.getHostName,sys.setHostName);


//actions
import audioPlayer from './modules/AudioPlayer'
import relay from'./modules/Relay'


function initModules(){
  audioPlayer.init();
}
let isActive = false
function activate(active:boolean){
  isActive = active
  audioPlayer.activate(active);
  relay.activate(active)
}

import {OSCServerModule} from './lib/OSCServerModule'


/// describe basic functionality of endpoints
function handleMsg(msg,time,info: {address:string,port:number}){
  console.log("endpoint rcvd",info.address,info.port,msg.address)
  if(msg.address == "/rssi"){
    epOSC.send("/rssi",[sys.getRSSI()],info.address,info.port)
  }
  else if((msg.address == "/activate" )){
    if(msg.args.length>0)
      activate(msg.args[0]?true:false)
      else
        epOSC.send("/activate",[isActive?1:0],info.address,info.port)

    }

    else if((msg.address == "/dateShouldActivate" )){
      let dateToCheck = new Date()
      if(msg.args.length===3)
      dateToCheck = new Date(msg.args[0],msg.args[1],msg.args[2],msg.args[3],msg.args[4])
        
      const willBeRunning = willBeRunningForDate(dateToCheck)
      epOSC.send("/dateShouldActivate",[willBeRunning?1:0],info.address,info.port)
  
    }

    
    // let schema;
    // try{
    //   schema = JSON.parse(msg.args[0])
    // }
    // catch(e){
    //   console.error("schema not parsed",msg.args[0],e);
    // }
    // if(schema){
    //   this.globalEvts.emit("schema",{ep:this,schema})
    //   this.emit("schema",schema);
    // }
  // }
}

const epOSC= new OSCServerModule((msg,time,info)=>{
  handleMsg(msg,time,info)
});



// app.get("/rssi",(req,res)=>{
//   res.setHeader('Content-Type', 'application/json');
//   res.json({value:sys.getRSSI()});
// })

///////////
// Event



// app.post("/event",(req,res)=>{
//   try{
//     console.warn('new Event',req.body)
//     if(req.body.type==="activate"){
//     const active = req.body.value;

//   }

//   }
//   catch(e){
//     console.error("event error", e);
//     res.send(e);
//   }
//   res.send();
// })



///////////////////////
// Entry point



export function startEndpointServer(epConf:{endpointName?:string}){
  initModules();
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.endpointPort, () =>
  console.log(`[endpoint OSC] will listen on port ${conf.endpointPort}!`));
  epOSC.connect("0.0.0.0",conf.endpointPort)
  
  
  epOSC.udpPort.on('ready',()=>{
    // sendFirstQueries();
    console.log("[endpoint OSC] listening on",epOSC.localPort)
  })
  const bonjour = bonjourM()
  // advertise an localEndpoint server
  bonjour.publish({ name: epConf.endpointName || hostname(), type: 'rspstrio',protocol:'udp', port: conf.endpointPort,txt:{uuid:"lumestrio@"+sys.getMac()} })

  startSchedule((state)=>{
    console.log("scheduling State is",state?"on":"off")
    if(state){
      
    }
  })
  
  return server
}
