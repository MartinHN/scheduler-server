export enum LoraDeviceType {
  Relaystrio = 0,
  Lumestrio,
}
export const LoraTypeNames = new Array("Relaystrio", "Lumestrio")

export const maxDevicePerType = 32;


export interface LoraDevice {
  deviceType: LoraDeviceType
  deviceNumber: number
  deviceName: string
  _lastRoundtrip: number
  _isActive: boolean
  _lastSeen: Date
}


export type LoraDeviceArray = Array<LoraDeviceInstance>

export type LoraDeviceFile = Array<LoraDeviceInstance>

// export class LoraDeviceFile {
//   public list = new Array<LoraDeviceInstance>()
// }



export class LoraDeviceInstance implements LoraDevice {
  deviceType = LoraDeviceType.Lumestrio
  deviceNumber = -1
  deviceName = "no name"
  _lastRoundtrip = 0
  _isActive = false
  _lastSeen = new Date(0)
  _pingTimeWithOffset = new Date(0)

  static buildUuid(num: number, type: number) {
    return num + maxDevicePerType * type

  }
  static getUuid(o: LoraDevice) {
    return LoraDeviceInstance.buildUuid(o.deviceNumber, o.deviceType)
  }

  static getDescFromUuid(uuid: number) {
    uuid = uuid >>> 0
    return { type: Math.floor(uuid / maxDevicePerType), num: uuid % maxDevicePerType }
  }
  static create(o: any) {
    const res = new LoraDeviceInstance()
    if (!o) { console.error("can not create lora device"); return res }
    validateLoraDevice(o, true)
    res.deviceType = o.deviceType >>> 0
    res.deviceNumber = o.deviceNumber >>> 0
    res.deviceName = o.deviceName || "no name"
    return res;
  }
}



export function validateLoraDevice(d: LoraDevice, fillWithDefaults = false) {
  let res = true;
  if (d.deviceNumber < -1 || d.deviceNumber > maxDevicePerType) { res = false; if (fillWithDefaults) d.deviceNumber = -1 }
  return res
}

export function validateLoraDevices(dl: LoraDeviceArray, fillWithDefaults = false) {
  if (!dl)
    return false

  let res = true;
  for (const d of dl) {
    res &&= validateLoraDevice(d)
  }
  return res
}
