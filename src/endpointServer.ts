

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


const app = express();

const endpointDir = path.dirname(endp.epBasePath)
uConf.setRW(true)
if(!fs.existsSync(endpointDir))
fs.mkdirSync(endpointDir)

if(!fs.existsSync(endp.conf.agendaFile))
fs.writeFileSync(endp.conf.agendaFile,'{}',{ encoding: 'utf-8' })
if(!fs.existsSync(endp.conf.infoFile))
fs.writeFileSync(endp.conf.infoFile,'{}',{ encoding: 'utf-8' })


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

app.use(function(req, res, next){
  if (req.is('text/*')) {
    req.body = '';
    req.setEncoding('utf8');
    req.on('data', function(chunk){ req.body += chunk });
    req.on('end', next);
  } else {
    next();
  }
});



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
  uConf.setRW(true)
  await fs.writeFile(endp.conf.agendaFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    dbg.log('The agenda file has been saved!',endp.conf.agendaFile,req.body);
  })
  res.send()
  uConf.setRW(false)
})


// app.get('/info',(req,res)=>{
//   res.setHeader('Content-Type', 'application/json');
//   var readable = fs.createReadStream(endp.conf.infoFile);
//   const data =fs.readFileSync(endp.conf.infoFile).toString()
//   dbg.log("getting info",data)
//   readable.pipe(res);
// })





// app.post('/post/info',async (req,res)=>{
//   uConf.setRW(true)
//   await fs.writeFile(endp.conf.infoFile, JSON.stringify(req.body,null,2), (err) => {
//     if (err) throw err;
//     dbg.log('The info file has been saved!',req.body);
//   })
//   res.send()
//   uConf.setRW(false)
// })

app.get('/time',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  const to = {localTime:Date().toString(),utcTime:new Date().toUTCString()}
  dbg.log("getting time",to)
  res.send(to);
})

// restGetSetConf("nickName");
// restGetSet("hostName",sys.getHostName,(n)=>{
//   uConf.setRW(true)
//   sys.setHostName(n);
//   uConf.setRW(false)
// });


//actions
import audioPlayer from './modules/AudioPlayer'
import relay from'./modules/Relay'
import OSCSenderModule from './modules/OSCSenderModule'
import vermuthModule from './modules/VermuthModule'


function registerConfFile(app,capName:string,capFile:string){
  app.post('/post/cap/'+capName,async (req,res)=>{
    uConf.setRW(true)
    await fs.writeFile(capFile, JSON.stringify(req.body,null,2), (err) => {
      if (err) throw err;
      dbg.log('The cap conf has been saved!',capName,req.body);
    })
    res.send()
    uConf.setRW(false)
  })
  app.get('/cap/'+capName,(req,res)=>{
    res.setHeader('Content-Type', 'application/json');
    var readable = fs.createReadStream(capFile);
    // const data =fs.readFileSync(capFile).toString()
    dbg.log("getting cap conf",capName)
    readable.pipe(res);
  })
  
}

const oscModule = new OSCSenderModule(endp.epBasePath+"/osc.json");
registerConfFile(app,"osc1",oscModule.confFile);

const oscModule2 = new OSCSenderModule(endp.epBasePath+"/osc2.json");
registerConfFile(app,"osc2",oscModule2.confFile);


function initModules(){
  audioPlayer.init();
  vermuthModule.init()
}
let isActive = false
function activate(active:boolean){
  isActive = active
  audioPlayer.activate(active);
  relay.activate(active)
  oscModule.activate(active);
  oscModule2.activate(active);
  vermuthModule.activate(active);
}



/// osc
import {OSCServerModule} from './lib/OSCServerModule'
import ConfFileWatcher from './ConfFileWatcher';


/// describe basic functionality of endpoints
function handleMsg(msg,time,info: {address:string,port:number}){
  if(msg.address !== "/rssi")dbg.log("endpoint rcvd",info.address,info.port,msg.address)
  if(msg.address === "/rssi"){
    epOSC.send("/rssi",[sys.getRSSI()],info.address,info.port)
  }
  else if((msg.address === "/activate" )){
    if(msg.args.length>0)
      activate(msg.args[0]?true:false)
    else
        epOSC.send("/activate",[isActive?1:0],info.address,info.port)

  }

  else if((msg.address === "/dateShouldActivate" )){
    let dateToCheck = new Date()
    if(msg.args.length===3)
    dateToCheck = new Date(msg.args[0],msg.args[1],msg.args[2],msg.args[3],msg.args[4])
      
    const willBeRunning = willBeRunningForDate(dateToCheck)
    epOSC.send("/dateShouldActivate",[willBeRunning?1:0],info.address,info.port)

  }
  else if(msg.address === "/hostName"){
    if(msg.args.length === 1){
      const n = msg.args[0]
      uConf.setRW(true)
        sys.setHostName(n);
        uConf.setRW(false)
    }
    else{
      dbg.error("wrong args num for hostname")
    }
  }

  else if(msg.address === "/reboot"){
     sys.reboot();
  }
    
    // let schema;
    // try{
    //   schema = JSON.parse(msg.args[0])
    // }
    // catch(e){
    //   dbg.error("schema not parsed",msg.args[0],e);
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
//     dbg.warn('new Event',req.body)
//     if(req.body.type==="activate"){
//     const active = req.body.value;

//   }

//   }
//   catch(e){
//     dbg.error("event error", e);
//     res.send(e);
//   }
//   res.send();
// })



///////////////////////
// Entry point



export function startEndpointServer(epConf:{endpointName?:string,endpointPort?:number}){
  const hasCustomPort= !!epConf.endpointPort;
  const epPort = hasCustomPort?epConf.endpointPort : conf.endpointPort;
  initModules();
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(epPort, () =>
  dbg.log(`[endpoint OSC] will listen on port ${epPort}!`));
  epOSC.connect("0.0.0.0",epPort)
  
  
  epOSC.udpPort.on('ready',()=>{
    // sendFirstQueries();
    dbg.log("[endpoint OSC] listening on",epOSC.localPort)
  })
  const bonjour = bonjourM()
  // advertise an localEndpoint server
  bonjour.publish({ name: epConf.endpointName || hostname(), type: 'rspstrio',protocol:'udp', port: epPort,txt:{uuid:"lumestrio@"+sys.getMac()+(hasCustomPort?''+epPort:''),caps:"osc1=osc,osc2=osc,audio=html:8000,vermuth=html:3005"} })

  startSchedule((state)=>{
    dbg.log(">>>>> scheduling State is",state?"on":"off")
    activate(!!state)
    
  })
  
  return server
}
