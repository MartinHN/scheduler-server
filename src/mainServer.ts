import { startServer } from './server'
import { listenDNS, advertiseServerDNS, PiConInfo, setDNSActive } from './dns'
import { startWS } from './wsServer'
import LoraModule, { getAgendaForUuid } from './modules/LoraModule';
import * as appPaths from './filePaths'
import fs from 'fs'
import http from 'http'
import { OSCServerModule } from './lib/OSCServerModule'
import { DeviceDic, Device, Groups, newEmptyDevice } from './types/DeviceTypes'
import { postJSON } from './lib/HTTPHelpers'
import * as dbg from './dbg'
import * as sys from "./sysUtils"
import jdiff from 'json-diff';
import chokidar from 'chokidar';
import _ from 'lodash'
import { dateToStr } from './types';
import { LoraDeviceInstance, LoraDeviceFile, LoraDeviceArray, LoraDeviceType } from './types/LoraDevice';
import { createHash } from 'crypto'
import { isPi } from './platformUtil';

import { setWsProxyCallback } from './modules/LoraModuleHelpers'
let isInaugurationMode = false;

let isAgendaDisabled = false;

function getKnownPis(): Array<Device> {
  const appFilePaths = appPaths.getConf();
  const pis = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
  return Object.values(pis);
}

function getKnownPiForUuid(uuid) {
  const appFilePaths = appPaths.getConf();
  const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
  return knownDevices[uuid];
}

export function cleanShutdown() {
  // do nothing 
}

