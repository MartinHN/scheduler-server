

////////////////////////
// SERVE
import { hostname } from 'os';
import { execSync } from 'child_process';
import bonjourM, { RemoteService, Service } from 'bonjour'
import * as dbg from './dbg'
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'
import * as endp from './endpointConfig'
import * as uConf from "./userConf"
import path from 'path'
import https from 'https'
import http from 'http'
import * as sys from './sysUtils'
import { willBeRunningForDate, getAgenda, startSchedule, getAgendaShouldActivate } from './schedule'
import { Looper } from './lib/Looper'

import { isPi, isOSX, isAndroid } from './platformUtil'
import { getIpOfInterface } from './lib/networkUtils'
import { createHash } from 'crypto'


// this is the interface name of desired multicast of service (more stable if specified and multiple interfaces are present)
const targetIf = (isPi || isAndroid) ? "wlan0" : (isOSX ? "en0" : "wlp0s20f3") //wlp0s20f3


const app = express();

const endpointDir = path.dirname(endp.epBasePath)
uConf.setRW(true)
if (!fs.existsSync(endpointDir))
  fs.mkdirSync(endpointDir)

if (!fs.existsSync(endp.conf.agendaFile))
  fs.writeFileSync(endp.conf.agendaFile, '{}', { encoding: 'utf-8' })
if (!fs.existsSync(endp.conf.infoFile))
  fs.writeFileSync(endp.conf.infoFile, '{}', { encoding: 'utf-8' })


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

function restGetSet(confName: string, getF: () => any, setF: (any) => void, typeV: string = "string") {
  app.get("/" + confName, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({ value: getF() });
  })
  app.post("/" + confName, async (req, res) => {
    const v = req.body.value
    if ((v !== undefined) || typeof (v) !== typeV) {
      setF(v);
    }
    else {
      dbg.error("undefined conf var", confName, typeof (v));
    }
    res.send()
  })
}

function restGetSetConf(confName: string) {
  restGetSet(confName, () => uConf.getVariable(confName), (v) => uConf.setVariable(confName, v));
}

app.use(cors())
app.use(express.json())

