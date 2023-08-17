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
import * as lora from './LoraModuleHelpers'


export default class LoraModule {
    confWatcher: ConfFileWatcher;
    public state: LoraState;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    private confTimeout

    private csock;

    constructor(httpApp: Express.Application) {
        this.initHttpEndpoints(httpApp)
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
    }

    parseConf(o: LoraState) {
        if (!validateLoraState(o, true))
            console.error("received incomplete lora state", o)
        this.state = o;
        this.setServiceStartsOnBoot(!!o.isActive);
        if (!!o.isActive) {
            this.setHexConf(lora.buildHexConfFromState(this.state))
        }
        else {
            this.setServiceRunning(false)
        }

    }


    setHexConf(hex) {
        console.log("should set e32 bin conf to " + hex)
        if (hex.length != lora.defaultHexConf.length)
            throw new Error("invalid lora config")

        this.setServiceRunning(false);
        lora.execOnPiOnly(`e32 -w ${hex}  --in-file /dev/null`)
        if (this.state.isActive)
            this.setServiceRunning(true);

    }

    sendBufToLora(buf: Buffer) {
        if (!this.csock) {
            throw Error("[loraSock] not created")
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
        lora.sysctlCmd((b ? 'enable' : 'disable '))
        uConf.setRW(false)
    }

    setServiceRunning(b: boolean) {
        this.closeSock()
        lora.sysctlCmd(b ? 'start' : 'stop')
        if (b) {
            console.log('[loraSock] rebind sock ');
            this.csock = lora.createSock(this.processLoraMsg.bind(this))
        }
    }

    processLoraMsg(buf: Buffer) {
        console.log("new lora msg", buf.toString());
        // // send ack
        console.log("[loraSock] sendAck")
        this.sendBufToLora(buf)
    }

    isServiceRunning() {
        if (!isPi) return this.state.isActive
        return lora.execOnPiOnly(`systemctl status e32.service --no-pager; echo $?`).toString() === "0";
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
            res.send(lora.execOnPiOnly(`e32 -sv`))
        })

    }

}


