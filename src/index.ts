
import { startServer } from './server'
import { startDNS } from './dns'
import { startSchedule} from './schedule'
startServer()
startDNS()
startSchedule((state)=>{
  console.log("scheduling",state)
})
