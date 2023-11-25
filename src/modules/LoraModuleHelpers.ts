import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isAndroid, isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState } from '../types/LoraState';
import wsClient from '../lib/wsCli'
import fs from 'fs'
import cobs from 'cobs'


const useWSLoraProxy = !isPi
export function execOnPiOnly(cmd) {
    dbg.log('[lora] cmd will run : ' + cmd)
    if (isPi) {
        const res = execSync(cmd).toString();
        dbg.log("[lora] cmd resp", res)
        return res
    }
    else
        execSync('sleep 1');
}

export function sysctlCmd(opts: string) {
    return execOnPiOnly(`sudo systemctl ${opts} e32.service`)
}





const clientSock = "/home/pi/e32.rx.data"
const dataSock = "/run/e32.data"


export async function createSock(onMessage) {
    // if (sock) { dbg.log("[loraSock]  force sock close"); sock.close(); sock = undefined }
    if (useWSLoraProxy) {
        dbg.warn('starting lora ws proxy');
        wsClient.init((m) => {

            if (m.addr != "loraMsg") {
                dbg.warn("ignore lora ws message", m.addr, typeof m)
                return;
            }
            if (!m.args) {
                dbg.error("invalid lora ws message", m)
                return;
            }
            // dbg.warn("got lora ws message", m)
            if (m.args.type !== 'Buffer' || !m.args.data) {
                dbg.error("invalid message from lora ws", m)
                return
            }
            const buf = Buffer.from(m.args.data);
            if (buf.length == 1) {
                if (buf[0] != 0)
                    dbg.error('[loraWebSock] got error', buf[0]);
                return
            }
            onMessage(buf)
        }, (isConnected) => {
            dbg.warn('[loraWebSock] isConnected', isConnected)
        })
        return;
    }
    let sock = {} as any;

    const unix = (await import("unix-dgram")).default
    sock = unix.createSocket('unix_dgram', (buf) => {
        if (!sock.isRegisteredToe32) {
            dbg.log('[loraSock] registered ' + buf);
            sock.isRegisteredToe32 = true;
            return
        }
        if (buf.length == 1) {
            if (buf[0] != 0)
                dbg.error('[loraSock] got error', buf[0]);
            return
        }
        onMessage(buf)
    });
    if (!isPi) {
        sock.bind = () => {
            dbg.log("[loraOSX] would bind sock");
            sock.isRegisteredToe32 = true
        }
        sock.send = (b) => {
            dbg.log("[loraOSX] would send", b)
        }
        sock.close = () => {
            dbg.log("[loraOSX] would close")
        }
    }
    sock.on('error', (e) => {
        dbg.error("[loraSock] !!!! sock error", e)
        sock.isRegisteredToe32 = false
    })

    sock.on('listening', () => {
        dbg.log("[loraSock]  sock connected")
        sock.isRegisteredToe32 = true;
        // register to e32
        const buf = Buffer.from('')
        sock.send(buf, 0, buf.length, dataSock);
    })
    sock.isRegisteredToe32 = false
    uConf.setRW(true)

    if (fs.existsSync(clientSock))
        fs.unlinkSync(clientSock)
    sock.bind(clientSock);
    uConf.setRW(false)

    sock.sendBuf = (buf: Buffer) => {
        if (!sock.isRegisteredToe32)
        {
            dbg.error("csock not yet registered")
            return
        }
        sock.send(buf, 0, buf.length, dataSock);
    }
    const oriClose = sock.close
    sock.close = () => {
        dbg.log("[loraSock]  closing sock", sock.isRegisteredToe32)
        if (sock.isRegisteredToe32) {
            try {
                oriClose();
            }
            catch (e) {
                dbg.error("[loraSock] error closing socket", e)
            }
        }
        else
            dbg.error("[loraSock] can't close non listening sock")
        sock.isRegisteredToe32 = false;
    }
    return sock;
}

/////////////
// bit helpers

export const defaultHexConf = "C200001B2844"


export function buildHexConfFromState(o: LoraState) {
    //isPi ? execOnPiOnly("e32 -s | grep Settings Raw Value:") :
    //  "0xc000001b2844"// 
    if (!validateLoraState(o))
        throw new Error("invalid state")
    let b = hexStrToBuf(defaultHexConf);
    if (b.byteLength != 6) {
        throw new Error("invalid")
    }
    const SPED = 3
    const CHAN = 4
    const OPTION = 5



    b = setDecBits(b, SPED, 0, 3, o.speed)
    b = setDecBits(b, CHAN, 0, 6, o.channel)
    b = setBit(b, OPTION, 2, o.fec);

    let res = bufToHexStr(b)
    return res
}

