import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';
import * as uConf from '../userConf'
import * as sys from '../sysUtils'
import { isAndroid, isOSX, isPi } from '../platformUtil';
import * as appPaths from '../filePaths'
import { exec, execSync } from 'child_process';
import { LoraState, DefaultLoraState, validateLoraState, createBufferMessageType, dateToBuffer, MessageType, dateStrFromBuffer, strFromBuffer, readUntilNull, getTypeOfMessage, minClockUpdateInterval, minPingUpdateInterval, minDelayForResp, minDelayForSend, getNumInPing } from '../types/LoraState';
import { LoraDevice, LoraDeviceFile, LoraDeviceArray, validateLoraDevices, LoraDeviceInstance, LoraTypeNames, LoraDeviceType } from '../types/LoraDevice'
import fs from 'fs'
import * as lora from './LoraModuleHelpers'
import * as loraHelp from './LoraStructHelpers'
import * as Express from 'express'
import { Groups, dateToStr } from '../types';
import * as zlib from 'zlib';
import { createHash } from 'crypto'


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
        // dbg.error('[app]  no known device for ', fullDescStr)
        return;
    }
    const appFilePaths = appPaths.getConf();
    const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {}) as Groups
    const curGroupObj = groups[curDev.group]
    if (!curGroupObj) {
        // dbg.error('[app]  no known group for  ignore checking agenda', fullDescStr)
        return;
    }

    return curGroupObj;
}


export function getAgendaForUuid(uuid: number) {
    const appFilePaths = appPaths.getConf();
    const knownDevices = (appPaths.getFileObj(appFilePaths.knownLoraDevicesFile) || {}) as LoraDeviceFile
    const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {}) as Groups
    const fullDescStr = JSON.stringify(LoraDeviceInstance.getDescFromUuid(uuid));
    const curDev = knownDevices.find(d => LoraDeviceInstance.getUuid(d) == uuid)
    if (!curDev) {
        dbg.error('[app] onLoraPong no known device for ', fullDescStr)
        return;
    }

    const curGroupObj = groups[curDev.group]
    if (!curGroupObj) {
        dbg.error('[app] onLoraPong no known group for  ignore checking agenda', fullDescStr)
        return;
    }

    let agendaName = curGroupObj.agendaFileName
    if (!agendaName.endsWith('.json')) agendaName += '.json'
    const agendaPath = appFilePaths.agendasFolder + "/" + agendaName
    if (!fs.existsSync(agendaPath)) {
        dbg.error('[app] onLoraPong no known path for agenda', agendaPath)
        return;
    }
    let isAgendaInSync = false;//Math.random() > .5 ? true : false;
    try {
        return fs.readFileSync(agendaPath).toString()
    } catch (e) {
        console.error("can't check agenda on lora dev", fullDescStr, e);
    }
}

