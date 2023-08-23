
export interface LoraState {
  isActive: boolean
  isMasterClock: boolean
  clockUpdateIntervalSec: number
  channel: number
  speed: number
  fec: boolean
}

export const minClockUpdateInterval = 3;

export class DefaultLoraState implements LoraState {
  public isActive = false;
  public isMasterClock = false;
  public clockUpdateIntervalSec = 60;
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
  for (const n of ['isActive', 'isMasterClock', 'channel', 'speed', 'fec', 'clockUpdateIntervalSec']) {
    // console.log("check defined", n, s[n])
    if (s[n] === undefined)
      return validErr(n)
  }

  s.clockUpdateIntervalSec = parseInt('' + s.clockUpdateIntervalSec)
  if (s.clockUpdateIntervalSec < minClockUpdateInterval)
    return validErr('clockUpdateIntervalSec')


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

export enum MessageType { SYNC = 1, PING, PONG, ACTIVATE } // should be less than 15  (4octets) to allow  next 4 octets to be filled by destId (query messages)



// const numBytesForSeconds = 3
// const numBytesForday = 2
import { Buffer } from 'buffer';

function getStartOfYear(d: Date) {
  const ref = new Date(d)
  ref.setMonth(0, 1)
  ref.setHours(0, 0, 0, 0)
  return ref;
}
export function dateToBuffer(d: Date) {
  // let b = new ArrayBuffer(4);
  // new DataView(b).setUint32(0, n);
  // return Buffer.from(new Uint8Array(b));
  const toSend = new Date(d)
  const ref = getStartOfYear(toSend)
  const secSinceStartYear = Math.floor((toSend.getTime() - ref.getTime()) / 1000);

  const buf = Buffer.allocUnsafe(8);
  buf.writeBigUInt64BE(BigInt(secSinceStartYear), 0);

  return buf
}

export function dateFromBuffer(b: Buffer, offset = 0): Date {
  const secSinceStartYear = b.readBigUInt64BE(offset)
  const refMillis = getStartOfYear(new Date()).getTime()
  const d = new Date(Number(secSinceStartYear) * 1000 + refMillis)

  return d
}

const testDate = new Date()
testDate.setMilliseconds(0)
const expectEqual = dateFromBuffer(dateToBuffer(testDate))
if (testDate.getTime() != expectEqual.getTime()) {
  console.error(expectEqual)
  console.error(testDate)
  console.error(testDate.getTime() - expectEqual.getTime())
  throw new Error("buffer are bugged")
}

export function createBufferMessageType(msgTypeByte: MessageType, payload: Buffer) {
  return Buffer.concat([Buffer.from([msgTypeByte]), payload])
}


export function getTypeOfMessage(b: Buffer): MessageType | undefined {
  return b[0]
}

