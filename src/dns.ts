
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

export interface PiConInfo {
  uuid: string;
  deviceName: string;
  ip: string;
  port: number;
  caps: { [id: string]: CapTypeInstance }
}


interface ServiceEP { service: RemoteService, lastT: Date, uuid: string }

function piFromService(uuid: string, service: RemoteService): PiConInfo {
  return JSON.parse(JSON.stringify({ uuid, deviceName: service.host, ip: service.referer.address, port: service.port, caps: capsFromSrvTxt(service.txt["caps"] || "") }))
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
    dbg.error(">>>>>>>>> no service found for uuid", uuid)
  }

  getPiForIP(ip: string) {
    const serviceEP = Object.values(this.availableRPI).find(p => { return p.service.addresses.includes(ip) })
    if (serviceEP) {
      return piFromService(serviceEP.uuid, serviceEP.service);
    }
    dbg.error(">>>>>>>>> no service found for ip ", ip)
  }

}
const model = new Model()

export function advertiseServerDNS() {

  const bonjour = bonjourM()

  // advertise an HTTP server 
  bonjour.publish({ name: hostname(), host: 'tinmar.local', type: 'http', protocol: 'tcp', port: conf.serverPort })
  bonjour.publish({ name: hostname(), /* host:'tinmar.local', */type: 'lumestrioMaster', protocol: 'tcp', port: conf.serverPort })

}


let dnsActive = false;
const hasPingEnabled = false;
const MDNSInterval = hasPingEnabled ? 10000 : 5000;
const pingInterval = 3000;
let interval: any;
let pingIntervalObj: any;
export function setDNSActive(b) {
  dnsActive = b;

  if (b) {
    listenDNS()
  }
  else {
    if (interval) { clearInterval(interval) };
  }
}


function broadcastMDNS(query, force = false) {
  if (!dnsActive && !force) { return; }
  const curD = new Date();
  for (const [k, v] of Object.entries(model.availableRPI)) {
    if ((curD.getTime() - v.lastT.getTime()) >= pingInterval + 10000) {
      dbg.warn('disconnected', k, (curD.getTime() - v.lastT.getTime()))
      const old = model.availableRPI[k];
      delete model.availableRPI[k]
      model.emit("close", old)
    }
  }

  dbg.log("updateMDNS", Object.values(model.availableRPI).map(pi => pi.uuid))
  // force callback
  for (const s of Object.values(model.availableRPI)) {
    (query as any)._removeService(s.service.fqdn);
  }
  query.update();



}
function pingAllPis() {
  const appFilePaths = appPaths.getConf();
  const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {}) as DeviceDic
  if (!dnsActive || !hasPingEnabled) { return; }
  dbg.log("[ping] >>>> start ping")
  const pingCfg = {
    timeout: pingInterval,
  };
  for (const s of Object.values(knownDevices)) {

    (function (curPi) {
      const host = curPi.ip
      const hostName = curPi.deviceName
      ping.sys.probe(host, (isAlive) => {
        var msg = `[ping] host ${hostName} (${host})` + (isAlive ? ' is alive' : ' is dead');
        dbg.log(msg);
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

export function listenDNS(): Model {
  console.log(">>>>>>>>>>>>>>>>>start listening Piiii")
  const bonjour = bonjourM()
  const query = bonjour.find({ type: 'rspstrio', protocol: 'udp' }, (_service) => {
    const service = JSON.parse(JSON.stringify(_service))
    let uuid = service.txt["uuid"];

    if (uuid === undefined) {
      dbg.error("no uuid present in MDNS")
      uuid = [service.name, service.port].join('_');
    }
    if (!model.availableRPI[uuid]) {
      model.availableRPI[uuid] = { service: service, lastT: new Date(), uuid }
      dbg.warn('Found a Raspestrio endpoint:', uuid)
      dbg.log(JSON.stringify(service))
      dbg.log(JSON.stringify(model.getPiForUUID(uuid)))
      model.emit("open", uuid)
    }
    else {
      dbg.log('Pingfor :', uuid)

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

  if (interval) { clearInterval(interval) };
  interval = setInterval(() => {
    broadcastMDNS(query);
  }, MDNSInterval)
  broadcastMDNS(query, true);


  if (pingIntervalObj) { clearInterval(pingIntervalObj) }
  pingIntervalObj = setInterval(() => {
    pingAllPis();
  }, pingInterval)
  pingAllPis();

  return model
}
