import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState, createBufferMessageType, dateToBuffer, MessageType, dateStrFromBuffer, getTypeOfMessage, minClockUpdateInterval, minPingUpdateInterval, minDelayForResp, minDelayForSend, getNumInPing } from '../types/LoraState';
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
    isMasterServer() { return this.state.isMasterClock };
    public isSendingPing = false;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    public knownDevicesFile = appPaths.getConf().baseDir + "/knownLoraDevices.json"
    public knownLoraDevices = [] as LoraDeviceArray
    private clockSyncTimeout
    private pingSyncTimeout
    private lastPingSentTime: number
    private uuid: number

    private currentTstUids = new Array<number>();
    private currentPingIdx = 0;

    public isEndpoint = false;
    public isServer = false;


    public onTimeSync = new Array<{
        (strToSend: string): void;
    }>()

    public onActivate = new Array<{
        (b: boolean): void
    }>()

    public onDisableAgenda = new Array<{
        (b: boolean): void
    }>()

    public onPong = new Array<{
        (time: number, id: number, data: number): void
    }>()



    public getActiveState = () => {
        dbg.error("should be overriden by endpoint")
        return false;
    }
    public getAgendaDisabled = () => {
        dbg.error("should be overriden by endpoint")
        return false;
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
        dbg.log("[lora] loding lora devices", o)
        if (!validateLoraDevices(o, true)) {
            dbg.error("received incomplete lora devices", o)
        }
        this.knownLoraDevices = new Array<LoraDeviceInstance>()
        Object.values(o).map(e => this.knownLoraDevices.push(LoraDeviceInstance.create(e)))

    }


    getLoraDeviceFromUuid(uuid: number) {
        for (const d of this.knownLoraDevices)
            if (LoraDeviceInstance.getUuid(d) === uuid)
                return d

    }


    // Pings
    scheduleNextPingMsg() {
        if (!this.isServer) return;
        const nextTimeout = this.state.pingUpdateIntervalSec >>> 0
        // dbg.log("[lora] master Clock scheduling next", nextTimeout)
        if (nextTimeout < minPingUpdateInterval) {
            dbg.error("[lora] invalid timeout", this.state.pingUpdateIntervalSec)
            return
        }
        if (this.pingSyncTimeout)
            clearTimeout(this.pingSyncTimeout)
        this.pingSyncTimeout = setTimeout(this.sendOnePingMsg.bind(this), nextTimeout * 1000)
    }


    sendOnePingMsg() {
        if (!this.isServer) return;
        if (!this.state.isActive || !this.isSendingPing) {
            dbg.error("[lora] should not send ping stopping...");
            clearTimeout(this.pingSyncTimeout)
            return
        }
        // send
        dbg.log("[lora] masterClk sending message ping")
        const syncPoint = new Date();

        if (this.knownLoraDevices?.length) {
            let numInPing = getNumInPing(this.state.pingUpdateIntervalSec * 1000);
            numInPing = Math.min(numInPing, this.knownLoraDevices.length)
            // dbg.log("[lora] numSlotsForPing ", numInPing)
            this.currentTstUids = new Array<number>();
            const startPingMs = Date.now();
            for (let i = 0; i < numInPing; i++) {
                this.currentPingIdx = (this.currentPingIdx + 1) % this.knownLoraDevices.length
                const dev = this.knownLoraDevices[this.currentPingIdx];
                if (!dev) {
                    dbg.error("[lora] device not found for ", this.currentPingIdx)
                }
                else {
                    this.currentTstUids.push(LoraDeviceInstance.getUuid(dev))
                    dev._pingTimeWithOffset = new Date(startPingMs + i * minDelayForResp)
                    dbg.warn("[lora] will ping ", dev.deviceType, dev.deviceNumber, "faking : ", dev._pingTimeWithOffset)
                }
            }
            const centiSec = Math.ceil(minDelayForResp / 10);
            const prelude = [this.getAgendaDisabled() ? 1 : 0];
            const syncMsg = createBufferMessageType(MessageType.PING, Buffer.from([...prelude, centiSec, ...this.currentTstUids]));
            this.lastPingSentTime = new Date().getTime()
            this.sendBufToLora(syncMsg)
        }

        if (!isPi) // local tests
        {
            const pongChain = () => {
                const pongUuid = this.currentTstUids.shift();
                if (pongUuid) {
                    setTimeout(() => {
                        this.processLoraMsg(Buffer.from([MessageType.PONG, pongUuid, false]))
                    }, 1000);
                }
            }
            pongChain();


        }
        // schedule next
        this.scheduleNextPingMsg()
    }

    // MasterClock
    scheduleNextClockSync() {
        if (!this.isServer) return;
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
        if (!this.isServer) return;
        if (!this.state.isActive || !this.state.isMasterClock) {
            dbg.error("[lora] should not send clock stopping...");
            clearTimeout(this.clockSyncTimeout)
            return
        }
        // send
        dbg.log("[lora] masterClk sending message tick")
        const syncPoint = new Date();
        let syncMsg = createBufferMessageType(MessageType.SYNC, dateToBuffer(syncPoint))
        this.sendBufToLora(syncMsg)
        if (!isPi) // local tests
        {
            this.processLoraMsg(syncMsg)
            dbg.log("[lora] should have been", syncPoint.toLocaleString())
        }
        // schedule next
        this.scheduleNextClockSync()
    }


    sendDisableAgenda(shouldDisable: boolean) {
        let syncMsg = createBufferMessageType(MessageType.DISABLE_AGENDA, Buffer.from([shouldDisable ? 1 : 0]));
        this.sendBufToLora(syncMsg)
    }

    processLoraMsg(buf: Buffer) {
        dbg.log("[lora] new msg");
        if (buf.length === 0) { dbg.error("[lora] rcvd empty msg"); return }

        const headByte = buf[0]
        if (headByte == MessageType.SYNC) {

            const strToSend = dateStrFromBuffer(buf, 1);
            // set local time
            sys.setFromDatestring(strToSend);
            // notify
            this.onTimeSync.map(fn => fn(strToSend));
        }
        else if (headByte == MessageType.PING) {
            let curIdx = 1;
            if (buf.length - curIdx < 2)
                dbg.error("[lora] invalid ping message")
            const isAgendaDisabled = !!buf[curIdx]
            this.onDisableAgenda.map(f => f(isAgendaDisabled));
            curIdx++;
            const slotDelayMs = buf[curIdx] * 10
            curIdx++
            let slotId = -1
            for (let i = curIdx; i < buf.length; i++) {
                if (buf[i] == this.uuid)
                    slotId = i - curIdx;
            }
            if (slotId >= 0) {
                const delay = slotId * slotDelayMs
                if (delay >= 0 && delay < 4000) {
                    dbg.log("[lora] got ping send pong delayed :", delay)
                    setTimeout(() => {
                        this.sendBufToLora(Buffer.from([MessageType.PONG, this.uuid, this.getActiveState()]))
                    }, delay);
                }
                else
                    dbg.error("got weird delay", delay);
            }
            else {
                dbg.log("[lora] pingin someone else", Array.from(buf.slice(3)))
            }
        }
        else if (headByte == MessageType.PONG) {
            dbg.log("[lora] got PONG from ", LoraDeviceInstance.getDescFromUuid(buf[1]))
            if (this.isServer) {
                const uuid = buf[1]
                const data = buf[2]
                let dt = new Date().getTime() - this.lastPingSentTime;

                const knownPinged = this.getLoraDeviceFromUuid(uuid)
                if (knownPinged) {
                    dt = new Date().getTime() - knownPinged._pingTimeWithOffset.getTime();
                }
                else { dbg.error("[lora] ping from uknown pi") };
                this.onPong.map(fn => fn(dt, uuid, data))
            }


            // if (this.triggerAckCb) this.triggerAckCb();
        }
        else if (headByte == MessageType.ACTIVATE) {
            const uuid = buf[1]
            const data = buf[2]
            if ((uuid == this.uuid) || (uuid == 255))
            {
                this.onActivate.map(fn => fn(!!data));
                if (this.isEndpoint && !this.isMasterServer() && (uuid != 255))
                    this.sendBufToLora(Buffer.from([MessageType.PONG, this.uuid, this.getActiveState()]))
            }

        }
        else if (headByte == MessageType.DISABLE_AGENDA) {
            const data = buf[1]
            this.onDisableAgenda.map(fn => fn(!!data))
        }
        else {
            // dbg.log("lora type", getTypeOfMessage(buf))
            dbg.error("[lora] unknown message", buf)
        }
    }

    sendActivate(b: boolean, uuid?: number) {
        if (uuid === undefined) uuid = 255
        console.log("[lora] will send activate ", b, uuid)
        // mark as pinged
        const dev = this.knownLoraDevices.find(e => LoraDeviceInstance.getUuid(e) == uuid);
        if (!dev) {
            if (uuid != 255)
                dbg.error("[lora] device not found for ", uuid)
        } else
            dev._pingTimeWithOffset = new Date()

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
