import { Pet, PetsAPI } from "./pets.store";

import { PactV3, MatchersV3 } from "@pact-foundation/pact";

const provider = new PactV3({
  consumer: "web-ui",
  provider: "pets-service",
});

const { eachLike, like, reify } = MatchersV3;

describe("test the pets api collaborator", () => {
  it("should get available pets from a specified location", () => {
    const expectedData: Pet = {
      name: "Max",
      location: "Plett",
      id: "6c9f429c-3f5d-4a55-88bf-026b2b404710",
      status: "available",
    };
    const queryData = { location: "Plett", status: "available" };
    provider
      .given("some pets exist",{location:'Plett',status:'available'})
      .uponReceiving("A request to get pets")
      .withRequest({
        method: "GET",
        path: "/pets",
        query: queryData,
      })
      .willRespondWith({
        status: 200,
        body: eachLike(expectedData),
      });
    return provider.executeTest((mockserver) => {
      const client = new PetsAPI(mockserver.url);
      return client.getPets(queryData).then((pet) => {
        expect(pet).toEqual([expectedData]);
      });
    });
  });
  it("should add a pet", () => {
      const mockPostData = { location: like("Plett"), name: like("foo") };
      const postData = reify(mockPostData) as { name: string; location: string }
    provider
      .given("a pet called foo does not exist")
      .uponReceiving("A request to create a pet called foo")
      .withRequest({
        method: "POST",
        path: "/pets",
        body: mockPostData,
      })
      .willRespondWith({
        status: 201,
      });
    return provider.executeTest((mockserver) => {
      const client = new PetsAPI(mockserver.url);
      return client
        .addPet(postData)
        .then((pet) => {
          expect(pet.status).toEqual(201);
        });
    });
  });
});
