const path = require("path");
const { MessageProviderPact } = require("@pact-foundation/pact");

// 1 Messaging integration client
const handler = {
  addPet: () => {
    return new Promise((resolve) => {
      resolve({
        topic: "pets.added",
        log: {
          id: "eda50730-5606-4a53-aa0d-4bb58746c430",
          location: "Plett",
          name: "foo",
        },
      });
    });
  },
};

describe("Message provider tests", () => {
  // 2 Pact setup
  const p = new MessageProviderPact({
    messageProviders: {
      //  this is taken from description in the pact file
      "a pet to add": () => handler.addPet(),
    },
    stateHandlers: {
      //  this is taken from providerStates in the pact file
      "pets.added topic exists": () =>
        console.log(
          "State Change ignored as there is no state change URL provided for interaction"
        ),
    },
    provider: "pet-service",
    providerVersion: "1.0.0",
    pactUrls: [
      process.env.PACT_URL ??
        path.resolve(process.cwd(), "pacts", "pet-service-pet-service.json"),
    ],
  });

  // 3 Verify the interactions
  describe("pet service message provider", () => {
    it("verifies consumer contracts", () => {
      return p.verify();
    });
  });
});
