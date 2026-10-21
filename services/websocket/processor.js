// Remembers where each pet or adoption is, from pets.added and adoptions.requested. Later events
// (status changes) carry only an id, so this is how they reach sockets subscribed to a location.
const cacheLocation = ({ log, db }) => {
  if(!log.location) {
    return
  }
  console.log(`Cacheing to location disk: ${log.id} - ${log.location}`)
  db.dbPut(log.id, { location: log.location })
}

module.exports = {
  cacheLocation,
}
