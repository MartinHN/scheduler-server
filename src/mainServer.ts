import { startServer } from './server'
import { listenDNS, advertiseServerDNS, PiConInfo, setDNSActive } from './dns'
import { startWS } from './wsServer'
import * as appPaths from './filePaths'
import fs from 'fs'
import http from 'http'
import { OSCServerModule } from './lib/OSCServerModule'
import { DeviceDic, Groups, newEmptyDevice } from './types/DeviceTypes'
import { postJSON } from './lib/HTTPHelpers'
import * as dbg from './dbg'
import jdiff from 'json-diff';
import chokidar from 'chokidar';
import _ from 'lodash'


let isInaugurationMode = false;

let isAgendaDisabled = false;

function getKnownPis() {
  const appFilePaths = appPaths.getConf();
  const pis = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
  return Object.values(pis);
}

export function cleanShutdown() {
  // do nothing 
}

export function startMainServer(serverReadyCb) {
  advertiseServerDNS()
  const server = startServer(serverReadyCb)
  // to from web page
  const wsServer = startWS(server)
  // to XXXstrios
  const oscSender = new OSCServerModule(msgFromPi)
  oscSender.connect("0.0.0.0", 0)

  wsServer.on("connection", (w) => {
    wsServer.sendTo(w, { type: "connectedDeviceList", data: pis.getAvailablePis() })
  })

  const pis = listenDNS()

  function updateKnownPi(pi: PiConInfo) {
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
    const knownPi = knownDevices[pi.uuid];
    if (!knownPi) { dbg.log("pi known up to date"); return; }
    const props = ['ip', 'port', 'caps', 'deviceName']
    let change = false;
    props.map(p => {
      if (jdiff.diff(knownPi[p], pi[p])) {
        knownPi[p] = pi[p]
        change = true;
        dbg.warn("known changed prop :", p, jdiff.diffString(knownPi[p], pi[p]))
      }
    })
    if (change) {
      appPaths.writeFileObj(appFilePaths.knownDevicesFile, knownDevices)
    }
  }
  pis.on("open", async (piUuid) => {
    dbg.log("newPI", piUuid)
    const pi = pis.getPiForUUID(piUuid)
    if (pi) {
      updateKnownPi(pi)
    }
    else
      dbg.error("no pi found iwhen opening")
    sendToPi(pi, "/activate", [])


    wsServer.broadcast({ type: "connectedDeviceList", data: pis.getAvailablePis() })
    await checkEndpointUpToDate(pi);


  })
  pis.on("close", (piUuid) => {
    dbg.log("no more pi", piUuid)
    wsServer.broadcast({ type: "connectedDeviceList", data: pis.getAvailablePis() })
  })

  async function sendToPi(pi: PiConInfo, addr: string, args?: any[]) {
    const deviceURL = pi.ip;
    const devicePORT = pi.port;
    if (addr !== "/rssi") { dbg.log("send event to pi:", pi.ip, pi.port, addr) }
    oscSender.send(addr, args, deviceURL, devicePORT)
  }

  wsServer.onMessage = (ws, msg) => {
    if (!msg) {
      dbg.error("[wsServer] empty msg")
      return;
    }
    const { addr, args } = msg;
    if (!(addr === "deviceEvent" && args.event && args.event.type === "rssi")) {
      dbg.log('[wsServer] Received Message: ' + addr + JSON.stringify(msg));
    }
    if (addr == "deviceEvent") {
      let pi = Object.values(pis.getAvailablePis()).find(p => p.uuid == args.uuid)
      if (!pi) {
        const knownDevices = (appPaths.getFileObj(appPaths.getConf().knownDevicesFile) || {}) as DeviceDic
        const knownPi = knownDevices[args.uuid];
        if (knownPi === undefined) {
          dbg.error("what pi are we talking about?");
          return;
        }
        pi = knownPi;
        dbg.warn('pi not found', args?.uuid, "using registred on ilast known ip", pi.ip);
        dbg.warn("connected : ", Object.values(pis.getAvailablePis()).map(e => e.uuid))

      }

      const ev = args.event;
      const pArg = ev.value !== undefined ? [ev.value] : undefined;
      // dbg.log('sending to pi',ev.type,pi)
      sendToPi(pi, "/" + ev.type, pArg)
    }

    else if (addr == "server") {
      if (args && (args.type === "req")) {
        if (args.value === "connectedDeviceList")
          wsServer.sendTo(ws, { type: "connectedDeviceList", data: pis.getAvailablePis() })
        else if (args.value === "isInaugurationMode") {
          wsServer.sendTo(ws, { type: "isInaugurationMode", data: isInaugurationMode })
        }
        else if (args.value === "isAgendaDisabled") {
          wsServer.sendTo(ws, { type: "isAgendaDisabled", data: isAgendaDisabled })
        }
        else
          dbg.error('[wsServer] unknown msg', msg);
      }
      else if (args.type === "isInaugurationMode") {
        setInaugurationMode(!!args.value)
        wsServer.broadcastBut({ type: args.type, data: !!args.value }, ws);
      }
      else if (args.type === "isAgendaDisabled") {
        isAgendaDisabled = !!args.value
        checkAgendaDisabledOnPis();
        wsServer.broadcastBut({ type: args.type, data: !!args.value }, ws);

      }
      else if (args.type === "isDNSActive") {
        dbg.log("activating DNS : ", !!args.value)
        setDNSActive(!!args.value)
      }

    }
    else {
      dbg.error('[wsServer] unknown msg', msg);

    }


  }

  function msgFromPi(msg, time, info) {
    const pi = pis.getPiForIP(info.address, true)
    if (pi) {
      if (msg) {
        dbg.log(">>>>>>> from pi", msg)
        if (msg.address != "/rssi") {
        }
        const toWeb = { uuid: pi.uuid, type: "resp", msg };
        wsServer.broadcast(toWeb)
      }
    }
    else {
      dbg.error("msg from unknown pi", info.address, info)
    }
  }

  async function checkRemoteResource(p: PiConInfo, addr: string, tgtObj: any) {
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic

    const curDev = knownDevices[p.uuid]
    if (!curDev) {
      dbg.error('[app] checkRemoteResource no known device for pi', p.uuid || p)
      return;
    }

    const baseEPURL = "http://" + p.ip + ":" + p.port
    return new Promise((resolve, reject) => {
      http.get(baseEPURL + addr, async res => {
        // Buffer the body entirely for processing as a whole.
        const bodyChunks = [];
        res.on('data', function (chunk) {
          // You can process streamed parts here...
          bodyChunks.push(chunk);
        }).on('end', async function () {
          const remoteData = Buffer.concat(bodyChunks).toString();
          // dbg.log(remoteData)
          let remoteInfo = {};
          try {
            remoteInfo = remoteData ? JSON.parse(remoteData) : {};
          }
          catch (e) {
            dbg.error("invalid json on " + p.uuid);
            reject(e)
          } 

          if (JSON.stringify(tgtObj) !== JSON.stringify(remoteInfo)) {
            dbg.warn("need update  " + addr, jdiff.diffString(remoteInfo, tgtObj));
            await postJSON(p.ip, "/post" + addr, p.port, tgtObj).catch(e => resolve(undefined))
            resolve(false);
          }
          else {
            dbg.log(p.uuid, "res " + addr + " is uptoDate")
            resolve(true);
          }
          // ...and/or process the entire body here.
        }).on('error', (e) => {
          dbg.error("http.con dl error")
          reject(e)
        })
      }).on('error', (e) => {
        dbg.error("http.con error")
        reject(e)
      })
    })
  }


  async function checkEndpointAgendaIsUpToDate(p: PiConInfo) {
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
    const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {}) as Groups
    const curDev = knownDevices[p.uuid]
    if (!curDev) {
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known device for pi', p.uuid || p)
      return;
    }

    const curGroupObj = groups[curDev.group]
    if (!curGroupObj) {
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known group for pi ignore checking agenda')
      return;
    }

    let agendaName = curGroupObj.agendaFileName
    if (!agendaName.endsWith('.json')) agendaName += '.json'
    const agendaPath = appFilePaths.agendasFolder + "/" + agendaName
    if (!fs.existsSync(agendaPath)) {
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known path for agenda')
      return;
    }
    const data = fs.readFileSync(agendaPath).toString()
    try {
      return await checkRemoteResource(p, "/agendaFile", JSON.parse(data));

    } catch (e) {
      console.error("can't check agenda on pi", p.deviceName, e);
    }
    return undefined;


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


  async function checkAgendaDisabledOnPi(p: PiConInfo) {
    sendToPi(p, "/isAgendaDisabled", [isAgendaDisabled ? 1 : 0]);
  }

  async function checkAgendaDisabledOnPis() {
    for (const c of getKnownPis()) {
      try {
        checkAgendaDisabledOnPi(c)
      } catch (e) {
        dbg.error("trying to update agenda disabled", e)
      }
    }
  }

  async function checkEndpointUpToDate(pi: PiConInfo) {

    const agOk = await checkEndpointAgendaIsUpToDate(pi);
    const infoOk = true;//!! (await checkEndpointInfoIsUpToDate(p));
    checkAgendaDisabledOnPi(pi);
    const hadError = (agOk === undefined) || (infoOk === undefined)
    if (hadError) {
      dbg.warn("endpoint could not be updated", pi.deviceName, pi.uuid)
      return undefined
    }
    const isUpToDate = agOk && infoOk
    if (isUpToDate) {
      dbg.log("endpoint already up to date", pi.deviceName, pi.uuid)
    }
    else {
      dbg.warn("endpoint has been updated", pi.deviceName, pi.uuid)
    }
    return isUpToDate;
  }

  async function checkAllEndpoints() {

    if (!fs.existsSync(appPaths.getConf().knownDevicesFile)) {
      dbg.warn('no file ')
      return
    }
    const curDev = appPaths.getFileObj(appPaths.getConf().knownDevicesFile);
    if (!curDev) {
      dbg.warn('infalid file ')
      return
    }
    dbg.log('>>>> checking all up to date')
    let res;
    for (const c of getKnownPis()) {
      try {
        res ||= (await checkEndpointUpToDate(c)) == true
      } catch (e) {
        dbg.error("trying to update ep", e)
      }
    }
    dbg.log('>>>> All checked all up to date')
  }
  const checkAllEndpointsDbnc = _.debounce(checkAllEndpoints, 2000, {})
  var watcher = chokidar.watch(appPaths.getConf().baseDir, { ignored: /^\./, persistent: true });
  watcher.on("change", (e) => { dbg.log("chg", e); checkAllEndpointsDbnc() });
  watcher.on("add", checkAllEndpointsDbnc);
  watcher.on("unlink", checkAllEndpointsDbnc);
  watcher.on("error", e => dbg.error("watch error", e));


  function setInaugurationMode(b: boolean) {
    isInaugurationMode = b
    if (!isAgendaDisabled) {
      isAgendaDisabled = true;
      wsServer.broadcast({ type: "isAgendaDisabled", data: isAgendaDisabled })
      checkAgendaDisabledOnPis();
      dbg.error("force disabling agenda ")
    }
    dbg.warn('inauguration set to ' + isInaugurationMode ? 'on' : 'off');

    const sendAll = () => {
      for (const p of getKnownPis()) {
        try {
          sendToPi(p, "/activate", [isInaugurationMode ? 1 : 0])
          // checkEndpointUpToDate(c)
        } catch (e) {
          dbg.error("trying to update ep", e)
        }
      }
    }

    // redundancyyyyyy
    sendAll();
    setTimeout(() => { sendAll() }, 200);
    setTimeout(() => { sendAll() }, 500);
    setTimeout(() => { sendAll() }, 1000);

  }


}
