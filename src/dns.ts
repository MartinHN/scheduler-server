
///////////////////
// mdns
import { hostname } from 'os';
import * as dbg from './dbg'
import conf from './config'
import bonjourM, { RemoteService, Service } from 'bonjour'
import { EventEmitter } from 'events'
import jdiff from 'json-diff';
import { CapTypeInstance, CapTypeName } from './types/CapTypes';
import ping from 'ping'
import { DeviceDic } from './types';
import * as appPaths from './filePaths'
import { getIPAddresses } from './lib/networkUtils';
import { execSync } from 'child_process';
import { execPath } from 'process';
import { isPi } from './platformUtil';

export interface PiConInfo {
  uuid: string;
  deviceName: string;
  ip: string;
  port: number;
  caps: { [id: string]: CapTypeInstance }
}


interface ServiceEP { service: RemoteService, lastT: Date, uuid: string }


function serviceHostToUuid(h: string) {
  return h.replace(".local", "")
}
function piFromService(uuid: string, service: RemoteService): PiConInfo {
  let trueUuid = serviceHostToUuid(service.host)
  return JSON.parse(JSON.stringify({ uuid: trueUuid, deviceName: service.host, ip: service.referer.address, port: service.port, caps: capsFromSrvTxt(service.txt["caps"] || "") }))
}

function capsFromSrvTxt(t: string): { [id: string]: CapTypeInstance } {
  if (!t) { return {} }
  const caps = t.split(",");
  const res = {} as { [id: string]: CapTypeInstance }
  caps.map(e => {
    const spl = e.split('=');
    if (spl.length == 2) {
      let type = spl[1]
      let port = 0
      if (spl[1].includes(':')) {
        const ln = spl[1].split(':')
        type = ln[0]
        port = parseInt(ln[1])
      }
      res[spl[0]] = { type: type as CapTypeName, port: port }
    }
    else {
      dbg.error('wrong format for cap', e)
    }
  })
  return res;
}
class Model extends EventEmitter {
  availableRPI = {} as { [key: string]: ServiceEP }
  getAvailablePis(): PiConInfo[] {
    const res: PiConInfo[] = []
    for (const [k, v] of Object.entries(this.availableRPI)) {
      res.push(piFromService(k, v.service));
    }
    return res;
  }

  getPiForUUID(uuid: string): PiConInfo | undefined {
    const serviceEP = Object.values(this.availableRPI).find(p => { return p.uuid === uuid })
    if (serviceEP) {
      return piFromService(serviceEP.uuid, serviceEP.service);
    }
    dbg.error("[dns]>>>>>>>>> no service found for uuid", uuid)
  }

  getPiForIP(ip: string, isAlive = false) {
    const serviceEPs = Object.values(this.availableRPI).filter(p => { return p.service.addresses.includes(ip) })
    let serviceEP = undefined;
    if (serviceEPs.length == 1) {
      serviceEP = serviceEPs[0];
    }
    else if (serviceEPs.length > 1) {
      isAlive = false;

      dbg.warn("try reuse existing pi for ip ", ip)
      for (const s of serviceEPs) {
        s.lastT = new Date(0); // fake reset
      }
      // const appFilePaths = appPaths.getConf();
      // const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
      // const devs = Object.values(knownDevices).filter(d => d.ip === ip);
      // let dev = devs.pop()
      // while (dev && !serviceEP) {
      //   serviceEP = this.getPiForUUID(dev.uuid)
      //   dev = devs.pop()
      // }
      // if (!serviceEP)
      //   dbg.error("could not reuse existing pi for ip ", ip)
    }
    if (serviceEP) {
      if (isAlive) serviceEP.lastT = new Date()
      return piFromService(serviceEP.uuid, serviceEP.service);
    }
    dbg.error("[dns]>>>>>>>>> no service found for ip ", ip, (Object.values(this.availableRPI).map(p => p.service.addresses.filter(e => !e.includes("::")))))
  }

}
const model = new Model()

export function advertiseServerDNS() {

  const bonjour = bonjourM()

  // advertise an HTTP server 
  bonjour.publish({ name: hostname(),/* host: 'tinmar.local',*/ type: 'http', protocol: 'tcp', port: conf.serverPort })
  // next line if androidjs
  // bonjour.publish({ name: hostname(), /* host:'tinmar.local', */type: 'lumestrioMaster', protocol: 'tcp', port: conf.serverPort })

}


let dnsActive = false;
const hasPingEnabled = true;
const MDNSInterval = 3000;
const pingInterval = 5000;
const pingTimeout = 2000;
let broadcastMDNSInterval: any;
let pingIntervalObj: any;
export function setDNSActive(b) {
  dnsActive = b;

  if (b) {
    listenDNS()
  }
  else {
    if (broadcastMDNSInterval) { clearInterval(broadcastMDNSInterval) };
    if (pingIntervalObj) { clearInterval(pingIntervalObj) }
  }
}


