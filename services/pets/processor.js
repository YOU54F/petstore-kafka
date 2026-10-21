const petsCacheProcessor = ({log, topic, db})=>{
    if(topic === 'pets.added') {
      console.log(`Adding pet to disk: ${log.id} - ${log.name}`)
      db.dbPut(log.id, {...log, status: 'pending'})
      return 
    }
  
    if(topic === 'pets.statusChanged') {
      console.log(`Updating pet status to disk: ${log.id} - ${log.status}`)
      // Save to DB with new status
      db.dbMerge(log.id, {status: log.status})
      return 
    }
  }
  
  module.exports = {
    petsCacheProcessor
  }