import { Pet, PetsAPI } from "./pets.store";

import { Pact, Matchers } from "@pact-foundation/pact";

const pact = new Pact({
  consumer: "web-ui",
  provider: "pets-service",
});

const { eachLike, like, reify } = Matchers;

describe("the pets API client", () => {
  it("gets available pets from a location", () => {
    const expectedData: Pet = {
      name: "Max",
      location: "Plett",
      id: "6c9f429c-3f5d-4a55-88bf-026b2b404710",
      status: "available",
    };
    const queryData = { location: "Plett", status: "available" };
    return pact
      .addInteraction()
      .given("some pets exist", queryData)
      .uponReceiving("A request to get pets")
      .withRequest("GET", "/pets", (builder) => builder.query(queryData))
      .willRespondWith(200, (builder) => builder.jsonBody(eachLike(expectedData)))
      .executeTest(async (mockserver) => {
        const client = new PetsAPI(mockserver.url);
        expect(await client.getPets(queryData)).toEqual([expectedData]);
      });
  });

  it("adds a pet", () => {
    const body = { location: like("Plett"), name: like("foo") };
    return pact
      .addInteraction()
      .given("a pet called foo does not exist")
      .uponReceiving("A request to create a pet called foo")
      .withRequest("POST", "/pets", (builder) => builder.jsonBody(body))
      .willRespondWith(201)
      .executeTest(async (mockserver) => {
        const client = new PetsAPI(mockserver.url);
        const res = await client.addPet(reify(body) as { name: string; location: string });
        expect(res.status).toEqual(201);
      });
  });
});
