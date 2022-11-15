/// ////////////
// Agendas
import * as dbg from '../dbg'

export function hourStringToMinutes(h: string): number | undefined {
  const spl = h.split(':')
  if (spl.length === 2) {
    return parseInt(spl[0]) * 60 + parseInt(spl[1])
  }
  return undefined
}

export function hourMinutesToString(h: number): string {
  return Math.ceil(h / 60) + ':' + Math.ceil(h % 60)
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
  defaultWeek: WeekHours
  agendaExceptionList: AgendaException[]
}

export function dateDayToString(d: Date): string {
  return '' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()
}

export function dateDayFromString(d: string): Date {
  const dspl = d.split('/')
  const spl = dspl.map(e => { return parseInt(e) })
  if (spl.length === 3) {
    return new Date(spl[2], spl[1] - 1, spl[0], 12)
  } else {
    dbg.error("can't convert", spl)
    return new Date()
  }
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
  return { name: 'default', defaultWeek: createDefaultWeekHour(), agendaExceptionList: [] }
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

export function isAgendaActiveForDate(d: Date, ag: Agenda): boolean {
  const actDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const ex = (ag.agendaExceptionList || []).find(e => {
    const startD = dateDayFromString(e.dates.start)
    const endD = dateDayFromString(e.dates.end)
    return (actDay >= startD && actDay <= endD)
  })
  if (ex) {
    dbg.log('applying exception Period', ex.dayValue)
    return isActiveForDayType(d, ex.dayValue)
  }
  const dow = (actDay.getDay() + 6) % 7
  const dn = dayNames[dow]
  const dt = ag.defaultWeek.exceptions.find(e => e.dayName === dn) || ag.defaultWeek.defaultDay as DayType
  return isActiveForDayType(d, dt)
}
