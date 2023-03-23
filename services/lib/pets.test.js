/// <reference types="jest" />
const { Verifier } = require("@pact-foundation/pact");
const {
  app,
  producer,
  consumers,
  shutdown,
  petsCache,
} = require("../pets/service");
const path = require("path");
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const uuid = require("uuid");

// const pactBroker = 'https://test.pactflow.io';
jest.setTimeout(30000);
const server = app.listen(8081, () => {
  console.log("Animal Profile Service listening on http://localhost:8081");
});
// Verify that the provider meets all consumer expectations
describe("Pact Verification", () => {
  it("validates the expectations of Matching Service", () => {
    // let token = 'INVALID TOKEN';

    return new Verifier({
      logLevel: LOG_LEVEL,
      provider: "pets-service",
      providerBaseUrl: "http://localhost:8081/api",
      providerVersion: process.env.GIT_COMMIT || "1.0.0",
      providerVersionTags: [process.env.GIT_BRANCH || "master"],
      providerVersionBranch: process.env.GIT_BRANCH || "master",

      // ****
      // ** REQUEST FILTERS **
      // ****

      //   requestFilter: (req, res, next) => {
      //     console.log(
      //       'Middleware invoked before provider API - injecting Authorization token'
      //     );
      //     req.headers['MY_SPECIAL_HEADER'] = 'my special value';

      //     // e.g. ADD Bearer token
      //     req.headers['authorization'] = `Bearer ${token}`;
      //     next();
      //   },

      // ****
      // ** STATE HANDLERS **
      // ****

      stateHandlers: {
        "some pets exist": (params) => {
          console.log("params", params);
          const { location, status } = params;
          const testData = { name: "foo", status, location, id: uuid.v4() };
          petsCache.db.dbPut(testData.id, { ...testData });
          return Promise.resolve({
            description: `some pets in the db`,
          });
        },
        "a pet called foo does not exist": () => {
          return Promise.resolve({
            description: `a pet called foo does not exist`,
          });
        },
      },

      // ****
      // ** BROKER SPECIFIC OPTIONS - FETCHING PACTS BASED ON SELECTORS **
      // ****

      //  // Fetch pacts from broker
      //   pactBrokerUrl: pactBroker,

      //   // Fetch from broker with given tags

      //   // Find _all_ pacts that match the current provider branch
      //   consumerVersionSelectors: [
      //     {
      //       matchingBranch: true,
      //     },
      //   ],
      //   enablePending: true,

      // ****
      // ** FILE/DIR/URL SPECIFIC OPTIONS **
      // ****

      // Specific Remote pacts (doesn't need to be a broker)
      // pactUrls: ['https://test.pactflow.io/pacts/provider/Animal%20Profile%20Service/consumer/Matching%20Service/latest'],
      // Local pacts
      pactUrls: [
        path.resolve(
          process.cwd(),
          "../../web-ui/pacts/web-ui-pets-service.json"
        ),
      ],

      // ****
      // ** BROKER SPECIFIC OPTIONS - IF PUBLISHING RESULTS, OR RETRIEVING PACTS FROM AUTH PROTECTED BROKER **
      // ****
      //   pactBrokerUsername:
      //     process.env.PACT_BROKER_USERNAME || "dXfltyFMgNOFZAxr8io9wJ37iUpY42M",
      //   pactBrokerPassword:
      //     process.env.PACT_BROKER_PASSWORD || "O5AIZWxelWbLvqMd8PkAVycBJh2Psyg1",
      //   publishVerificationResult: true,
    })
      .verifyProvider()
      .then((output) => {
        console.log("Pact Verification Complete!");
        console.log("Result:", output);
        server.close();
        shutdown().then(() => process.exit());
      })
      .catch((e) => {
        shutdown().then(() => {
          console.error(e);
          process.exit(1);
        });
      });
  });
});
