import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState, createBufferMessageType, dateToBuffer, MessageType, dateFromBuffer, getTypeOfMessage, minClockUpdateInterval } from '../types/LoraState';
import { LoraDevice, LoraDeviceFile, LoraDeviceArray, validateLoraDevices, LoraDeviceInstance, LoraTypeNames, LoraDeviceType } from '../types/LoraDevice'
import unix from "unix-dgram"
import fs from 'fs'
import * as lora from './LoraModuleHelpers'
import * as Express from 'express'
import { dateToStr } from '../types';


// function getKnownLoraDevices(): LoraDeviceArray {
//     const appFilePaths = appPaths.getConf();
//     const loraDs = (appPaths.getFileObj(appFilePaths.knownLoraDevicesFile) || []) as LoraDeviceFile
//     return loraDs.list || [];
// }


class LoraModule extends lora.LoraSockIface {
    confWatcher: ConfFileWatcher;
    knownDevicesWatcher: ConfFileWatcher;
    public state: LoraState;
    public isSendingTest = false;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    public knownDevicesFile = appPaths.getConf().baseDir + "/knownLoraDevices.json"
    public knownLoraDevices = [] as LoraDeviceArray
    private clockSyncTimeout
    private lastClockSentTime: number
    private uuid: number

    private currentTstUid = 25;
    private currentTstIdx = 0;

    private isEndpointOnly = false

    public onTimeSync = (d: Date) => {

    }
    public onActivate = (b: boolean) => {

    }


    public getActiveState = () => {
        return false;
    }
    public onPong = (time: number, id: number, data: number) => {

    }

    setEndpointOnly(b: boolean) {
        this.isEndpointOnly = b
    }

    constructor() {
        super()
        const num = parseInt(sys.getHostName().replace("lumestrio", ""))
        this.uuid = LoraDeviceInstance.buildUuid(num, LoraDeviceType.Lumestrio);
        dbg.warn("[lora] has uuid of ", this.uuid);
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
        this.knownDevicesWatcher = new ConfFileWatcher(this.knownDevicesFile, obj => { this.parseKnownDevices(obj) }, new Array<LoraDeviceInstance>());
    }

    parseConf(o: LoraState) {
        if (!validateLoraState(o, true))
            dbg.error("received incomplete lora state", o)
        this.state = o;
        this.setServiceStartsOnBoot(!!o.isActive);
        if (this.clockSyncTimeout)
            clearTimeout(this.clockSyncTimeout)
        this.setServiceRunning(!!o.isActive)
        if (!!o.isActive) {
            this.setHexConf(lora.buildHexConfFromState(this.state))
            if (!!o.isMasterClock)
                this.scheduleNextClockSync()
        }


    }

    parseKnownDevices(o: LoraDeviceFile) {
        if (!o) o = new Array<LoraDeviceInstance>()
        console.log("loding lora devices", o)
        if (!validateLoraDevices(o, true)) {
            dbg.error("received incomplete lora devices", o)
        }
        this.knownLoraDevices = new Array<LoraDeviceInstance>()
        Object.values(o).map(e => this.knownLoraDevices.push(LoraDeviceInstance.create(e)))

    }


    // MasterClock
    scheduleNextClockSync() {
        if (this.isEndpointOnly) return;
        const nextTimeout = this.state.clockUpdateIntervalSec >>> 0
        // dbg.log("[lora] master Clock scheduling next", nextTimeout)
        if (nextTimeout < minClockUpdateInterval) {
            dbg.error("[lora] invalid timeout", this.state.clockUpdateIntervalSec)
            return
        }
        if (this.clockSyncTimeout)
            clearTimeout(this.clockSyncTimeout)
        this.clockSyncTimeout = setTimeout(this.sendOneClockSync.bind(this), nextTimeout * 1000)
    }

