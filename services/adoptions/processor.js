// Keeps adoptions-service's copy of each pet's status, from pets.statusChanged. Adoption requests are
// checked against it, so the status values pets-service sends are part of the contract.
const cachePetStatus = ({ log, db }) => {
  if(!log.status) {
    return
  }
  console.log(`Cacheing pet status to disk: ${log.id} - ${log.status}`)
  db.dbPut(log.id, { status: log.status })
}

module.exports = {
  cachePetStatus,
}
