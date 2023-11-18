import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState, createBufferMessageType, dateToBuffer, MessageType, dateStrFromBuffer, strFromBuffer, readUntilNull, getTypeOfMessage, minClockUpdateInterval, minPingUpdateInterval, minDelayForResp, minDelayForSend, getNumInPing } from '../types/LoraState';
import { LoraDevice, LoraDeviceFile, LoraDeviceArray, validateLoraDevices, LoraDeviceInstance, LoraTypeNames, LoraDeviceType } from '../types/LoraDevice'
import unix from "unix-dgram"
import fs from 'fs'
import * as lora from './LoraModuleHelpers'
import * as Express from 'express'
import { Groups, dateToStr } from '../types';
import * as zlib from 'zlib';


function getKnownLoraDevices(): LoraDeviceArray {
    const appFilePaths = appPaths.getConf();
    const loraDs = (appPaths.getFileObj(appFilePaths.knownLoraDevicesFile) || []) as LoraDeviceFile
    return loraDs || [];
}
function getKnownLoraDeviceUuids(): Array<number> {
    return getKnownLoraDevices().map(d => LoraDeviceInstance.getUuid(d));
}

function getKnownDeviceForUuid(uuid): LoraDevice {
    return getKnownLoraDevices().find(d => LoraDeviceInstance.getUuid(d) == uuid)
}

function getGroupForLoraDevice(curDev: LoraDevice) {
    const fullDescStr = JSON.stringify(curDev);
    if (!curDev) {
        dbg.error('[app] onLoraPong no known device for ', fullDescStr)
        return;
    }
    const appFilePaths = appPaths.getConf();
    const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {}) as Groups
    const curGroupObj = groups[curDev.group]
    if (!curGroupObj) {
        dbg.error('[app] onLoraPong no known group for  ignore checking agenda', fullDescStr)
        return;
    }

    return curGroupObj;
}


function getAgendaMsgForName(agendaName: string): string {
    const appFilePaths = appPaths.getConf();

    if (!agendaName.endsWith('.json')) agendaName += '.json'
    const agendaPath = appFilePaths.agendasFolder + "/" + agendaName
    if (!fs.existsSync(agendaPath)) {
        dbg.error('[app] checkEndpointAgendaIsUpToDate no known path for agenda')
        return;
    }
    const data = fs.readFileSync(agendaPath).toString()
    try {
        return JSON.stringify(JSON.parse(data), null, 0);
    }
    catch (e) {
        dbg.error("can't parse agenda", e)
    }
}

class FileRcvT {
    parts = new Array<Buffer>()
    expectedMsg = -1;

    isValidState() {
        if (this.expectedMsg != this.parts.length) {
            dbg.error("expect mismatches", this.expectedMsg, this.parts.length)
            return false;
        }
        if (this.expectedMsg == 0) {
            dbg.error("nothing expected")
            return false;
        }

        return true;
    }
    start(numMsg: number) {
        this.parts = new Array<Buffer>()
        this.parts.length = numMsg
        this.expectedMsg = numMsg
    }
    ignore() {
        this.expectedMsg = 0;
    }
    isIgnoring() {
        return this.expectedMsg == 0;
    }

    hasAll() {
        if (!this.isValidState())
            return false;
        for (const o of this.parts)
            if (!o || o.length == 0)
                return false;
        return true;
    }
    collect() {
        if (!this.isValidState())
            return false;
        let resStr = "";
        for (const o of this.parts) {
            if (!o || o.length == 0) {
                dbg.error("invalid when collecting");
                return;
            }
            resStr += o.toString('utf-8');
        }
        resStr.trim()
        return resStr;
    }

    addPart(n: number, buf: Buffer, offset: number) {
        if (!this.isValidState())
            return;
        this.parts[n] = buf.slice(offset);
        if (this.hasAll())
            return this.collect()
    }

    getMissingIds() {
        const res = []
        if (!this.isValidState())
            return res;
        let i = 0;
        for (const o of this.parts) {
            if (!o || o.length == 0) {
                res.push(i)
            }
            i++
        }
        return res;
    }

    cleanUp() {
        this.expectedMsg = 0
    }



}

