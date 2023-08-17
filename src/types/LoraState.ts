
export interface LoraState {
  isActive: boolean
  isMasterClock: boolean
  uuid: number
  channel: number
  speed: number
  fec: boolean
}

export class DefaultLoraState implements LoraState {
  public isActive = false;
  public isMasterClock = false;
  public uuid = 0;
  public channel = defaultLoraChan;
  public speed = defaultAirDataRateIdx;
  public fec = true;
}

export function validateLoraState(s: LoraState, fillWithDefaults = false) {
  console.log('checking', s)
  const validErr = (pn: string) => {
    console.error("got lora valid error", pn, s[pn])
    if (fillWithDefaults)
      s[pn] = new DefaultLoraState()[pn]

    return false
  }
  for (const n of ['isActive', 'isMasterClock', 'uuid', 'channel', 'speed', 'fec']) {
    console.log("check defined", n, s[n])
    if (s[n] === undefined)
      return validErr(n)
  }

  s.uuid = parseInt('' + s.uuid)
  if ((s.uuid < 0) || (s.uuid >= loraUuids.length))
    return validErr('uuid')

  s.channel = parseInt('' + s.channel)
  if ((s.channel < 0) || (s.channel > 31))
    return validErr('channel')

  s.speed = parseInt('' + s.speed)
  if ((s.speed < 0) || (s.speed >= airDataRates.length))
    return validErr('speed')



  return true

}


////////////:
/// channels
export const defaultLoraChan = 23;
export const maxLoraChanNum = (2 ** 5) - 1

export function chanToHz(c: number) {
  const chan = Math.round((c / maxLoraChanNum) * 54)
  return 160 + chan * .250
}

export const chanToHzTable = new Array<number>()

for (let i = 0; i < maxLoraChanNum; i++)
  chanToHzTable.push(chanToHz(i))

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


////////////////
// uuids

export const loraUuids = new Array<number>(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)

