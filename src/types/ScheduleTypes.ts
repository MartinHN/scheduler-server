/// ////////////
// Agendas
import * as dbg from '../dbg'

/// ////////////////
// conversion helpers

function twoDig(n: number) {
  return ('0' + n).slice(-2)
}
export function dateFromDayAndHourString(d: string, h: string): Date {
  const res = new Date(dateDayFromString(d))
  res.setHours(0)
  // console.log('hToMin', hourStringToMinutes(h), h)
  res.setMinutes(hourStringToMinutes(h) || 0)
  return res
}
export function dateToHourString(d: Date): string {
  return hourMinutesToString(d.getHours() * 60 + d.getMinutes())
}

export function hourStringToMinutes(h: string): number | undefined {
  const spl = h.split(':')
  if (spl.length === 2) {
    return parseInt(spl[0]) * 60 + parseInt(spl[1])
  }
  return undefined
}

export function hourMinutesToString(h: number): string {
  return twoDig(Math.floor(h / 60)) + ':' + twoDig(Math.floor(h % 60))
}

export function dateDayToString(d: Date): string {
  return '' + twoDig(d.getDate()) + '/' + twoDig(d.getMonth() + 1) + '/' + d.getFullYear()
}

export function dateDayFromString(d: string): Date {
  const dspl = d.split('/')
  const spl = dspl.map(e => { return parseInt(e) })
  if (spl.length === 3) {
    return new Date(spl[2], spl[1] - 1, spl[0], 12)
  } else {
    dbg.error("can't convert day", d, spl)
    return new Date()
  }
}

export interface HourRange {
  start: string;
  end: string;
}

export function defaultHourRange(): HourRange {
  return { start: '09:00', end: '18:00' }
}

export interface DayType {
  dayName: string;
  hourRangeList: HourRange[]
}

export function createDefaultDayType(): DayType {
  return { dayName: 'default', hourRangeList: [defaultHourRange()] }
}

export const dayNames = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche'
]

export interface WeekHours {
  defaultDay: DayType
  exceptions: DayType[]
}

export type ExceptionList = DayType[]

export function getExceptionListFromWH(wh: WeekHours): ExceptionList {
  if (wh.exceptions) {
    return wh.exceptions
  }
  return []
}

export function getAvailableExceptionDaysFromWH(wh: WeekHours): string[] {
  return dayNames.filter(d => !Object.values(wh.exceptions || []).find(e => e.dayName === d))
}

export function createDefaultWeekHour(): WeekHours {
  return {
    defaultDay: createDefaultDayType(),
    exceptions: []
  }
}

export interface AgendaException {
  name: string
  dates: { start: string, end: string }
  dayValue: DayType
}

export interface Agenda {
  name: string
  loopTimeSec: number
  defaultWeek: WeekHours
  agendaExceptionList: AgendaException[]
}

export function createAgendaException(name: string): AgendaException {
  return {
    name,
    dates: {
      start: dateDayToString(new Date()),
      end: dateDayToString(new Date())
    },
    dayValue: { dayName: 'default', hourRangeList: [] }
  }
}

export function createDefaultAgenda(): Agenda {
  return { name: 'default', loopTimeSec: 0, defaultWeek: createDefaultWeekHour(), agendaExceptionList: [] }
}

// /////////////
// Helper to validate

export function isActiveForDayType(d: Date, day: DayType): boolean {
  if (!day.hourRangeList || !day.hourRangeList.length) {
    dbg.log('empty day')
    return false
  }
  const curMinutes = d.getHours() * 60 + d.getMinutes()
  const validRange = day.hourRangeList.find(e => {
    const st = hourStringToMinutes(e.start)
    let end = hourStringToMinutes(e.end)
    if (end === undefined || st === undefined) {
      return false // invalid format
    }
    if (end === 0) {
      end = 24 * 60 // end is  midnight assume is next day
    }
    if (end < st) {
      end += 24 * 60 // end is before, assume next day
    }
    if (end > st) {
      // dbg.log('>>>>>>', d.getHours(), curMinutes, st, end)
      return curMinutes >= st && curMinutes < end
    } else {
      // error
      dbg.error('invalid ')
      return false
    }
  })
  return !!validRange
}


export function getActiveDayForDateInAgenda(d: Date, ag: Agenda): DayType {

  const actDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const ex = (ag.agendaExceptionList || []).find(e => {
    const startD = dateDayFromString(e.dates.start)
    const endD = dateDayFromString(e.dates.end)
    return (actDay >= startD && actDay <= endD)
  })
  if (ex) {
    dbg.log('getting for exception Period', ex.dayValue)
    return ex.dayValue;
  }
  const dow = (actDay.getDay() + 6) % 7
  const dn = dayNames[dow]
  return ag.defaultWeek.exceptions.find(e => e.dayName === dn) || ag.defaultWeek.defaultDay as DayType
}