export function startMainServer(serverReadyCb) {
  advertiseServerDNS()
  const { server, expressApp } = startServer(serverReadyCb)
  // to from web page
  const wsServer = startWS(server)
  if (isPi) {
    setWsProxyCallback((b: Buffer) => {
      wsServer.broadcast({ addr: "loraMsg", args: b })
    })
  }
  //////////////
  // lora
  LoraModule.getActiveState = () => { return isInaugurationMode; }
  LoraModule.getAgendaDisabled = () => { return !!isAgendaDisabled; }

  LoraModule.onTimeSync.push((strToSend: string) => {
    dbg.log("[main] got lora sync message for date", strToSend)
    for (const pi of getKnownPis())
      sendToPi(pi, "/setTimeStr", [strToSend])
  })

  LoraModule.onActivate.push((b: boolean) => {
    dbg.log("got lora activate message ", b ? "1" : "0")
    setInaugurationMode(b)
  })

  LoraModule.onDisableAgenda.push((b: boolean) => {
    dbg.log("server got lora disable agenda message ", b ? "1" : "0")
    isAgendaDisabled = b;
    checkAgendaDisabledOnPis(false);
    wsServer.broadcast({ type: "isAgendaDisabled", data: !!b })
  })

  LoraModule.onPong.push((time: number, uuid: number, activeState: number, miniAgMd5: string) => {
    console.log("[lora] got pong, round trip of", time, uuid, activeState)
    if (!LoraModule.isSendingPing) return;
    const agendaContent = getAgendaForUuid(uuid)
    if (!agendaContent) { console.error("can not find agenda fot", uuid); return; }
    const fullDescStr = JSON.stringify(LoraDeviceInstance.getDescFromUuid(uuid));

    let isAgendaInSync = false;//Math.random() > .5 ? true : false;
    try {
      const minObj = JSON.stringify(JSON.parse(agendaContent), null, 0)
      let hash = createHash('md5').update(minObj).digest("hex").trim()
      isAgendaInSync = miniAgMd5 && miniAgMd5.length >= 6 && hash.startsWith(miniAgMd5) 
      if (!isAgendaInSync && LoraModule.loraIsCheckingAgendas) {
        dbg.error("pong out of sync ", hash, "vs", miniAgMd5.trim())
      }
    } catch (e) {
      console.error("can't check agenda on lora dev", fullDescStr, e);
    }

    wsServer.broadcast({ type: "loraPong", data: { time, uuid, activeState, isAgendaInSync } })
  })
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
    if (!knownPi) { dbg.log("can not update unknown pi"); return false; }
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
    return true
  }
  pis.on("open", async (piUuid) => {
    dbg.log("newPI", piUuid)
    const pi = pis.getPiForUUID(piUuid)
    let registredPi = getKnownPiForUuid(pi.uuid);
    if (pi) {
      updateKnownPi(pi)
    }
    else
      dbg.error("no pi found iwhen opening")

    if (registredPi)
      sendToPi(pi, "/activate", [])


    wsServer.broadcast({ type: "connectedDeviceList", data: pis.getAvailablePis() })
    if (registredPi)
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
    if (!(addr === "deviceEvent" && args.event && args.event.type === "rssi")
      && !(args?.type == 'keepPingingDevice')
    ) {
      dbg.log('[wsServer] Received Message: ' + addr + JSON.stringify(msg));
    }
    if (addr == "loraMsg") {
      if (args.type == "Buffer" && args.data) {
        LoraModule.sendBufToLora(Buffer.from(args.data))
      }
      else {
        dbg.error("[wsServer] invalid loarMsg")
      }
    }
    else if (addr == "deviceEvent") {
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
      else if (args.type == 'startFullAgSync') {
        startFullAgSync(!!args.value);
      }
      else if (args.type === "isDNSActive") {
        dbg.log("activating DNS : ", !!args.value)
        setDNSActive(!!args.value)
      }

    }
    else if (addr == "lora") {
      if (args && (args.type === "req")) {
        if (args.value === "loraIsSendingPing") {
          wsServer.sendTo(ws, { type: "loraIsSendingPing", data: LoraModule.isSendingPing })
        }
        else if (args.value === "loraIsSyncingAgendas") {
          wsServer.sendTo(ws, { type: "loraIsSyncingAgendas", data: LoraModule.loraIsSyncingAgendas })
        }
        else if (args.value === "loraIsCheckingAgendas") {
          wsServer.sendTo(ws, { type: "loraIsCheckingAgendas", data: LoraModule.loraIsCheckingAgendas })
        }
        else if (args.value === "deviceAreSyncedFromWifi") {
          wsServer.sendTo(ws, { type: "deviceAreSyncedFromWifi", data: LoraModule.deviceAreSyncedFromWifi })
        }
        else if (args.value === "loraIsDisablingWifi") {
          wsServer.sendTo(ws, { type: "loraIsDisablingWifi", data: LoraModule.loraIsDisablingWifi })
        }
      }
        // else if (args.type === "loraIsSendingPing") {
        //   LoraModule.isSendingPing = !!args.value
        //   if (LoraModule.isSendingPing)
        //     LoraModule.sendOnePingMsg(); // will schedule nexts
        // }
      else if (args.type === "loraIsCheckingAgendas") {
        LoraModule.loraIsCheckingAgendas = !!args.value
      }
      else if (args.type === "deviceAreSyncedFromWifi") {
        LoraModule.deviceAreSyncedFromWifi = !!args.value
        if (LoraModule.deviceAreSyncedFromWifi) generateLoraFromWifi();
      }
      else if (args.type === "loraIsSyncingAgendas") {
        LoraModule.loraIsSyncingAgendas = !!args.value
        if (LoraModule.loraIsSyncingAgendas)
          LoraModule.startAgendaSync(); // will schedule nexts
        else
          LoraModule.stopAgendaSync()
      }
      else if (args.type === "loraIsDisablingWifi") {
        LoraModule.loraIsDisablingWifi = !!args.value
      }
        // per device
      else if (args.type === "activate") {
        const uuidList = Object.values(args.value?.devices).map(LoraDeviceInstance.getUuid)
        LoraModule.sendActivate(!!args.value?.isActive, uuidList)
      }
      else if (args.type === "keepPingingDevice") {
        LoraModule.setPingableState(LoraDeviceInstance.getUuid(args.value.device), !!args.value.shouldPing)
      }
      else {
        dbg.error('[wsServer] unknownn lora msg', args);

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
        if (msg.address != "/rssi") {
          dbg.log(">>>>>>> from pi", msg)
        }
        const toWeb = { uuid: pi.uuid, type: "resp", msg };
        wsServer.broadcast(toWeb)
      }
    }
    else {
      dbg.error("msg from unknown pi", info.address, msg)
    }
  }

  function startFullAgSync(b: boolean) {

    checkAllEndpoints((serverSyncStatus) => {
      wsServer.broadcast({ type: "serverSyncStatus", data: "[wifi] " + serverSyncStatus })
    })
    if (b) {

      LoraModule.startAgendaSync((serverSyncStatus) => {
        wsServer.broadcast({ type: "serverSyncStatus", data: "[lora] " + serverSyncStatus })
      })
    }
    else {
      LoraModule.stopAgendaSync();
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
      dbg.error('[app] checkEndpointAgendaIsUpToDate no known device for pi', p.uuid, "::", p)
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
    let dataObj;
    try {
      dataObj = JSON.parse(data);

    } catch (e) {
      console.error("can't read agenda to set for pi", p.deviceName, agendaPath, e);
    }
    if (dataObj) {
    try {
      return await checkRemoteResource(p, "/agendaFile", JSON.parse(data));

    } catch (e) {
      console.error("can't check agenda on pi", p.deviceName, e);
    }
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

  async function checkAgendaDisabledOnPis(sendLora = true) {
    if (sendLora)
      LoraModule.sendDisableAgenda(isAgendaDisabled);
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

  function generateLoraFromWifi() {
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
    if (!knownDevices) {
      dbg.error("invalid known wifi device, abort trying to set lora")
      return
    }
    const newLoras: LoraDeviceArray = []
    dbg.warn("gen loras", Object.keys(knownDevices), knownDevices)
    for (const [k, v] of Object.entries(knownDevices)) {
      const uName = v.deviceName;
      const num = parseInt(uName.replace("lumestrio", "").replace("relay", "").replace("_", ""))
      const from = {
        deviceType: uName.startsWith('lumestrio') ? LoraDeviceType.Lumestrio : LoraDeviceType.Relaystrio,
        deviceNumber: num >>> 0,
        deviceName: v.niceName,
        group: v.group,
      };
      newLoras.push(LoraDeviceInstance.create(from))
    }
    const saved = appPaths.getFileObj(appFilePaths.knownLoraDevicesFile)
    if (saved && JSON.stringify(saved) != JSON.stringify(newLoras)) {
      appPaths.writeFileObj(appFilePaths.knownLoraDevicesFile, newLoras)
      return true;
    }

  }

  async function checkAllEndpoints(logProgress?) {
    if (!logProgress) { logProgress = () => { } }
    if (!(logProgress instanceof Function)) { dbg.error("invalid logProgress arg", logProgress); logProgress = () => { } }
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

    logProgress("check wifi devices")
    let res;
    const outDated = new Array<Device>()
    for (const c of getKnownPis()) {
      try {
        logProgress("checking ", c)
        const isUpToDate = (await checkEndpointUpToDate(c)) == true
        if (!isUpToDate) outDated.push(c)
        res ||= isUpToDate
      } catch (e) {
        outDated.push(c)
        dbg.error("trying to update ep", e)
      }
    }
    if (outDated.length == 0) {
      logProgress("tout les apareils wifi sont à jour")
      dbg.log('>>>> All checked all up to date')
    }
    else {
      const niceNames = outDated.map(d => d.niceName + "(" + d.uuid + ") ").join("\n")
      logProgress("ces apareils n'ont pas pu etre mis à jour:" + niceNames)
      dbg.log("some device haven't been synced :" + niceNames)
    }

  }
  const checkAllEndpointsDbnc = _.debounce(checkAllEndpoints, 2000, {})
  var watcher = chokidar.watch(appPaths.getConf().baseDir, { ignored: /^\./, persistent: true });
  watcher.on("change", (e) => {
    dbg.log("chg", e);
    let needCheck = true;
    if (LoraModule.deviceAreSyncedFromWifi && e.endsWith("knownDevices.json")) {
      needCheck = !generateLoraFromWifi()
    }
    if (needCheck) checkAllEndpointsDbnc()
  });
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
    dbg.warn('inauguration set to ' + (isInaugurationMode ? 'on' : 'off'));

    const sendAll = () => {
      for (const p of getKnownPis()) {
        try {
          sendToPi(p, "/activate", [isInaugurationMode ? 1 : 0])
          // checkEndpointUpToDate(c)
        } catch (e) {
          dbg.error("trying to update ep", e)
        }
      }
      if (LoraModule.isMasterServer())
        LoraModule.sendActivate(isInaugurationMode, [255]);
    }

    // redundancyyyyyy
    sendAll();
    setTimeout(() => { sendAll() }, 200);
    setTimeout(() => { sendAll() }, 500);
    setTimeout(() => { sendAll() }, 1000);

  }


}
