import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState } from '../types/LoraState';
import unix from "unix-dgram"
import fs from 'fs'

export function execOnPiOnly(cmd) {
    console.log('[lora] cmd will run : ' + cmd)
    if (isPi) {
        const res = execSync(cmd).toString();
        console.log("[lora] cmd resp", res)
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


export function createSock(onMessage) {
    // if (sock) { console.log("[loraSock]  force sock close"); sock.close(); sock = undefined }

    let sock = {} as any;
    sock = unix.createSocket('unix_dgram', (buf) => {
        if (!sock.isRegisteredToe32) {
            console.log('[loraSock] registered ' + buf);
            sock.isRegisteredToe32 = true;
            return
        }
        if (buf.length == 1 && buf[0] == 0) {
            // console.log('[loraSock] successfully sent message ');
            return
        }
        onMessage(buf)


    });
    if (!isPi) {
        sock.bind = () => {
            console.log("[loraOSX] would bind sock");
            sock.isRegisteredToe32 = true
        }
        sock.send = (b) => {
            console.log("[loraOSX] would send", b)
        }
        sock.close = () => {
            console.log("[loraOSX] would close")
        }
    }
    sock.on('error', (e) => {
        console.error("[loraSock] !!!! sock error", e)
        sock.isRegisteredToe32 = false

    })

    sock.on('listening', () => {
        console.log("[loraSock]  sock connected")
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
            throw new Error("csock not yet registered")
        sock.send(buf, 0, buf.length, dataSock);
    }
    const oriClose = sock.close
    sock.close = () => {
        console.log("[loraSock]  closing sock", sock.isRegisteredToe32)
        if (sock.isRegisteredToe32)
            oriClose();
        else
            console.error("[loraSock] can't close non listening sock")
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
    // console.log(v)
    let o = dec2bin(buf[byte]);
    // console.log(o)
    const lsb = 7 - bit
    o = o.substring(0, lsb) + c + o.substring(lsb + 1)
    // console.log(o)
    const nV = bin2dec(o)
    // console.log("was ", v.toString(16), "is", nV.toString(16))
    buf[byte] = nV
    return buf;
}

function setDecBits(buf, byte, from, len, value) {
    const bValue = dec2bin(value, len)
    // console.log(bValue)
    for (let i = 0; i < len; i++) {
        // console.log(i,)
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





export class LoraSockIface {
    // helper to manage socket lifetime and e32.service
    protected csock;
    // TODO, we could send hex to /run/e32.control and not restart the service
    setHexConf(hex) {
        dbg.log("should set e32 bin conf to " + hex)
        if (hex.length != defaultHexConf.length)
            throw new Error("invalid lora config")


        this.setServiceRunning(false);
        execOnPiOnly(`e32 -w ${hex}  --in-file /dev/null`)
        this.setServiceRunning(true);

    }

    processLoraMsg(buf: Buffer) {
        dbg.error("should never be called")
    }

    sendBufToLora(buf: Buffer) {
        if (!this.csock) {
            throw Error("[lora] not created")
        }
        this.csock.sendBuf(buf)
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

    setServiceRunning(b: boolean) {
        this.closeSock()
        sysctlCmd(b ? 'start' : 'stop')
        if (b) {
            dbg.log('[lora] rebind sock ');
            this.csock = createSock(this.processLoraMsg.bind(this))
        }
    }

    isServiceRunning() {
        if (!isPi) return true
        return execOnPiOnly(`systemctl status e32.service --no-pager; echo $?`).toString() === "0";
    }
}
