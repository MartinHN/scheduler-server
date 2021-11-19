
import bonjourM  from 'bonjour'
import * as dbg from '../src/dbg'

const bonjour = bonjourM()
 
// advertise an HTTP server on port 3000
bonjour.publish({ name: 'test'+new Date(), type: 'rspstrio', port: 3000,txt:{lala:"lala"} })

 
// browse for all http services
bonjour.find({ type: 'rspstrio' }, function (service) {
  dbg.log('Found a Raspestrio server:', service)
})
