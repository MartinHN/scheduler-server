
export type CapTypeName = 'html' | 'osc' // | 'relay' | 'audio'

// OSC
export interface OSCTrigMessage{
  address:string
  args:string[]

}
export function getDefaultOSCMsg (f?:any):OSCTrigMessage {
  if (f === undefined)f = {} as OSCTrigMessage
  return { address: f.address || '/go', args: f.args || [] }
}

export interface OSCCap{
ip:string
port:number
onMessages : OSCTrigMessage[]
offMessages : OSCTrigMessage[]
}

export function getDefaultOSCCap (f?:any):OSCCap {
  if (f === undefined)f = {} as OSCCap
  return { ip: f.ip || '127.0.0.1', port: f.port || 0, onMessages: f.onMessages || [], offMessages: f.offMessages || [] }
}

// HTML
export interface HTMLCap{
    address:string
    port?:number
}

export function getDefaultHTMLCap (f?:any):HTMLCap {
  if (f === undefined)f = {} as HTMLCap
  return { address: f.address || '' }
}

//
// default
export type CapValue = OSCCap | HTMLCap

export function getDefaultForType (t:CapTypeName) : CapValue | Record<string, unknown> {
  if (t === 'osc') {
    return getDefaultOSCCap()
  } else if (t === 'html') {
    return getDefaultHTMLCap()
  }
  return {}
}