function getAgendaMsgForName(agendaName: string): string {
    const appFilePaths = appPaths.getConf();

    if (!agendaName.endsWith('.json')) agendaName += '.json'
    const agendaPath = appFilePaths.agendasFolder + "/" + agendaName
    if (!fs.existsSync(agendaPath)) {
        dbg.error('[app] getAgendaMsgForName no known path for agenda')
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


const FileRcv = new loraHelp.FileRcvT();
const pingableList = new loraHelp.PingableList();
class LoraModule extends lora.LoraSockIface {


    confWatcher: ConfFileWatcher;
    knownDevicesWatcher: ConfFileWatcher;
    public state: LoraState;
    isMasterServer() { return this.state.isMasterClock };
    public isSendingPing = true;
    public loraIsDisablingWifi = true;
    public confFile = appPaths.getConf().baseDir + "/lora.json"
    public knownDevicesFile = appPaths.getConf().baseDir + "/knownLoraDevices.json"
    public knownLoraDevices = [] as LoraDeviceArray
    public deviceAreSyncedFromWifi = true
    private clockSyncTimeout
    private pingSyncTimeout
    private lastPingSentTime: number
    private uuid: number

    private currentTstUids = new Array<number>();
    private currentPingIdx = 0;
    private disablePing = false;

    public isEndpoint = false;
    public isServer = isAndroid;

    public loraIsSyncingAgendas = false;
    public loraIsCheckingAgendas = true;
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
    nextPongTimeout



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
        const num = parseInt(sys.getHostName().replace("lumestrio", "").replace("_", "").replace(" ", ""))
        this.uuid = LoraDeviceInstance.buildUuid(num, LoraDeviceType.Lumestrio);
        dbg.warn("[lora] has uuid of ", this.uuid);
        this.confWatcher = new ConfFileWatcher(this.confFile, obj => { this.parseConf(obj) }, new DefaultLoraState());
        this.knownDevicesWatcher = new ConfFileWatcher(this.knownDevicesFile, obj => { this.parseKnownDevices(obj) }, new Array<LoraDeviceInstance>());
    }

    async parseConf(o: LoraState) {
        if (!validateLoraState(o, true))
            dbg.error("received incomplete lora state", o)
        this.state = o;
        this.setServiceStartsOnBoot(!!o.isActive);
        if (this.clockSyncTimeout)
            clearTimeout(this.clockSyncTimeout)
        await this.setServiceRunning(!!o.isActive)
        if (!isPi) return
        if (!!o.isActive) {
            this.setHexConf(lora.buildHexConfFromState(this.state))
            if (!!o.isMasterClock)
                this.scheduleNextClockSync()
        }


    }

    parseKnownDevices(o: LoraDeviceFile) {
        if (!o) o = new Array<LoraDeviceInstance>()
        dbg.log("[lora] loding lora devices")
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


    setPingableState(uuid: number, v: boolean) {
        if (pingableList.setPingable("" + uuid, v) || (v && !this.pingSyncTimeout)) {
            this.pingSyncTimeout = setTimeout(() => { this.sendOnePingMsg() }, 200)// coalesce time if multiple are added
        }
    }

    scheduleNextPingMsg() {
        pingableList.removeOldOnes();
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
        return this.loraIsCheckingAgendas
    }

    shouldSendMissingPartInPong() {
        return this.loraIsSyncingAgendas;
    }

    sendOnePingMsg(oneShot = false, forceAll = false) {
        if (!this.isServer) return;

        // send
        let toPing = new Array<LoraDeviceInstance>()
        if (forceAll) {
            toPing = this.knownLoraDevices.slice()
        }
        else {
            pingableList.getKeys().map(k => {
                const n = parseInt(k)
                const d = this.getLoraDeviceFromUuid(n)
                if (d) toPing.push(d)
                else { console.error("not found pingable", k) }
            })
        }
        if (!oneShot && (!this.state.isActive || !this.isSendingPing)) {
            dbg.error("[lora] should not send ping stopping...");
            clearTimeout(this.pingSyncTimeout)
            this.pingSyncTimeout = null
            return
        }


        if (toPing.length && (!this.disablePing || oneShot)) {
            dbg.log("[lora] sending message ping")
            if (this.shouldSendMissingPartInPong()) {
                toPing = toPing.filter(p => !p._isAgendaInSync)
                dbg.warn("pinging only ", toPing.map(p => LoraDeviceInstance.getShortName(p)))
            }
            let numInPing = getNumInPing(this.state.pingUpdateIntervalSec * 1000);
            numInPing = Math.min(numInPing, toPing.length)
            // dbg.log("[lora] numSlotsForPing ", numInPing)
            this.currentTstUids = new Array<number>();
            const startPingMs = Date.now();
            for (let i = 0; i < numInPing; i++) {
                this.currentPingIdx = (this.currentPingIdx + 1) % toPing.length
                const dev = toPing[this.currentPingIdx];
                if (!dev) {
                    dbg.error("[lora] device not found for ", this.currentPingIdx)
                }
                else {
                    this.currentTstUids.push(LoraDeviceInstance.getUuid(dev))
                    dev._pingTimeWithOffset = new Date(startPingMs + i * minDelayForResp)
                    dbg.warn("[lora] will ping ", dev.deviceType, dev.deviceNumber, "faking : ", dev._pingTimeWithOffset)
                }
            }
            if (this.currentTstUids.length > 0) {

                const centiSec = Math.ceil(minDelayForResp / 10);
                let pingType = 0
                if (this.shouldSendMissingPartInPong())
                    pingType = 2;
                else if (this.shouldSendAgendaInPong())
                    pingType = 1
                const prelude = [this.getAgendaDisabled() ? 1 : 0, pingType, this.loraIsDisablingWifi ? 1 : 0];
                const pingMsg = createBufferMessageType(MessageType.PING, Buffer.from([...prelude, centiSec, ...this.currentTstUids]));
                this.lastPingSentTime = new Date().getTime()
                this.sendBufToLora(pingMsg)
            }
            else {
                dbg.warn("no ping to send");
            }
        }

        // if (!isPi) // local tests
        // {
        //     for (let i = 0; i < this.currentTstUids.length; i++) {
        //         const pongUuid = this.currentTstUids[i]
        //         if (pongUuid) {
        //             let pongMsg = Buffer.from([MessageType.PONG, pongUuid, false])
        //             if (this.shouldSendAgendaInPong()) {
        //                 const agContent = getAgendaForUuid(pongUuid)
        //                 const minObj = JSON.stringify(JSON.parse(agContent), null, 0)
        //                 let hash = createHash('md5').update(minObj).digest("hex")
        //                 pongMsg = Buffer.concat([pongMsg, Buffer.from(hash), Buffer.from([0])])
        //             }
        //             setTimeout(() => {
        //                 this.processLoraMsg(pongMsg)
        //             }, i * minDelayForResp);
        //         }
        //     }


        // }
        if (!oneShot) {
        // schedule next
            this.scheduleNextPingMsg()
        }
    }

    // MasterClock
    scheduleNextClockSync() {

        const nextTimeout = this.state.clockUpdateIntervalSec >>> 0
        // dbg.warn("schedule next clock sync in ", nextTimeout, "s")
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
        // if (!isPi) // local tests
        // {
        //     this.processLoraMsg(syncMsg)
        //     dbg.log("[lora] should have been", syncPoint.toLocaleString())
        // }
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

    async startAgendaSync(logProgress?) {
        const tryAllKnown = !!pingableList
        if (!logProgress)
            logProgress = () => { }

        this.loraIsSyncingAgendas = true;
        if (this.agendaSynInterval)
            clearTimeout(this.agendaSynInterval);
        logProgress("will start soon")
        await this.waitNoPing();
        logProgress("starting")
        const msBetweenParts = 1000;
        let agendasToSend = {};
        const allKnowns = this.knownLoraDevices
        for (const d of allKnowns) {
            const uuid = LoraDeviceInstance.getUuid(d);
            const group = getGroupForLoraDevice(d);
            if (!group) {
                dbg.error("ignoring lora dev without group", d.deviceType, d.deviceNumber);
                continue
            }
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
            if (!agStr) {
                dbg.error("error loading agenda " + nextAgName);
                logProgress("error loading agenda " + nextAgName)
                this.stopAgendaSync()
                return;
            }
            const partSize = 53
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
                if (!msgParts)
                    msgParts = []
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
                    logProgress("des agendas n'ont pas été syncrhronisés")
                    startToSendNextAg()
                    // this.disablePing = false; no need, it's in startToSendNextAg()
                    return
                }
                if (shouldAskMissing) {
                    dbg.warn("will ask missing")
                    logProgress("verification...")
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
                        if (d._missingFileParts === undefined) continue; // ignore if not updated
                        const mp = Object.values(d._missingFileParts);
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
                        const noResponseDevs = allKnowns.filter(d => d._missingFileParts === undefined);
                        if (noResponseDevs.length) {
                            dbg.warn("some device are silent")
                            logProgress("certains appareils n'ont pas pu etre mis à jour\n" + noResponseDevs.map(d => d.deviceName + " (" + LoraDeviceInstance.getShortName(d) + ")").join("\n"));
                        }
                        else {
                            dbg.warn("fully completedd starting next agenda")
                            logProgress("l'agenda est synchronisé!")
                        }
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
                        logProgress("on reverifie...")
                        shouldAskMissing = true;
                    }
                }
            }

            if (!shouldGetAgendaMissingParts) {
                dbg.warn(curIdx, msgParts.length)
                logProgress(`envoi de ${curIdx} / ${msgParts.length}`)
                if (msgParts[curIdx] != undefined) {
                    let partMsg = createBufferMessageType(MessageType.FILE_MSG, Buffer.concat([Buffer.from([curIdx]), Buffer.from(msgParts[curIdx])]));
                    this.sendBufToLora(partMsg);
                    curIdx++;
                }
                else
                    dbg.error("invalid idx", curIdx, msgParts?.length)
            }
            else {
                this.sendOnePingMsg(true, tryAllKnown);
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
        if (buf.length === 0) { dbg.error("[lora] rcvd empty msg"); return }

        const headByte = buf[0]
        dbg.log("[lora] new msg", headByte);
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
            const sendAgendaMissingParts = pingType == 2;
            curIdx++;
            const disableWifi = buf[curIdx] // ignored for raspberrys
            curIdx++;

            clearTimeout(this.nextPongTimeout)

            const slotDelayMs = buf[curIdx] * 10
            curIdx++
            let slotId = -1


            for (let i = curIdx; i < buf.length; i++) {
                if (buf[i] == this.uuid)
                    slotId = i - curIdx;
            }


            if (slotId >= 0) {
                const delay = slotId * slotDelayMs
                if (delay >= 0 && delay < 6000) {
                    let pongB = Buffer.from([MessageType.PONG, this.uuid, this.getActiveState()]);
                    if (sendAgendaMD5) {
                        let md5Buf = Buffer.from(this.getAgendaMD5())
                        md5Buf = md5Buf.slice(0, 8)
                        pongB = Buffer.concat([pongB, md5Buf, Buffer.from([0])])
                    }
                    if (sendAgendaMissingParts && FileRcv.expectedMsg > 0)
                        pongB = Buffer.concat([pongB, Buffer.from(FileRcv.getMissingIds())])
                    dbg.log("[lora] got ping send pong delayed :", delay, pongB)
                    this.nextPongTimeout = setTimeout(() => {
                        this.sendBufToLora(pongB)
                    }, delay);
                }
                else
                    dbg.error("!!!!got weird delay", delay);
            }
            else {
                dbg.log("[lora] pingin someone else", Array.from(buf.slice(curIdx)))
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
                    // dbg.error("    ", Object.keys(this.knownLoraDevices));
                    return;
                };
                if (this.shouldSendMissingPartInPong()) {
                    knownPinged._missingFileParts = Array.from(buf.slice(3));
                    dbg.warn("got remaining part missing ", knownPinged._missingFileParts)
                }
                let agendaMD5 = knownPinged._lastAgendaMD5;
                if (this.shouldSendAgendaInPong()) {
                    if (buf.length > 4) {
                        // dbg.warn("bbl", buf.length)
                        let { res, remaining } = readUntilNull(buf, 3);
                        agendaMD5 = strFromBuffer(res)
                        // dbg.warn("got md5 ", agendaMD5, agendaMD5.length, "bl", res.length)
                        if (agendaMD5)
                            knownPinged._lastAgendaMD5 = agendaMD5
                        agendaMD5 = knownPinged._lastAgendaMD5
                    }
                }

                this.onPong.map(fn => fn(dt, uuid, data, agendaMD5))
            }


            // if (this.triggerAckCb) this.triggerAckCb();
        }
        else if (headByte == MessageType.ACTIVATE) {
            const data = buf[1]
            let found = -1;
            for (let i = 2; i < buf.length; i++) {
                if (buf[i] == this.uuid || buf[i] == 255) { found = buf[i]; }
            }
            clearTimeout(this.nextPongTimeout)
            const multiActivate = found == 255 || (buf.length > 3)
            if (found != -1)
            {
                this.onActivate.map(fn => fn(!!data));
                if (this.isEndpoint && !this.isMasterServer() && !multiActivate)
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

    async waitNoPing() {
        const pingMs = (this.state.pingUpdateIntervalSec >>> 0) * 1000
        let delayBeforAct = 0
        const dtSincePing = Date.now() - this.lastPingSentTime
        if (dtSincePing >= 0 && dtSincePing <= pingMs) {
            let toWait = pingMs - (dtSincePing % pingMs)
            if (toWait < 0) { dbg.error(" invalid mod dt for act"); toWait = 0; }
            delayBeforAct = toWait + 200;
        }

        clearTimeout(this.pingSyncTimeout)
        dbg.warn("waiting end of last ping for", delayBeforAct)
        await new Promise(res => setTimeout(res, delayBeforAct))
        dbg.warn("end wait")
        // && uuids.length && !uuids.includes(255)
        // stop ping for a bit to listen resp

        setTimeout(() => {
            this.sendOnePingMsg();
        }, 300);

    }

    async sendActivate(b: boolean, uuids?: Array<number>) {
        if (uuids === undefined || !uuids.length) uuids = [255]

        if (uuids.length > 1)
            await this.waitNoPing();
        console.log("[lora]  send activate ", b, uuids)

        for (const uuid of Object.values(uuids)) {
            const dev = this.knownLoraDevices.find(e => LoraDeviceInstance.getUuid(e) == uuid);
            if (!dev) {
                if (uuid != 255)
                    dbg.error("[lora] device not found for ", uuid)
            } else
                dev._pingTimeWithOffset = new Date()
        }
        this.sendBufToLora(Buffer.from([MessageType.ACTIVATE, b, ...uuids]))

    }


    // sendActivate(b: boolean, uuids?: Array<number>) {
    //     if (uuids === undefined || !uuids.length) uuids = [255]
    //     const pingMs = (this.state.pingUpdateIntervalSec >>> 0) * 1000
    //     let delayBeforAct = 0
    //     const dtSincePing = Date.now() - this.lastPingSentTime
    //     if (dtSincePing >= 0 && dtSincePing <= pingMs) {
    //         let toWait = pingMs - (dtSincePing % pingMs)
    //         if (toWait < 0) { dbg.error(" invalid mod dt for act"); toWait = 0; }
    //         delayBeforAct = toWait + 200;
    //     }
    //     // && uuids.length && !uuids.includes(255)
    //     if (delayBeforAct > 0) {
    //         dbg.warn("disabling ping a bit")
    //         // stop ping for a bit to listen resp
    //         const noPingMs = delayBeforAct + 300;
    //         if (this.pingSyncTimeout)
    //             clearTimeout(this.pingSyncTimeout)
    //         setTimeout(() => {
    //             if (this.pingSyncTimeout)
    //                 clearTimeout(this.pingSyncTimeout)
    //             this.sendOnePingMsg();
    //         }, noPingMs);
    //     }
    //     console.log("[lora] will send activate ", b, uuids, "in ", delayBeforAct, "ms")

    //     setTimeout(() => {
    //     // mark as pinged
    //         for (const uuid of Object.values(uuids)) {
    //             const dev = this.knownLoraDevices.find(e => LoraDeviceInstance.getUuid(e) == uuid);
    //             if (!dev) {
    //                 if (uuid != 255)
    //                     dbg.error("[lora] device not found for ", uuid)
    //             } else
    //                 dev._pingTimeWithOffset = new Date()
    //         }
    //         this.sendBufToLora(Buffer.from([MessageType.ACTIVATE, b, ...uuids]))
    //     }, delayBeforAct);

    // }

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
