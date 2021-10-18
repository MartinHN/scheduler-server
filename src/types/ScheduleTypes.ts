/// ////////////:
// Agendas

export function hourStringToMinutes (h:string) :number| undefined {
  const spl = h.split(':')
  if (spl.length === 2) {
    return parseInt(spl[0]) * 60 + parseInt(spl[1])
  }
  return undefined
}

export function hourMinutesToString (h:number) :string {
  return Math.ceil(h / 60) + ':' + Math.ceil(h % 60)
}

export interface HourRange {
    start: string;
    end: string;
  }

export function defaultHourRange ():HourRange {
  return { start: '09:00', end: '18:00' }
}

export interface DayType{
    hourRangeList:HourRange[]
}

export function defaultDayType ():DayType {
  return { hourRangeList: [defaultHourRange()] }
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

export interface WeekHours{
  default:DayType
  exceptions:{
  lundi?:DayType
  mardi?:DayType
  mercredi?:DayType
  jeudi?:DayType
  vendredi?:DayType
  samedi?:DayType
  dimanche?:DayType
  }
}

export type ExceptionList = {dayName:string, dayValue:DayType}[]

export function getExceptionListFromWH (wh:WeekHours):ExceptionList {
  if (wh.exceptions) {
    return Object.entries(wh.exceptions).map(([dayName, dayValue]) => { return { dayName, dayValue } })
  }
  return []
}

export function getAvailableExceptionDaysFromWH (wh:WeekHours):string[] {
  return dayNames.filter(d => !Object.keys(wh.exceptions || {}).find(e => e === d))
}

export function defaultWeekHour ():WeekHours {
  return {
    default: defaultDayType(),
    exceptions: {}
    // lundi: defaultDayType(),
    // mardi: defaultDayType(),
    // mercredi: defaultDayType(),
    // jeudi: defaultDayType(),
    // vendredi: defaultDayType(),
    // samedi: defaultDayType(),
    // dimanche: defaultDayType()
  }
}

export interface AgendaException{
    name:string
    dates:{start:string, end:string}
    dayValue:DayType
}

export interface Agenda{
  name:string
  defaultWeek:WeekHours
  agendaExceptionList:AgendaException[]
}

export function dateDayToString (d:Date):string {
  return '' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()
}

export function dateDayFromString (d:string) :Date {
  const dspl = d.split('/')
  const spl = dspl.map(e => { return parseInt(e) })
  if (spl.length === 3) {
    return new Date(spl[2], spl[1] - 1, spl[0], 12)
  } else {
    console.error("can't convert", spl)
    return new Date()
  }
}
export function createAgendaException (name:string):AgendaException {
  return {
    name,
    dates: {
      start: dateDayToString(new Date()),
      end: dateDayToString(new Date())
    },
    dayValue: { hourRangeList: [] }
  }
}

export function createDefaultAgenda () : Agenda {
  return { name: 'default', defaultWeek: defaultWeekHour(), agendaExceptionList: [] }
}

/// ////////////
// Helper to validate

export function isActiveForDayType (d:Date, day:DayType):boolean {
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
      console.log('>>>>>>', d.getHours(), curMinutes, st, end)
      return curMinutes >= st && curMinutes < end
    } else {
      // error
      console.error('invalid ')
      return false
    }
  })
  return !!validRange
}

export function isAgendaActiveForDate (d:Date, ag:Agenda) :boolean {
  const actDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const ex = ag.agendaExceptionList.find(e => {
    const startD = dateDayFromString(e.dates.start)
    const endD = dateDayFromString(e.dates.end)
    return (actDay >= startD && actDay <= endD)
  })
  if (ex) {
    return isActiveForDayType(d, ex.dayValue)
  }
  const dow = (actDay.getDay() + 6) % 7
  const dn = dayNames[dow]
  const dt = (ag.defaultWeek.exceptions as any)[dn] || ag.defaultWeek.default as DayType
  return isActiveForDayType(d, dt)
}
