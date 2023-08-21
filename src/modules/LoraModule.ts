import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState, createBufferMessageType, dateToBuffer, MessageType, dateFromBuffer, getTypeOfMessage } from '../types/LoraState';
import unix from "unix-dgram"
import fs from 'fs'
import * as lora from './LoraModuleHelpers'
import * as Express from 'express'



class LoraModule extends lora.LoraSockIface {
    confWatcher: ConfFileWatcher;
    public state: LoraState;
    public isSendingTest = false;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    private clockSyncTimeout
    private lastClockSentTime: number

    public onTimeSync = (d: Date) => {

    }
    public onActivate = (b: boolean) => {

    }
    public onTestRoundTrip = (n: number) => {

    }


    constructor() {
        super()
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
    }

    parseConf(o: LoraState) {
        if (!validateLoraState(o, true))
            dbg.error("received incomplete lora state", o)
        this.state = o;
        this.setServiceStartsOnBoot(!!o.isActive);
        if (this.clockSyncTimeout)
            clearTimeout(this.clockSyncTimeout)
        if (!!o.isActive) {
            this.setHexConf(lora.buildHexConfFromState(this.state))
            if (!!o.isMasterClock)
                this.scheduleNextClockSync()
        }
        else {
            this.setServiceRunning(false)
        }

    }


    // MasterClock
    scheduleNextClockSync() {
        const nextTimeout = this.state.clockUpdateIntervalSec >>> 0
        // dbg.log("[lora] master Clock scheduling next", nextTimeout)
        if (nextTimeout < 5) {
            dbg.error("[lora] invalid timeout", this.state.clockUpdateIntervalSec)
            return
        }
        if (this.clockSyncTimeout)
            clearTimeout(this.clockSyncTimeout)
        this.clockSyncTimeout = setTimeout(this.sendOneClockSync.bind(this), nextTimeout * 1000)
    }

    sendOneClockSync() {
        if (!this.state.isActive || !this.state.isMasterClock) {
            dbg.error("[lora] should not send clock stopping...");
            clearTimeout(this.clockSyncTimeout)
            return
        }
        // send
        dbg.log("[lora] masterClk sending message Tick")
        const syncPoint = new Date();
        const syncMsg = createBufferMessageType(this.isSendingTest ? MessageType.TST : MessageType.SYNC, dateToBuffer(syncPoint))
        this.lastClockSentTime = new Date().getTime()
        this.sendBufToLora(syncMsg)
        if (!isPi) // local tests
        {
            if (this.isSendingTest) setTimeout(() => { this.processLoraMsg(Buffer.from([MessageType.ACK])) }, 1000);
            else {
                this.processLoraMsg(syncMsg)
                console.log("should have been", syncPoint.toLocaleString())
            }
        }
        // schedule next
        this.scheduleNextClockSync()
    }


    // // triggerAckCb: Function;
    // testMsgSendTime: Date
    // sendTestMessage(b: Buffer, timeOut: number) {
    //     const tstMsg = createBufferMessageType(MessageType.TST, b)
    //     this.testMsgSendTime = new Date()
    //     this.sendBufToLora(tstMsg)
    //     // return new Promise<void>((resolve, reject) => {
    //     //     const to = setTimeout(() => { this.triggerAckCb = undefined; reject() }, timeOut);
    //     //     this.triggerAckCb = () => { clearTimeout(to); resolve() };
    //     // })
    // }


    processLoraMsg(buf: Buffer) {
        dbg.log("new lora msg", buf.toString());
        if (buf.length === 0) { dbg.error("[lora] rcvd empty msg"); return }
        dbg.log("lora type", getTypeOfMessage(buf))
        const headByte = buf[0]
        if (headByte == MessageType.SYNC) {
            const d = dateFromBuffer(buf, 1)
            this.onTimeSync(d);
        }
        else if (headByte == MessageType.TST) {
            dbg.log("[lora] sendAck for tst")
            this.sendBufToLora(Buffer.from([MessageType.ACK]))
        }
        else if (headByte == MessageType.ACK) {
            dbg.log("[lora] got ACK")
            if (this.isSendingTest)
                this.onTestRoundTrip(new Date().getTime() - this.lastClockSentTime)


            // if (this.triggerAckCb) this.triggerAckCb();
        }
    }

// HTTP

    initHttpEndpoints(app: Express.Application) {
        app.post('/lora/state', async (req, res) => {
            const s = req.body;
            dbg.log("got lora state", JSON.stringify(s))
            if (!validateLoraState(s, true))
                dbg.error("html sent invalid lora state", req.body)

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



const l = new LoraModule()
export default l;