function hexStrToBuf(s) {
    return Buffer.from(s, 'hex')

}
function bufToHexStr(b: Buffer) {
    let res = ""
    for (let i = 0; i < b.length; i++) {
        let c = b[i].toString(16).toUpperCase()
        if (c.length < 2) c = "0" + c
        res += c
    }

    return res
}
function dec2bin(dec, alignMod = 4) {
    let r = (dec >>> 0).toString(2);
    while (alignMod > 0 && ((r.length % alignMod) != 0))
        r = "0" + r
    return r;
}

function bin2dec(bin) {
    return parseInt(bin, 2);
}

function setBit(buf, byte, bit, value) {
    const c = !!value ? "1" : "0"
    const v = buf[byte];
    // dbg.log(v)
    let o = dec2bin(buf[byte]);
    // dbg.log(o)
    const lsb = 7 - bit
    o = o.substring(0, lsb) + c + o.substring(lsb + 1)
    // dbg.log(o)
    const nV = bin2dec(o)
    // dbg.log("was ", v.toString(16), "is", nV.toString(16))
    buf[byte] = nV
    return buf;
}

function setDecBits(buf, byte, from, len, value) {
    const bValue = dec2bin(value, len)
    // dbg.log(bValue)
    for (let i = 0; i < len; i++) {
        // dbg.log(i,)
        buf = setBit(buf, byte, from + i, bValue.charAt(len - 1 - i) == "1")
    }
    return buf
}

function testHexConf() {
    const dS = new DefaultLoraState();
    const res = buildHexConfFromState(dS);
    if (res != defaultHexConf) {
        throw new Error("hex conf is bugyy got " + res + " insteadof " + defaultHexConf);
    }
}
testHexConf();




function readUntilNull(buffer, offset = 0) {
    let nullIndex = -1;
    for (let i = offset; i < buffer.length; i++) {
        if (buffer[i] === 0) {
            nullIndex = i;
            break;
        }
    }
    if (nullIndex !== -1) {
        const res = buffer.slice(offset, nullIndex); // Extract data until '\0'
        const remaining = buffer.slice(nullIndex + 1); // Extract remaining data after '\0'
        return { res, remaining };
    }
    dbg.error("!!!!weird buffer not ending with zero");
    return { res: buffer, remaining: Buffer.from([]) }; // Return original buffer if '\0' not found
}


let wsProxyCallback;
export function setWsProxyCallback(cb: (b: Buffer) => void) {
    wsProxyCallback = cb
}
export class LoraSockIface {
    // helper to manage socket lifetime and e32.service
    protected csock = undefined;
    // TODO, we could send hex to /run/e32.control and not restart the service
    setHexConf(hexStr) {
        dbg.log("will set e32 bin conf to " + hexStr)
        if (hexStr.length != defaultHexConf.length)
            throw new Error("invalid lora config")


        // this.setServiceRunning(false);
        // execOnPiOnly(`e32 -w ${hexStr}  --in-file /dev/null`)
        // this.setServiceRunning(true);

        if (!this.csock)
            throw new Error("can not config on unconnected sock")
        const buf = hexStrToBuf(hexStr)
        this.csock.send(buf, 0, buf.length, "/run/e32.control");
    }

    processLoraMsg(buf: Buffer) {
        dbg.error("should never be called")
    }

    sendBufToLora(buf: Buffer) {
        if (useWSLoraProxy) {
            wsClient.send(buf)
            return;
        }
        if (!this.csock) {
            throw Error("[lora] not created")
        }
        // dbg.warn("pre cobs", Array.from(buf));
        const cobsBuf = Buffer.concat([cobs.encode(buf), Buffer.from([0])]);
        // dbg.warn("cobs", Array.from(cobsBuf));
        this.csock.sendBuf(cobsBuf)
    }

    closeSock() {
        if (this.csock) {
            this.csock.close()
            this.csock = undefined
        }
    }

    setServiceStartsOnBoot(b: boolean) {
        uConf.setRW(true)
        sysctlCmd((b ? 'enable' : 'disable '))
        uConf.setRW(false)
    }

    async setServiceRunning(b: boolean) {

        // sysctlCmd(b ? 'start' : 'stop')
        if (b == !!this.csock) return

        if (b) {
            dbg.log('[lora] rebind sock ');
            this.csock = await createSock((buf) => {
                while (buf && buf.length) {
                    if (buf.length && buf[buf.length - 1] != 0) {
                        dbg.error('discard buffer not ended with zero', buf)
                        break;
                    }
                    const { res, remaining } = readUntilNull(buf)
                    if (wsProxyCallback) {
                        wsProxyCallback(Buffer.concat([res, Buffer.from([0])]));
                    }
                    // dbg.warn("incoming lora msg size", res.length, "remaining", remaining.length)
                    const decoded = cobs.decode(res);
                    this.processLoraMsg(decoded)
                    buf = remaining
                }
            })
        }
        else {
            this.closeSock()
        }
    }

    isServiceRunning() {
        if (!isPi) return true
        return execOnPiOnly(`systemctl status e32.service --no-pager; echo $?`).toString() === "0";
    }
}

