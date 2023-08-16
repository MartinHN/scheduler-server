import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { execSync } from 'child_process';
import { LoraState, DefaultLoraState } from '../types/LoraState';



function execOnPiOnly(cmd) {
    if (isPi)
        return execSync(cmd).toString();
    console.log('cmd would run : ' + cmd)
}

function sysctlCmd(opts: string) {
    return execOnPiOnly(`sudo systemctl ${opts} lora.service`)
}

const defaultHexConf = "C200001B2844"
function testHexConf() {
    const dS = new DefaultLoraState()
    const res = buildHexConfFromState(dS);
    if (res != defaultHexConf) {
        throw new Error("hex conf is bugyy got " + res + " insteadof " + defaultHexConf)
    }
}
testHexConf();

function buildHexConfFromState(o: LoraState) {
    //isPi ? execOnPiOnly("e32 -s | grep Settings Raw Value:") :
    //  "0xc000001b2844"// 
    let b = hexStrToBuf(defaultHexConf);
    if (b.byteLength != 6) {
        throw new Error("invalid")
    }
    const SPED = 3
    const OPTION = 5

    b = setBit(b, OPTION, 2, o.fec);

    let res = bufToHexStr(b)
    return res
}

export default class LoraModule {
    confWatcher: ConfFileWatcher;
    public state: LoraState;
    public confFile = appPaths.getConf().baseDir + "/lora.json"

    constructor(httpApp: Express.Application) {
        this.initHttpEndpoints(httpApp)
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
    }

    parseConf(o: LoraState) {
        this.state = o;
        if (this.isServiceEnabled() != !!o.isActive)
            this.activateService(!!o.isActive)
        this.setHexConf(buildHexConfFromState(this.state))
    }


    setHexConf(hex) {
        console.log("should set e32 bin conf to " + hex)
        if (hex.length != defaultHexConf.length)
            throw new Error("invalid lora config")

        this.activateService(false);
        execOnPiOnly(`e32 -w ${hex}`)
        if (this.state.isActive)
            this.activateService(true);
    }
    activateService(b: boolean) {
        uConf.setRW(true)
        sysctlCmd((b ? 'enable' : 'disable  e32.service '))
        uConf.setRW(false)
        sysctlCmd(b ? 'start' : 'stop')
    }

    isServiceEnabled() {
        if (!isPi) return this.state.isActive
        return execOnPiOnly(`systemctl status lora.service --no-pager; echo $?`).toString() === "0";
    }


    initHttpEndpoints(app) {
        app.post('/lora/state', async (req, res) => {
            const s = req.body;
            const appFilePaths = appPaths.getConf();
            if (s.isActive == undefined) {
                return false;
            }
            this.state.isActive = !!s.isActive
            this.state.isMasterClock = !!s.isMasterClock
            this.state.fec = !!s.fec
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
function dec2bin(dec) {
    let r = (dec >>> 0).toString(2);
    while ((r.length % 4) != 0)
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
