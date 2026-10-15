const { petAdoptionStatusChanged, toRecord } = require('./messages')

describe('adoptions-service messages', () => {
  it('names the adopter when the adoption has one', () => {
    expect(petAdoptionStatusChanged('p-1', 'adopted', 'c-1'))
      .toEqual({ topic: 'pets.statusChanged', value: { id: 'p-1', status: 'adopted', adopterId: 'c-1' } })
  })

  it('leaves adopterId out when there is none', () => {
    expect(petAdoptionStatusChanged('p-1', 'onhold').value).toEqual({ id: 'p-1', status: 'onhold' })
  })

  it('builds one kafkajs record for several pets', () => {
    const record = toRecord(['p-1', 'p-2'].map((id) => petAdoptionStatusChanged(id, 'available', 'c-2')))
    expect(record.topic).toBe('pets.statusChanged')
    expect(record.messages.map((m) => JSON.parse(m.value))).toEqual([
      { id: 'p-1', status: 'available', adopterId: 'c-2' },
      { id: 'p-2', status: 'available', adopterId: 'c-2' },
    ])
  })
})
