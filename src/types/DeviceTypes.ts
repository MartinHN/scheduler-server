/// ////////
// Devices
import { CapTypeInstance, CapTypeName } from './CapTypes'

export interface Device {
  uuid:string;
  deviceName:string;
  niceName:string;
  ip:string;
  group:string;
  port:number;
  caps:{[id:string]:CapTypeInstance}
  rssi:string;
  activate:boolean;
}

export function newEmptyDevice (deviceName:string, fields?:any):Device {
  fields = fields || {}
  return { deviceName, port: fields.port, ip: fields.ip || 'null', caps: fields.caps || {}, niceName: fields.niceName || 'no niceName', rssi: fields.rssi || -1, activate: fields.activate || false, uuid: fields.uuid || 'auto@' + Math.ceil(Math.random() * 10e6), group: fields.group || '' }
}

export type DeviceDic = {[id:string]:Device};

/// ///////////
// groups

export interface Group{
  name:string
  agendaFileName:string
  devices:string[]
}

export interface Groups{
  [key:string] : Group
}

export function newEmptyGroup (name:string, fields?:any):Group {
  fields = fields || {}
  return { name, devices: fields.devices || [], agendaFileName: fields.agendaFileName || 'default.json' }
}
