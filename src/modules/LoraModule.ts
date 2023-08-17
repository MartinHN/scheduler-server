import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState } from '../types/LoraState';



function execOnPiOnly(cmd) {
    console.log('cmd will run : ' + cmd)
    if (isPi)
        return execSync(cmd).toString();
    else
        execSync('sleep 1');
}

function sysctlCmd(opts: string) {
    return execOnPiOnly(`sudo systemctl ${opts} lora.service`)
}

const defaultHexConf = "C200001B2844"


function buildHexConfFromState(o: LoraState) {
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

export default class LoraModule {
    confWatcher: ConfFileWatcher;
    public state: LoraState;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    private confTimeout
    constructor(httpApp: Express.Application) {
        this.initHttpEndpoints(httpApp)
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
    }

    parseConf(o: LoraState) {
        if (!validateLoraState(o, true))
            console.error("received incomplete lora state", o)
        this.state = o;
        if (this.isServiceEnabled() != !!o.isActive)
            this.activateService(!!o.isActive)
        if (this.confTimeout)
            clearTimeout(this.confTimeout)
        this.confTimeout = setTimeout(() => this.setHexConf(buildHexConfFromState(this.state)), 1000)
    }


    setHexConf(hex) {
        console.log("should set e32 bin conf to " + hex)
        if (hex.length != defaultHexConf.length)
            throw new Error("invalid lora config")

        this.setServiceRunning(false);
        setTimeout(() => {
            if (this.isServiceEnabled())
                throw Error("e32 sevice shold be disabled!!!")
            execOnPiOnly(`e32 -w ${hex}  --in-file /dev/null`)
            if (this.state.isActive)
                this.setServiceRunning(true);
        }, 100)
    }

    activateService(b: boolean) {
        uConf.setRW(true)
        sysctlCmd((b ? 'enable' : 'disable '))
        uConf.setRW(false)
        this.setServiceRunning(b)
    }

    setServiceRunning(b: boolean) {
        sysctlCmd(b ? 'start' : 'stop  e32.service ')
    }

    isServiceEnabled() {
        if (!isPi) return this.state.isActive
        return execOnPiOnly(`systemctl status lora.service --no-pager; echo $?`).toString() === "0";
    }


    initHttpEndpoints(app) {
        app.post('/lora/state', async (req, res) => {
            const s = req.body;
            console.log("got lora state", JSON.stringify(s))
            if (!validateLoraState(s, true))
                console.error("html sent invalid lora state", req.body)

            Object.assign(this.state, s)
            // should trigger parseConf()?
            appPaths.writeFileObj(this.confFile, this.state);


            res.send()
        })

        app.get('/lora/state', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.json(this.state)
        })

        app.get('/lora/e32config', (req, res) => {
            // res.setHeader('Content-Type', 'application/json');
            res.send(execOnPiOnly(`e32 -sv`))
        })

    }

}


/////////////
// bit helpers


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