app.use(function (req, res, next) {
  if (req.is('text/*')) {
    req.body = '';
    req.setEncoding('utf8');
    req.on('data', function (chunk) { req.body += chunk });
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


app.get('/agendaFile', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(endp.conf.agendaFile);
  readable.pipe(res);
})

app.get('/agendaFile.md5', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  try {
    var content = fs.readFileSync(endp.conf.agendaFile).toString();
    const minObj = JSON.stringify(JSON.parse(content), null, 0)
    let hash = createHash('md5').update(minObj).digest("hex")
    res.send(hash);
  }
  catch {
    res.send("error");
  }
})



app.post('/post/agendaFile', async (req, res) => {
  uConf.setRW(true)
  await fs.writeFile(endp.conf.agendaFile, JSON.stringify(req.body, null, 0), (err) => {
    if (err) throw err;
    dbg.log('The agenda file has been saved!', endp.conf.agendaFile, req.body);
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

app.get('/status', (req, res) => {
  const st = execSync('/bin/bash /home/pi/raspestrio/checkService.sh').toString()
  console.log(st);
  // res.setHeader('Content-Type', 'application/json')
  res.send('<pre>' + st + '</pre>');
})

app.get('/time', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const to = { localTime: Date().toString(), utcTime: new Date().toUTCString() }
  dbg.log("getting time", to)
  res.send(to);
})


app.get('/rssi', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  const to = "" + sys.getRSSI();
  dbg.log("getting rssi", to)
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
let relay
if (isPi) {
  // const mod = await import('./modules/GroveRelay')
  // relay = mod.default
  const mod = await import('./modules/Relay')
  relay = mod.default

}
import OSCSenderModule from './modules/OSCSenderModule'
import vermuthModule from './modules/VermuthModule'


function registerConfFile(app, capName: string, capFile: string) {
  app.post('/post/cap/' + capName, async (req, res) => {
    uConf.setRW(true)
    await fs.writeFile(capFile, JSON.stringify(req.body, null, 2), (err) => {
      if (err) throw err;
      dbg.log('The cap conf has been saved!', capName, req.body);
    })
    res.send()
    uConf.setRW(false)
  })
  app.get('/cap/' + capName, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    var readable = fs.createReadStream(capFile);
    // const data =fs.readFileSync(capFile).toString()
    dbg.log("getting cap conf", capName)
    readable.pipe(res);
  })

}

const oscModule = new OSCSenderModule(endp.epBasePath + "/osc.json");
registerConfFile(app, "osc1", oscModule.confFile);

const oscModule2 = new OSCSenderModule(endp.epBasePath + "/osc2.json");
registerConfFile(app, "osc2", oscModule2.confFile);


function initModules() {
  audioPlayer.init();
  vermuthModule.init()
}
let isActive = false

const looperEnabled = false
let looper = new Looper()
if (looperEnabled) {
  looper.onLoopBegin = () => {
    sendStartOrStopMessage(true, true)
  }
}

function sendStartOrStopMessage(active, playOnce = false) {
  if (looperEnabled && playOnce && active) {
    audioPlayer.playOnce()
  }
  else
    audioPlayer.activate(active);
  if (isPi) {
    relay.activate(active)
  }
  oscModule.activate(active);
  oscModule2.activate(active);
  vermuthModule.activate(active);
}


function activate(active: boolean, forceNow = false) {

  isActive = active
  if (looperEnabled && (looper.loopTimeMs > 0)) {
    looper.setIsPlaying(isActive, isActive && forceNow);
    if (!isActive) { sendStartOrStopMessage(false) }
  }
  else {
    sendStartOrStopMessage(isActive)
  }
}

function doActivateAutoLoop(shouldActivate) {
  const now = new Date().getTime();
  const isRedundant = (shouldActivate == isActive) || (Math.abs(now - lastActivateMsgTime) < 1000)
  if (shouldActivate == isActive) lastActivateMsgTime = now
  else lastActivateMsgTime = -1
  if (!isRedundant)
    activate(shouldActivate, true)
}

function doSetAgendaDisabled(a) {
  isAgendaDisabled = a !== "0" && !!a
  console.log("isAgendaDisabled = ", isAgendaDisabled)
  if (!isAgendaDisabled) {
    const shouldAct = !!getAgendaShouldActivate();
    if (shouldAct !== isActive) {
      // mimic exact same timing than when agenda started normaly
      adaptLooperStateFromAgendaEvent();
      looper.offsetWithGlobalTimeMs = 0;
      activate(shouldAct, false)
    }
  }
}
// lora

LoraModule.getActiveState = () => {
  return isActive
}

LoraModule.getAgendaMD5 = () => {
  try {
    var content = fs.readFileSync(endp.conf.agendaFile).toString();
    const minObj = JSON.stringify(JSON.parse(content), null, 0)
    return createHash('md5').update(minObj).digest("hex")
  }
  catch (e) {
    dbg.error("can not get agenda md5", e)
  }
  return ""
}
if (!LoraModule.isServer) { LoraModule.getAgendaDisabled = () => { return isAgendaDisabled; } }

LoraModule.onActivate.push((b: boolean) => {
  dbg.log("enpoint got lora activate message ", b ? "1" : "0")
  doActivateAutoLoop(b);
})

LoraModule.onDisableAgenda.push((b: boolean) => {
  dbg.log("enpoint got disable agenda ", b ? "1" : "0")
  doSetAgendaDisabled(b);
})

LoraModule.onNewFile.push(async (data: string) => {
  dbg.log("enpoint got lora new file ")
  uConf.setRW(true)
  try {
    await fs.writeFile(endp.conf.agendaFile, data, (err) => {
      if (err) throw err;
      dbg.log('The agenda file has been saved!', endp.conf.agendaFile, data);
    })
  }
  catch (e) {
    dbg.error("can't parse lora file ", e)
  }
  uConf.setRW(false)
})


/// gpio button play disable for now

// import GpioM from 'pigpio'
// if (isPi) {
//   const Gpio = GpioM.Gpio;
//   const pinNums = [12] //== 32 // relay uses [14, 15]
//   let gpioB = [];
//   const debounceTimeMs = 100;

//   let timeUp = 0;

//   pinNums.forEach(n => {
//     const btn = new Gpio(n, {
//       mode: Gpio.INPUT,
//       pullUpDown: Gpio.PUD_UP, // other end need to be connected to gnd
//       alert: true
//     });
//     // Level must be stable for 10 ms before an alert event is emitted.
//     btn.glitchFilter(debounceTimeMs * 1000);

//     btn.on('alert', (level, tick) => {
//       dbg.log("new button state :", level)
//       if (level === 0) {
//         audioPlayer.playOnce();
//       }
//     });
//     gpioB.push(btn);

//   })



// }




/// osc
import { OSCServerModule } from './lib/OSCServerModule'
import ConfFileWatcher from './ConfFileWatcher';
import { debug } from 'console';
import { getActiveDayForDateInAgenda, hourMinutesToString, hourStringToMinutes } from './types/ScheduleTypes';
import LoraModule from './modules/LoraModule';



let lastActivateMsgTime = 0
/// describe basic functionality of endpoints
function handleMsg(msg, time, info: { address: string, port: number }) {
  if (msg.address !== "/rssi") dbg.log("endpoint rcvd", info.address, info.port, msg.address)
  if (msg.address === "/rssi") {
    epOSC.send("/rssi", [sys.getRSSI()], info.address, info.port)
  }
  else if ((msg.address === "/activate")) {
    if (msg.args.length > 0) {
      const now = new Date().getTime();
      const shouldActivate = msg.args[0] ? true : false;
      doActivateAutoLoop(shouldActivate);
    }
    else
      epOSC.send("/activate", [isActive ? 1 : 0], info.address, info.port)
  }
  else if ((msg.address === "/setTimeStr")) {
    if (msg.args.length > 0) {
      const timeStr = msg.args[0]
      sys.setFromDatestring(timeStr);
    }
  }
  else if (msg.address === "/isAgendaDisabled") {
    if (msg.args.length === 1) {
      const a = msg.args[0]

      doSetAgendaDisabled(a)
    }
  }
  else if ((msg.address === "/dateShouldActivate")) {
    let dateToCheck = new Date()
    if (msg.args.length === 3)
      dateToCheck = new Date(msg.args[0], msg.args[1], msg.args[2], msg.args[3], msg.args[4])

    const willBeRunning = willBeRunningForDate(dateToCheck)
    epOSC.send("/dateShouldActivate", [willBeRunning ? 1 : 0], info.address, info.port)
  }
  else if (msg.address === "/hostName") {
    if (msg.args.length === 1) {
      const n = msg.args[0]
      sys.setHostName(n);
    }
    else {
      dbg.error("wrong args num for hostname")
    }
  }

  else if (msg.address === "/reboot") {
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

const epOSC = new OSCServerModule((msg, time, info) => {
  handleMsg(msg, time, info)
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


let isAgendaDisabled = false;

function checkHostName() {
  // const LnumSDName = sys.getMountedSDCardName()
  // const matchNormName = LnumSDName.toUpperCase().match(/L ?\d+$/)
  // if (matchNormName) {
  //   const normName = matchNormName[0]
  //   const targetHostname = "lumestrio" + parseInt(normName.match(/\d+$/)[0])
  //   const cur = sys.getHostName();
  //   if (cur != targetHostname) {
  //     dbg.warn("force override hostname to", targetHostname, "using sd card name", LnumSDName)
  //     sys.setHostName(targetHostname)
  //     sys.reboot();
  //   }


  // }
  if (isPi && !fs.existsSync("/boot/hostname.txt")) {
    uConf.setRW(true)
    console.warn(">>>>>>>>> setting random hostname")
    const randomName = "lumestrio" + parseInt("" + 100 + (Math.random() * 1000))
    execSync(`echo ${randomName} > /boot/hostname.txt`);
    uConf.setRW(false)
  }
  if (fs.existsSync("/boot/hostname.txt")) {
    const cur = sys.getHostName()
    const des = fs.readFileSync("/boot/hostname.txt").toString().trim();
    if (!des.length) {
      dbg.error("can not set empty  hostname")
      return;
    }
    if (!des.startsWith("lumestrio")) {
      dbg.error("can not set hostname that do not start with lumestrio")
      return;
    }
    if (cur != des) {
      dbg.warn(" should change hostName to ", des)
      sys.setHostName(des)
      sys.reboot();
    }
  }
}

export function startEndpointServer(epConf: { endpointName?: string, endpointPort?: number }) {
  checkHostName();
  const hasCustomPort = !!epConf.endpointPort;
  const epPort = hasCustomPort ? epConf.endpointPort : conf.endpointPort;
  initModules();
  const httpProto = conf.usehttps ? https : http
  const server = conf.usehttps ? httpProto.createServer(conf.credentials as any, app) : httpProto.createServer(app)
  server.listen(epPort, () =>
    dbg.log(`[endpoint OSC] will listen on port ${epPort}!`));
  epOSC.connect("0.0.0.0", epPort)


  epOSC.udpPort.on('ready', () => {
    // sendFirstQueries();
    dbg.log("[endpoint OSC] listening on", epOSC.localPort)
  })




  let bonjour;


  function tryPublish() {
    try {
      let ifaceIp = getIpOfInterface(targetIf);
      if (ifaceIp === "") {
        // throw Error("no ip for iface " + targetIf)
      }

      dbg.warn("using iface >>>> " + ifaceIp)
      ifaceIp = "" // so first query will update it
      if (bonjour) {
        const serv = (bonjour as any)._server;
        serv.mdns.off('query', serv._respondToQuery);
        bonjour.destroy()
      }
      const mdnsOpts = { interface: "0.0.0.0" };
      //ts-ignore : next-line???
      bonjour = bonjourM(mdnsOpts);//{interface:[ifaceIp,"0.0.0.0"]})
      // advertise an localEndpoint server
      const serv = (bonjour as any)._server;
      const oldQCb = serv._respondToQuery;


      if (oldQCb) {
        dbg.warn("overriding mdns cb")
        serv.mdns.removeAllListeners('query')
        serv.mdns.on('query',
          (query) => {
            const curIp = getIpOfInterface(targetIf);
            if (curIp !== "") {
              if (ifaceIp != curIp) {
                bonjour.unpublishAll();
                dbg.warn("changed ip from ", ifaceIp, "to ", curIp, epConf.endpointName || hostname());
                bonjour.publish({ name: epConf.endpointName || hostname(), type: 'rspstrio', protocol: 'udp', port: epPort, txt: { uuid: "lumestrio@" + sys.getMac() + (hasCustomPort ? '' + epPort : ''), caps: "osc1=osc,osc2=osc,audio=html:8000,vermuth=html:3005" } })
                ifaceIp = curIp;
              }

            // dbg.warn("mdns resp " + query)
              serv._respondToQuery(query);
            }
            else {
              console.warn(">>>>>>>>>>>>no interface available prevent unhandled throw ", targetIf)

            }
          })
      }
      else {
        console.error("!!!!!no cb to override")
      }
      if (sys.getMac() === "unknown") {
        throw new Error("no mac available");
      }
      // bonjour.publish({ name: epConf.endpointName || hostname(), type: 'rspstrio', protocol: 'udp', port: epPort, txt: { uuid: "lumestrio@" + sys.getMac() + (hasCustomPort ? '' + epPort : ''), caps: "osc1=osc,osc2=osc,audio=html:8000,vermuth=html:3005" } })

    }
    catch (e) {
      dbg.error("MDNS publish error", e);
      setTimeout(tryPublish, 1000);
    }
  }
  tryPublish();


  startSchedule((state) => {
    if (isAgendaDisabled) {
      return;
    }
    dbg.log(">>>>> scheduling State is", state ? "on" : "off")
    adaptLooperStateFromAgendaEvent();
    activate(!!state)

  })
  return server
}

function adaptLooperStateFromAgendaEvent() {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const currentAgenda = getAgenda()
  const curDayType = getActiveDayForDateInAgenda(new Date(), currentAgenda)
  let closestPositiveDiff = undefined
  let refPointMinutes = undefined
  curDayType?.hourRangeList.map(e => {
    const startMinutes = hourStringToMinutes(e.start)
    if (startMinutes === undefined) return
    const diffWithStart = nowMinutes - startMinutes
    if (diffWithStart < 0) return
    if ((closestPositiveDiff === undefined) || diffWithStart < closestPositiveDiff) {
      closestPositiveDiff = diffWithStart
      refPointMinutes = startMinutes
    }
  })
  if (refPointMinutes === undefined) {
    console.error("could not find ref point for ", nowMinutes, curDayType)
  }
  else {
    console.log("applying ref point", hourMinutesToString(refPointMinutes))
  }
  looper.referenceTimeMs = refPointMinutes !== undefined ? refPointMinutes * 60 * 1000 : 0
  looper.loopTimeMs = (currentAgenda.loopTimeSec >>> 0) * 1000
}

export function cleanShutdown() {



}
