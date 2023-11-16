
export interface LoraState {
  isActive: boolean
  isMasterClock: boolean
  clockUpdateIntervalSec: number
  pingUpdateIntervalSec: number
  channel: number
  speed: number
  fec: boolean
}

export const minClockUpdateInterval = 1;
export const minPingUpdateInterval = 1;

export class DefaultLoraState implements LoraState {
  public isActive = false;
  public isMasterClock = false;
  public clockUpdateIntervalSec = 60;
  public pingUpdateIntervalSec = 5;
  public uuid = 0;
  public channel = defaultLoraChan;
  public speed = defaultAirDataRateIdx;
  public fec = true;
}

export function validateLoraState(s: LoraState, fillWithDefaults = false) {
  // console.log('checking', s)
  const validErr = (pn: string) => {
    console.error("got lora valid error", pn, s[pn])
    if (fillWithDefaults)
      s[pn] = new DefaultLoraState()[pn]

    return false
  }
  for (const n of ['isActive', 'isMasterClock', 'channel', 'speed', 'fec', 'clockUpdateIntervalSec', 'pingUpdateIntervalSec']) {
    // console.log("check defined", n, s[n])
    if (s[n] === undefined)
      return validErr(n)
  }

  s.clockUpdateIntervalSec = parseFloat('' + s.clockUpdateIntervalSec)
  if (s.clockUpdateIntervalSec < minClockUpdateInterval)
    return validErr('clockUpdateIntervalSec')

  s.pingUpdateIntervalSec = parseFloat('' + s.pingUpdateIntervalSec)
  if (s.pingUpdateIntervalSec < minPingUpdateInterval)
    return validErr('pingUpdateIntervalSec')

  s.channel = parseInt('' + s.channel)
  if ((s.channel < 0) || (s.channel > maxLoraChanNum))
    return validErr('channel')

  s.speed = parseInt('' + s.speed)
  if ((s.speed < 0) || (s.speed >= airDataRates.length))
    return validErr('speed')

  return true

}



////////////:
/// channels
export const defaultLoraChan = 40;
const maxLoraChanNum = 54
export function chanToMHz(c: number) {
  c = Math.max(0, Math.min(maxLoraChanNum, c))
  const chan = Math.round(c)
  return 160 + chan * .250
}

export const chanToHzTable = new Array<number>()

for (let i = 0; i < maxLoraChanNum; i++)
  chanToHzTable.push(chanToMHz(i))

export function chanToHex(c: number) {
  let res = Buffer.from([23])[0].toString(16)
  if (res.length < 2)
    res = "0" + res
  return res
}

////////////:
/// air datarate

export const airDataRates = new Array<number>(0.3, 1.2, 2.4, 4.8, 9.6, 19.2)

export const defaultAirDataRateIdx = 3




//////////////////////
// messages

export enum MessageType { SYNC = 1, PING, PONG, ACTIVATE, DISABLE_AGENDA } // should be less than 15  (4octets) to allow  next 4 octets to be filled by destId (query messages)



// const numBytesForSeconds = 3
// const numBytesForday = 2
import { Buffer } from 'buffer';
import { dateToStr } from './ScheduleTypes'

function getStartOfYear(d: Date) {
  const ref = new Date(d)
  ref.setMonth(0, 1)
  ref.setHours(0, 0, 0, 0)
  return ref;
}
export function dateToBuffer(d: Date) {
  const strToSend = dateToStr(d);
  const buf = Buffer.from(strToSend);
  return buf
}

export function dateStrFromBuffer(b: Buffer, offset = 0): string {
  let str = b.toString('utf-8', offset);
  str.trimEnd()
  if (str.length && str.charCodeAt(str.length - 1) == 0) {
    str = str.substring(0, str.length - 1);
  }
  return str;

}

const testDate = new Date()
testDate.setMilliseconds(0)
const expectEqual = dateStrFromBuffer(dateToBuffer(testDate))
if (dateToStr(testDate) != expectEqual) {
  console.error(expectEqual)
  console.error(testDate)
  // console.error(testDate.getTime() - expectEqual.getTime())
  throw new Error("buffer are bugged")
}
// console.warn(Buffer.from("l").length)
// console.warn("OKkkkkkkkkkkkkk", testDate, expectEqual);

export function createBufferMessageType(msgTypeByte: MessageType, payload: Buffer) {
  return Buffer.concat([Buffer.from([msgTypeByte]), payload])
}


export function getTypeOfMessage(b: Buffer): MessageType | undefined {
  return b[0]
}


export const minDelayForResp = 400;
export const minDelayForSend = 400;

export function getNumInPing(intervalMs: number) {
  const intervalForResp = intervalMs - minDelayForSend - 400;
  if (intervalForResp <= 0) throw new Error("invalid ping time");
  return Math.floor(intervalForResp / minDelayForResp);
}


export function getTotalPingTimeRoundTrip(intervalMs: number, numDev: number) {
  if (numDev <= 0) return 0;
  const numInPing = getNumInPing(intervalMs);
  if (numInPing <= 0) return 0;
  const numPings = Math.ceil(numDev / numInPing);
  return numPings * intervalMs;
}