let lastIFs = [];
let dnsWarmupMs = 3 * 1000
function broadcastMDNS(query, force = false) {
  if (!dnsActive && !force) { return; }
  pingAllPendingPis();
  if (Date.now() - bonjourStartMs < dnsWarmupMs) { dbg.warn("warming up dns"); return; }
  const curD = new Date();
  const toRm = {} as typeof model.availableRPI
  for (const [k, v] of Object.entries(model.availableRPI)) {
    if ((curD.getTime() - v.lastT.getTime()) >= pingInterval + 5000) {
      dbg.warn('disconnected', k, (curD.getTime() - v.lastT.getTime()))
      const old = model.availableRPI[k];
      toRm[k] = old;
      delete model.availableRPI[k]
      model.emit("close", old)
    }
  }



  // if (getIPAddresses().length !== 0) {
  if (Object.values(toRm).length > 0) {
    dbg.log("[dns] removeMDNS", Object.values(toRm).map(pi => pi.uuid))
    // // force callback
    for (const s of Object.values(toRm)) {
      (query as any)._removeService(s.service.fqdn);
    }
    dbg.log("[dns] updateMDNS", Object.values(model.availableRPI).map(pi => pi.uuid))
    query.update();
  }

}
function pingAllPendingPis() {
  const appFilePaths = appPaths.getConf();
  const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
  if (!dnsActive || !hasPingEnabled) { return; }
  const pingCfg = {
    timeout: pingTimeout,
  };

  let pendingPis = Object.values(model.getAvailablePis()).filter(p => knownDevices[p.uuid] === undefined);
  pendingPis = pendingPis.filter(p => pendingPis.find(pp => pp.ip == p.ip))
  if (!pendingPis.length) return;
  dbg.log("[dns] [ping] >>>> start ping")
  for (const s of Object.values(pendingPis)) {// Object.values(model.getAvailablePis())) {
    (function (curPi) {
      const host = curPi.ip
      const hostName = curPi.deviceName
      dbg.log(`[dns] [ping] will ping host ${hostName} (${host})`);
      ping.sys.probe(host, (isAlive) => {
        // var msg = `[ping] host ${hostName} (${host})` + (isAlive ? ' is alive' : ' is dead');
        // dbg.log(msg);
        const resolvedPi = model.availableRPI[curPi.uuid]
        if (isAlive) {
          if (resolvedPi) { resolvedPi.lastT = new Date(); }
          else {
            dbg.warn("pi not registered but active")
          }
        }
      }, pingCfg);
    }(s))
  }

}

let bonjour;
let bonjourStartMs = 0;
export function listenDNS(): Model {
  console.log(">>>>>>>>>>>>>>>>>start listening Piiii")
  lastIFs = getIPAddresses();
  if (bonjour) bonjour.destroy()

  bonjourStartMs = Date.now();
  const mdnsOpts = {
    // interface: undefined,
    ttl: 6, // set the multicast ttl
    loopback: true, // receive your own packets
    reuseAddr: true
  };
  //ts-ignore : next-line
  bonjour = bonjourM(mdnsOpts)
  const query = bonjour.find({ type: 'rspstrio', protocol: 'udp' }, (_service) => {
    const service = JSON.parse(JSON.stringify(_service))
    let uuid = service.host
    if (!uuid) {
      dbg.error("no valid uuid", service)
      return;
    }
    uuid = serviceHostToUuid(uuid)
    // service.txt["uuid"];

    if (uuid === undefined) {
      dbg.error("[dns]no uuid present in MDNS")
      // uuid = [service.name, service.port].join('_');
    }
    if (!model.availableRPI[uuid]) {
      model.availableRPI[uuid] = { service: service, lastT: new Date(Date.now() + 30 * 1000), uuid }
      dbg.warn('Found a Raspestrio endpoint:', uuid)
      dbg.log(JSON.stringify(service))
      dbg.log(JSON.stringify(model.getPiForUUID(uuid)))
      model.emit("open", uuid) //
    }
    else {
      dbg.log('MDNSResp for :', uuid)

      model.availableRPI[uuid].lastT = new Date()

      const regPi = piFromService(uuid, model.availableRPI[uuid].service)
      const announcedPi = piFromService(uuid, service)
      if (jdiff.diff(regPi, announcedPi)) {
        dbg.warn("service updated", jdiff.diffString(regPi, announcedPi))
        model.emit("close", uuid)
        model.availableRPI[uuid].service = service;
        model.emit("open", uuid)
      }


    }

  })

  if (broadcastMDNSInterval) { clearInterval(broadcastMDNSInterval); };
  broadcastMDNSInterval = setInterval(() => {
    if (lastIFs.join(" ") !== getIPAddresses().join(" ")) {
      dbg.warn("!!!!!!interfaces changed restart dns", lastIFs, getIPAddresses())
      for (const s of Object.values(model.availableRPI)) {
        (query as any)._removeService(s.service.fqdn);
      }
      listenDNS();
      return;
    }
    broadcastMDNS(query);
  }, MDNSInterval)
  broadcastMDNS(query, true);


  // if (pingIntervalObj) { clearInterval(pingIntervalObj) }
  // pingIntervalObj = setInterval(() => {
  //   pingAllPis();
  // }, pingInterval)
  // pingAllPis();

  return model
}


// function updateArpForMac() {
//   const appFilePaths = appPaths.getConf();
//   const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
//   const iface = isPi ? "wlan0" : "en0";
//   for (const o of Object.values(knownDevices)) {
//     try {

//       const macStr = o.uuid.split("@")[1]
//       const arpOut = execSync(`arp -a -i ${iface} | grep ${macStr}`).toString().trim()
//       if (arpOut) {
//         const localIp = arpOut.split('(')[1].split[')'][0]
//         if (o.ip != localIp) {
//           dbg.warn("[arp] ip changed from ", o.ip, "to", localIp)
//           o.ip = localIp;
//         }
//       }
//     }
//     catch (e) {
//       dbg.error("local arp failed ", e)
//     }
//   }
// }