    sendOneClockSync() {
        if (this.isEndpointOnly) return;
        if (!this.state.isActive || !this.state.isMasterClock) {
            dbg.error("[lora] should not send clock stopping...");
            clearTimeout(this.clockSyncTimeout)
            return
        }
        // send
        dbg.log("[lora] masterClk sending message", this.isSendingTest ? "ping" : "tick")
        const syncPoint = new Date();
        let syncMsg = createBufferMessageType(MessageType.SYNC, dateToBuffer(syncPoint))
        if (this.isSendingTest && this.knownLoraDevices?.length) {
            this.currentTstIdx = (this.currentTstIdx + 1) % this.knownLoraDevices.length
            const dev = this.knownLoraDevices[this.currentTstIdx];
            console.warn("will test ", dev?.deviceType, dev?.deviceNumber)
            if (!dev) {
                console.error("device not found for ", this.currentTstIdx)
            }
            else {
                this.currentTstUid = LoraDeviceInstance.getUuid(dev)
                syncMsg = createBufferMessageType(MessageType.PING, Buffer.from([this.currentTstUid]));
            }
        }
        this.lastClockSentTime = new Date().getTime()

        this.sendBufToLora(syncMsg)
        if (!isPi) // local tests
        {
            if (this.isSendingTest) setTimeout(() => { this.processLoraMsg(Buffer.from([MessageType.PONG, this.currentTstUid, false])) }, 1000);
            else {
                this.processLoraMsg(syncMsg)
                console.log("should have been", syncPoint.toLocaleString())
            }
        }
        // schedule next
        this.scheduleNextClockSync()
    }




    processLoraMsg(buf: Buffer) {

        if (buf.length === 0) { dbg.error("[lora] rcvd empty msg"); return }

        const headByte = buf[0]
        if (headByte == MessageType.SYNC) {
            const d = dateFromBuffer(buf, 1)
            // set local time
            const strToSend = dateToStr(d)
            sys.setFromDatestring(strToSend);
            // notify
            this.onTimeSync(d);
        }
        else if (headByte == MessageType.PING) {
            if (buf.length === 1)
                dbg.error("[lora] invalid ping message")
            if (buf[1] == this.uuid) {
                dbg.log("[lora] got ping send pong")
                this.sendBufToLora(Buffer.from([MessageType.PONG, this.uuid, this.getActiveState()]))
            }
            else {
                dbg.log("[lora] pingin someone else", buf[1])
            }
        }
        else if (headByte == MessageType.PONG) {
            dbg.log("[lora] got PONG from ", LoraDeviceInstance.getDescFromUuid(buf[1]))
            if (this.isSendingTest) {
                const uuid = buf[1]
                const data = buf[2]
                this.onPong(new Date().getTime() - this.lastClockSentTime, uuid, data)
            }


            // if (this.triggerAckCb) this.triggerAckCb();
        }
        else if (headByte == MessageType.ACTIVATE) {
            const uuid = buf[1]
            const data = buf[2]
            if ((uuid == this.uuid) || (uuid == 255))
                this.onActivate(!!data)
        }
        else {
            // dbg.log("lora type", getTypeOfMessage(buf))
            dbg.error("[lora] unknown message", buf)
        }
    }

    sendActivate(b: boolean, uuid?: number) {
        if (uuid === undefined) uuid = 255
        console.log("[lora] will send activate ", b, uuid)
        this.sendBufToLora(Buffer.from([MessageType.ACTIVATE, uuid, b]))

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


        app.get('/lora/knownDevices', (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.json(this.knownLoraDevices)
        })

        app.post('/lora/knownDevices', async (req, res) => {
            const s = req.body;
            dbg.log("got lora known devices", JSON.stringify(s))
            if (!validateLoraDevices(s, true))
                dbg.error("html sent invalid lora lora devices", req.body)


            // should trigger parseDevConf()?
            appPaths.writeFileObj(this.knownDevicesFile, s);


            res.send()
        })


        app.get('/lora/e32config', (req, res) => {
            // res.setHeader('Content-Type', 'application/json');
            res.send(lora.execOnPiOnly(`e32 -sv`))
        })



    }

}



const l = new LoraModule()
export default l;
