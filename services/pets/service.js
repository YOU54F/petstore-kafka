const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const { FlatDB: { queryObjToMatchQuery } } = require('../lib')
const { petAdded, petStatusChanged, toRecord } = require('./messages')

// The REST API. It reads from the pets cache (db) and writes by producing events, so tests can pass a
// stub producer and a throwaway FlatDB instead of Kafka.
function createApp({ producer, db }) {
  const app = express()
  app.use(morgan('short'))
  app.use(cors())
  app.use(express.json())

  app.get('/api/pets', (req, res) => {
    const { location, status } = req.query

    if(!location && !status) {
      return res.json(db.dbGetAll())
    }

    const query = queryObjToMatchQuery({ status, location })
    return res.json(db.dbQuery(query))
  })

  app.post('/api/pets', async (req, res) => {
    const pet = { ...req.body, id: req.body.id || crypto.randomUUID() }
    await producer.send(toRecord(petAdded(pet)))
    res.status(201).send(pet)
  })

  app.patch('/api/pets/:id', async (req, res) => {
    const pet = db.dbGet(req.params.id)
    if(!pet) {
      return res.status(400).json({
        message: 'Pet not found, cannot patch.'
      })
    }

    const message = petStatusChanged(pet, req.body.status)
    await producer.send(toRecord(message))
    res.status(201).send(message.value)
  })

  return app
}

module.exports = {
  createApp,
}