export function isAgendaActiveForDate(d: Date, ag: Agenda): boolean {
  const dt = getActiveDayForDateInAgenda(d, ag);
  // const actDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  // const ex = (ag.agendaExceptionList || []).find(e => {
  //   const startD = dateDayFromString(e.dates.start)
  //   const endD = dateDayFromString(e.dates.end)
  //   return (actDay >= startD && actDay <= endD)
  // })
  // if (ex) {
  //   dbg.log('applying exception Period', ex.dayValue)
  //   return isActiveForDayType(d, ex.dayValue)
  // }
  // const dow = (actDay.getDay() + 6) % 7
  // const dn = dayNames[dow]
  // const dt = ag.defaultWeek.exceptions.find(e => e.dayName === dn) || ag.defaultWeek.defaultDay as DayType
  return isActiveForDayType(d, dt)
}

interface HourRangeChangeType {
  hasValidChange: boolean
  willBeInsideHourRage: boolean
  hourString: string
  diffMin: number
}

function getNextChangeDateFromHourList(hourString: string, r: HourRange[]): HourRangeChangeType {
  const res = {
    hasValidChange: false,
    willBeInsideHourRage: false,
    hourString: '',
    diffMin: 999999999
  }

  const fromHourMinutes = hourStringToMinutes(hourString)
  if (fromHourMinutes === undefined) return res

  r.map(h => {
    const st = hourStringToMinutes(h.start)
    let end = hourStringToMinutes(h.end)
    if ((st === undefined) || (end === undefined)) return
    if (end === 0) {
      end += 24 * 60 // midnight assume next day
    }
    if (end < st) {
      end += 24 * 60 // if end is before, assume next day
    }
    let diffMin = st - fromHourMinutes
    if (diffMin > 0 && diffMin < res.diffMin) {
      res.hasValidChange = true
      res.willBeInsideHourRage = true
      res.diffMin = diffMin
      res.hourString = h.start
    }
    diffMin = end - fromHourMinutes
    if (diffMin > 0 && diffMin < res.diffMin) {
      res.diffMin = diffMin
      res.hasValidChange = true
      res.willBeInsideHourRage = false
      res.hourString = h.end
    }
  })

  return res
}

interface AgendaChangeType {
  isValid: boolean
  willBeOn: boolean
  dateString: string
  hourString: string
}

function getNextChangeHourForDay(fromDay: Date, ag: Agenda): AgendaChangeType {
  const res = {
    isValid: false,
    willBeOn: false,
    dateString: '',
    hourString: ''
  }

  const dateString = dateDayToString(fromDay)
  const fromHourString = dateToHourString(fromDay)
  const fromMinutes = hourStringToMinutes(fromHourString)
  // console.log('checking next change for', fromDay.getHours(), dateString, fromHourString, fromMinutes)
  if (fromMinutes === undefined) { console.error('invalid fromHourString', fromHourString); return res }

  // check exceptions
  const actDay = new Date(fromDay.getFullYear(), fromDay.getMonth(), fromDay.getDate(), 12)
  const ex = (ag.agendaExceptionList || []).find(e => {
    const startD = dateDayFromString(e.dates.start)
    const endD = dateDayFromString(e.dates.end)
    return (actDay >= startD && actDay <= endD)
  })
  if (ex) {
    dbg.log('found exception Period', ex.dayValue)

    const nextCh = getNextChangeDateFromHourList(fromHourString, ex.dayValue.hourRangeList)
    if (nextCh.hasValidChange) {
      res.isValid = true
      res.willBeOn = nextCh.willBeInsideHourRage
      res.dateString = dateString
      res.hourString = nextCh.hourString
    }
    return res
  }

  // check normal week
  const dow = (actDay.getDay() + 6) % 7
  const dn = dayNames[dow]
  const dt = ag.defaultWeek.exceptions.find(e => e.dayName === dn) || ag.defaultWeek.defaultDay as DayType
  const nextCh = getNextChangeDateFromHourList(fromHourString, dt.hourRangeList)
  if (nextCh.hasValidChange) {
    res.isValid = true
    res.willBeOn = nextCh.willBeInsideHourRage
    res.dateString = dateString
    res.hourString = nextCh.hourString
  }
  return res
}

export function getNextChangeDateFrom(fromD: Date, ag: Agenda): AgendaChangeType {
  let res = {
    isValid: false,
    willBeOn: false,
    dateString: '',
    hourString: ''
  }

  fromD.getHours()
  const maxDayToCheck = new Date(fromD)
  maxDayToCheck.setDate(fromD.getDate() + 100)
  for (let checkedDay = new Date(fromD); checkedDay.getTime() <= maxDayToCheck.getTime(); checkedDay.setDate(checkedDay.getDate() + 1)) {
    const d = new Date(checkedDay)
    res = getNextChangeHourForDay(d, ag)
    if (res.isValid) {
      return res
    }

    checkedDay = new Date(checkedDay.getFullYear(), checkedDay.getMonth(), checkedDay.getDate(), 0)// after one iteration day should be checked from midnight
  }

  console.warn('no agenda change  found')

  return res
}
