const path = require("path");
const {
  MessageConsumerPact,
  synchronousBodyHandler,
  MatchersV3,
} = require("@pact-foundation/pact");
const uuid = require("uuid");
// const {
//   petsCacheProcessor,
//   stopKafkaHelper,
//   petsCache,
// } = require("../pets/service");
const {
  petsCacheProcessor,
} = require("../pets/processor");
const { FlatDB } = require('./index')
const dbName = 'pets-cache'
const basePath=__dirname
const db = new FlatDB(path.resolve(basePath, `./${dbName}.db`))
const {reify,like} = MatchersV3

// 2 Pact Message Consumer
const messagePact = new MessageConsumerPact({
  consumer: "pet-service",
  dir: path.resolve(process.cwd(), "pacts"),
  pactfileWriteMode: "update",
  provider: "pet-service",
});

describe("pets service", () => {
  const id = uuid.v4();

  it("adds a pet",  async () => {
    const expectedPet = {
      location: like("Plett"),
      name: like("foo"),
      id: like(id),
    };
    // 3 Consumer expectations

    const messageContents = {
      topic: "pets.added",
      // messages: [{ value: JSON.stringify(expectedPet) }],
      log: expectedPet
    }
      messagePact
      .given("pets.added topic exists")
      .expectsToReceive("a pet to add")
      .withContent(messageContents)
      // 4 Verify consumers' ability to handle messages
      .verify(synchronousBodyHandler((messageContents) => petsCacheProcessor({...messageContents,db})));
        expect(db.dbGet(id)).toEqual({
          ...reify(expectedPet),
          status: "pending",
        });
  });
});