const FileRcv = new FileRcvT();
class LoraModule extends lora.LoraSockIface {


    confWatcher: ConfFileWatcher;
    knownDevicesWatcher: ConfFileWatcher;
    public state: LoraState;
    isMasterServer() { return this.state.isMasterClock };
    public isSendingPing = false;
    public loraIsDisablingWifi = true;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    public knownDevicesFile = appPaths.getConf().baseDir + "/knownLoraDevices.json"
    public knownLoraDevices = [] as LoraDeviceArray
    private clockSyncTimeout
    private pingSyncTimeout
    private lastPingSentTime: number
    private uuid: number

    private currentTstUids = new Array<number>();
    private currentPingIdx = 0;
    private disablePing = false;

    public isEndpoint = false;
    public isServer = false;

    public loraIsSyncingAgendas = false;
    public loraIsCheckingAgendas = false;
    private agendaSynInterval;


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
        (time: number, id: number, activeState: number, agendaMd5: string): void
    }>()

    public onNewFile = new Array<{
        (data: string): void
    }>()



    public getActiveState = () => {
        dbg.error("should be overriden by endpoint")
        return false;
    }
    public getAgendaMD5 = () => {
        dbg.error("should be overriden by endpoint")
        return "";
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
    shouldSendAgendaInPong() {
        return this.loraIsCheckingAgendas || this.loraIsSyncingAgendas;
    }

    sendOnePingMsg(oneShot = false) {
        if (!this.isServer) return;

        if (!oneShot && (!this.state.isActive || !this.isSendingPing)) {
            dbg.error("[lora] should not send ping stopping...");
            clearTimeout(this.pingSyncTimeout)
            this.pingSyncTimeout = null
            return
        }
        // send


        if (this.knownLoraDevices?.length && (!this.disablePing || oneShot)) {
            dbg.log("[lora] sending message ping")
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
            const prelude = [this.getAgendaDisabled() ? 1 : 0, this.shouldSendAgendaInPong() ? 1 : 0, this.loraIsDisablingWifi ? 1 : 0];
            const pingMsg = createBufferMessageType(MessageType.PING, Buffer.from([...prelude, centiSec, ...this.currentTstUids]));
            this.lastPingSentTime = new Date().getTime()
            this.sendBufToLora(pingMsg)
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
        if (!oneShot) {
        // schedule next
            this.scheduleNextPingMsg()
        }
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

    zipIt(inputString) {
        try {
            return zlib.gzipSync(inputString);
        } catch (err) {
            console.error('Compression Error:', err);
        }
    }

    stopAgendaSync() {
        if (this.agendaSynInterval)
            clearTimeout(this.agendaSynInterval);

        this.agendaSynInterval = null;
        this.disablePing = false;
        this.loraIsSyncingAgendas = false;
    }

    startAgendaSync() {
        if (this.agendaSynInterval)
            clearTimeout(this.agendaSynInterval);

        const msBetweenParts = 1000;
        let agendasToSend = {};
        const allKnowns = this.knownLoraDevices
        for (const d of allKnowns) {
            const uuid = LoraDeviceInstance.getUuid(d);
            const group = getGroupForLoraDevice(d);
            const agName = group.agendaFileName
            if (!agendasToSend[agName])
                agendasToSend[agName] = new Array();
            agendasToSend[agName].push(uuid);
            d._missingFileParts = undefined;
        }
        let msgParts = [];
        let curIdx = 0;

        let hasStartedCheck = false;
        let shouldGetAgendaMissingParts = false;
        const startToSendNextAg = () => {
            msgParts = []
            let nextAgName;
            curIdx = 0;
            shouldGetAgendaMissingParts = false;
            hasStartedCheck = false;
            this.disablePing = true;
            for (const [k, v] of Object.entries(agendasToSend))
                nextAgName = k;
            if (!nextAgName) {
                dbg.warn("all agenda have been synced");
                this.stopAgendaSync()
                return;
            }
            const uuids = agendasToSend[nextAgName]
            delete agendasToSend[nextAgName]
            const agStr = getAgendaMsgForName(nextAgName)
            const partSize = 49
            const sendZip = false;
            if (sendZip) {
                const agZip = this.zipIt(agStr);
                dbg.warn("unzipped : ", agStr.length);
                dbg.warn("zipped : ", agZip.length);
                msgParts = []
                let offset = 0;
                while (offset < agZip.length) {
                    const end = Math.min(offset + partSize, agZip.length);
                    const chunk = agZip.slice(offset, end);
                    msgParts.push(Array.from(chunk.values()));
                    offset += partSize;
                }
            } else {
                const re = new RegExp(`.{1,${partSize}}`, 'g');
                msgParts = agStr.match(re);
                // msgParts = ['{"l":1}']
            }
            dbg.warn("will send file", nextAgName, " with ", msgParts.length, "parts")
            let initMsg = createBufferMessageType(MessageType.FILE_MSG, Buffer.from([255, msgParts.length, ...uuids]))
            this.sendBufToLora(initMsg)
            this.agendaSynInterval = setTimeout(() => {
                sendNextMsg()
            }, msBetweenParts);
        }

        const maxTimeToFixInvalidAgendas = 30 * 1000;
        const checkMissingInterval = 6 * 1000;
        let shouldAskMissing = false;
        let timeFullAgendaSendEnded = -1;
        let lastCheckMissing = -1;
        let _allMissingParts = {}
        let hasRecoltedMissingParts = false;
        const sendNextMsg = () => {

            if (msgParts.length == 0) {
                this.stopAgendaSync()
                return
            }
            else if (curIdx >= msgParts.length || hasStartedCheck) {
                if (!hasStartedCheck) {
                    dbg.warn("has send first full agenda")
                    timeFullAgendaSendEnded = Date.now();
                    hasStartedCheck = true;
                    shouldAskMissing = true;
                }
                if (Date.now() - timeFullAgendaSendEnded > maxTimeToFixInvalidAgendas) {
                    dbg.error("timeout could not update")
                    startToSendNextAg()
                    // this.disablePing = false; no need, it's in startToSendNextAg()
                    return
                }
                if (shouldAskMissing) {
                    dbg.warn("will ask missing")
                    shouldAskMissing = false;
                    _allMissingParts = {}
                    for (const d of allKnowns)
                        d._missingFileParts = undefined;
                    shouldGetAgendaMissingParts = true;
                    hasRecoltedMissingParts = false;
                    lastCheckMissing = Date.now();

                }
                let allRecolted = true;
                if (!hasRecoltedMissingParts)
                    for (const d of allKnowns)
                        allRecolted &&= (d._missingFileParts !== undefined)

                // just wait
                if (!hasRecoltedMissingParts && (allRecolted || (Date.now() - lastCheckMissing > checkMissingInterval))) {
                    _allMissingParts = {}
                    for (const d of allKnowns) {
                        const mp = d._missingFileParts ? Object.values(d._missingFileParts) : [0]// fill with garbage if not updated
                        for (const i of mp) {
                            if (!_allMissingParts[i])
                                _allMissingParts[i] = 0;
                            _allMissingParts[i] = _allMissingParts[i] + 1
                        }
                    }
                    hasRecoltedMissingParts = true;
                    shouldGetAgendaMissingParts = false
                    dbg.warn("has collected", _allMissingParts)
                }

                if (hasRecoltedMissingParts) {
                    if (Object.values(_allMissingParts).length == 0) {
                        dbg.warn("fully completedd starting next agenda")
                        startToSendNextAg()
                        // this.disablePing = false; no need, it's in startToSendNextAg()
                        return
                    }
                    let min = undefined
                    let bestK = undefined
                    for (const [k, v] of Object.entries(_allMissingParts)) {
                        if (!min || v < min) {
                            min = v;
                            bestK = k
                        }
                    }

                    curIdx = parseInt(bestK);
                    delete _allMissingParts[bestK]
                    if (Object.values(_allMissingParts).length == 0) {
                        dbg.warn("will re collect")
                        shouldAskMissing = true;
                    }
                }
            }

            if (!shouldGetAgendaMissingParts) {
                dbg.warn(curIdx, msgParts.length)
                if (msgParts[curIdx] != undefined) {
                    let partMsg = createBufferMessageType(MessageType.FILE_MSG, Buffer.concat([Buffer.from([curIdx]), Buffer.from(msgParts[curIdx])]));
                    this.sendBufToLora(partMsg);
                    curIdx++;
                }
                else
                    dbg.error("invalid idx", curIdx, msgParts?.length)
            }
            else {
                this.sendOnePingMsg(true);
            }


            this.agendaSynInterval = setTimeout(() => {
                sendNextMsg()
            }, !shouldGetAgendaMissingParts ? msBetweenParts : this.state.pingUpdateIntervalSec * 1000);
        }


        startToSendNextAg();



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
            const pingType = buf[curIdx]
            const sendAgendaMD5 = pingType == 1;
            curIdx++;
            const disableWifi = buf[curIdx] // ignored for raspberrys
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
                    let pongB = Buffer.from([MessageType.PONG, this.uuid, this.getActiveState()]);
                    if (sendAgendaMD5) {
                        pongB = Buffer.concat([pongB, Buffer.from(this.getAgendaMD5()), Buffer.from([0])])
                        if (FileRcv.expectedMsg > 0)
                            pongB = Buffer.concat([pongB, Buffer.from(FileRcv.getMissingIds())])
                    }
                    dbg.log("[lora] got ping send pong delayed :", delay, pongB)
                    setTimeout(() => {
                        this.sendBufToLora(pongB)
                    }, delay);
                }
                else
                    dbg.error("!!!!got weird delay", delay);
            }
            else {
                dbg.log("[lora] pingin someone else", Array.from(buf.slice(3)))
            }
        }
        else if (headByte == MessageType.PONG) {
            if (!this.isSendingPing)
                return; //ignore pongs
            dbg.log("[lora] got PONG from ", LoraDeviceInstance.getDescFromUuid(buf[1]))
            if (this.isServer) {
                const uuid = buf[1]
                const data = buf[2]
                let dt = new Date().getTime() - this.lastPingSentTime;

                const knownPinged = this.getLoraDeviceFromUuid(uuid)
                if (knownPinged) {
                    dt = new Date().getTime() - knownPinged._pingTimeWithOffset.getTime();
                }
                else {
                    dbg.error("[lora] ping from uknown pi", LoraDeviceInstance.getDescFromUuid(uuid))
                    dbg.error("    ", this.knownLoraDevices);
                };
                let agendaMD5 = "";
                if (buf.length > 4) {
                    dbg.warn("bbl", buf.length)
                    let { res, remaining } = readUntilNull(buf, 3);
                    agendaMD5 = strFromBuffer(res)
                    dbg.warn("got md5 ", agendaMD5, agendaMD5.length, "bl", res.length)
                    if (knownPinged) {
                        if (agendaMD5)
                            knownPinged._lastAgendaMD5 = agendaMD5
                        agendaMD5 = knownPinged._lastAgendaMD5
                        knownPinged._missingFileParts = [...Array.from(remaining)]
                        dbg.warn("got remaining part missing ", knownPinged._missingFileParts)
                    }
                }

                this.onPong.map(fn => fn(dt, uuid, data, agendaMD5))
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
        else if (headByte == MessageType.FILE_MSG) {
            const msgNumber = buf[1]
            if (msgNumber == 255) {
                const numToExpect = buf[2]
                let found = false;
                for (let i = 3; i < buf.length; i++) {
                    if ((buf[i] == this.uuid) || (buf[i] == 255))
                        found = true
                }
                if (found)
                    FileRcv.start(numToExpect);
                else
                    FileRcv.ignore();
            }
            else if (!FileRcv.isIgnoring()) {

                const fullMsg = FileRcv.addPart(msgNumber, buf, 2);
                if (fullMsg) {
                    dbg.log("==============")
                    dbg.log(fullMsg)
                    dbg.log("--------------")
                    this.onNewFile.map(f => f(fullMsg))
                    FileRcv.cleanUp()
                }
            }
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
            // const stripped = {};
            // for (const [k, v] of Object.entries(this.knownLoraDevices))
            //     if (!k.startsWith("_"))
            //         stripped[k] = v
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
