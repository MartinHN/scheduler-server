export class Looper {

    isPlaying = false
    loopTimeMs = 10000;
    updateResolutionMs = 500;
    offsetWithGlobalTimeMs = 0;
    referenceTimeMs = 0
    lastTimeStarted = 0;
    onLoopBegin: Function;
    updateTimeout
    forceRestart = false;
    playingLoopIdx = -1;

    constructor() {
        this.updateTimeout = setInterval(this.updateState.bind(this), this.updateResolutionMs)
    }

    destroy() {
        clearInterval(this.updateTimeout)
    }

    setLoopTimeSec(l) {
        this.loopTimeMs = l * 1000;
    }


    getSystemMillis() {
        return Math.max(0, new Date().getTime() - this.referenceTimeMs + this.offsetWithGlobalTimeMs);
    }


    getLoopIndexForTime(t) {
        if (this.loopTimeMs == 0) { console.error('[loop] no loop time set'); return t; }
        return Math.floor(t / this.loopTimeMs);
    }

    getLastLoopStartPointForTime(t) {
        if (this.loopTimeMs == 0) return t;
        return this.getLoopIndexForTime(t) * this.loopTimeMs
    }

    getNextTargetLoopEndTime() {
        return this.getLastTargetLoopStartTime() + this.loopTimeMs
    }
    getLastTargetLoopStartTime() {
        return this.getLastLoopStartPointForTime(this.getSystemMillis())
    }



    getCurrentTimeInLoop() {
        return this.getSystemMillis() - this.lastTimeStarted
    }

    setIsPlaying(isPlaying, forceRestart = false, referenceTimeMs = 0) {
        this.isPlaying = !!isPlaying
        this.forceRestart = !!isPlaying && !!forceRestart
        this.referenceTimeMs = referenceTimeMs

    }



    updateState() {
        if (this.loopTimeMs == 0) return;
        let now = this.getSystemMillis()
        let curLoopIdx = this.getLoopIndexForTime(now)
        let thisLoopShouldStart = false;
        if (this.forceRestart) {
            this.forceRestart = false
            const dtWithLast = now - this.getLastTargetLoopStartTime();
            this.offsetWithGlobalTimeMs -= dtWithLast
            while (this.offsetWithGlobalTimeMs > this.loopTimeMs) this.offsetWithGlobalTimeMs -= this.loopTimeMs
            while (this.offsetWithGlobalTimeMs < -this.loopTimeMs) this.offsetWithGlobalTimeMs += this.loopTimeMs
            now = this.getSystemMillis()
            curLoopIdx = this.getLoopIndexForTime(now)
            thisLoopShouldStart = true;

        }
        if (this.isPlaying || thisLoopShouldStart) {
            thisLoopShouldStart ||= (curLoopIdx != this.playingLoopIdx)
            if (thisLoopShouldStart) {
                this.playingLoopIdx = curLoopIdx;
                this.lastTimeStarted = now
                if (this.onLoopBegin) {
                    this.onLoopBegin()
                }
            }
        }
        else { // stopped
            this.playingLoopIdx = -1;
            // this.lastTimeStarted = 0
        }
    }

}
