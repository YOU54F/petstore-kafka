# Petstore Kafka demo site

This is a contrived demo of a petstore with adoptions.
It is built on Kafka topics, with services written in Node.js.

It exists as a functional example for describing with AsyncAPI and OpenAPI.

You can see a live demo of this running at https://petstore-kafka.swagger.io

> NOTE: Given the way Kafka rebalances and the need for cacheing, it may take a while (a few minutes) for caches to be built, depending on the size of the Topic.


## User Flows

![image](https://user-images.githubusercontent.com/8438485/228814936-378faa65-809f-412d-95a2-ee59c6bad7f1.png)


## Technical stack

![image](https://user-images.githubusercontent.com/8438485/228814110-04ec68e6-4e2e-4d91-9977-d243e2b55a59.png)

- There is a browser app (SPA) written in TypeScript with React and Vite, under [web-ui](./web-ui).
- There is a gateway for serving the SPA and proxying API calls to the other services. It is also under [web-ui](./web-ui) and is a single Caddyfile.
- There is a Pets service (Node.js + Kafka sink) in [services/pets](./services/pets).
- There is an Adoptions service (Node.js + Kafka sink) in [services/adoptions](./services/adoptions).
- There is a Websocket service (Node.js + Kafka sink + publishes events) in [services/websocket](./services/websocket).
- The services are npm workspaces under [services](./services) and share [services/lib](./services/lib). One
  [Dockerfile](./services/Dockerfile) builds each of them (`--build-arg SERVICE=pets`).
- [docker-compose.yml](./docker-compose.yml) runs the whole stack, with Kafka 3.9 in KRaft mode (no ZooKeeper).


## OpenAPI and AsyncAPI

- OpenAPI for **Gateway** (includes both Pets and Adoptiosn services) https://app.swaggerhub.com/apis/SwaggerPMTests/Pets-Adoption-API
- AsyncAPI for **Pets** service https://app.swaggerhub.com/apis/SwaggerPMTests/petstore-kafka-pets
- AsyncAPI for **Adoptions** service https://app.swaggerhub.com/apis/SwaggerPMTests/petstore-kafka-adoptions


## Developing

To develop, first make sure you have all the dependencies installed: Node.js 24, Docker with Compose v2 and Caddy.
Then run `make install`.

A list can be found by running `make dependencies`. There are optional dependencie for Tmux/inator, which are helpful for spinning up several servers at once each with their own terminal pane. But that does require a little bit of tmux knowledge.

You can launch each service with `make dev-{service}` where `{service}` is the name of the service. A list can be seen by running `make help`. `make dev-kafka` runs just Kafka, on localhost:9092.

Alternatively, if you have Tmuxinator install you can run `make dev` which will launch all services.

All services have hot-reload, but they make require a restart now and then if there are kafka delays/issues.

## Building

`make start` (or `docker compose up --build`) builds every image and brings up the whole stack on
http://localhost:8080. `make build` only builds the images, and `make clean` stops the stack and removes its volumes.

Behind a TLS-intercepting proxy such as Zscaler, `npm ci` inside the image builds needs the proxy's CA. Pass a full PEM
bundle (public roots plus the proxy root) as a build secret with the CA overlay:

```bash
CA_PEM="$(cat /path/to/ca-bundle.pem)" docker compose -f docker-compose.yml -f docker-compose.ca.yml up --build
```

## Testing

`make test` runs the unit tests and the consumer pacts; `make verify` then verifies pets-service and adoptions-service
against them. Neither needs Kafka.

### Contract testing

[Pact](https://docs.pact.io) covers both the Kafka messages and the REST API that pets-service provides:

| Consumer | Contract | Test |
|---|---|---|
| adoptions-service | `pets.statusChanged` messages | [services/adoptions/pets-status.consumer.pact.test.js](./services/adoptions/pets-status.consumer.pact.test.js) |
| websocket-service | `pets.added` messages | [services/websocket/pets-added.consumer.pact.test.js](./services/websocket/pets-added.consumer.pact.test.js) |
| web-ui | `GET /api/pets`, `POST /api/pets` | [web-ui/src/pets.store.test.ts](./web-ui/src/pets.store.test.ts) |

The consumer tests write pacts to `services/pacts` and `web-ui/pacts`. The provider test,
[services/pets/pets-service.provider.pact.test.js](./services/pets/pets-service.provider.pact.test.js), starts the pets
API with a stub producer and checks the messages pets-service builds in
[services/pets/messages.js](./services/pets/messages.js), so it needs no Kafka.

adoptions-service is a provider too. As an adoption moves on it sends `pets.statusChanged` itself (`onhold`, `adopted`,
or back to `available`), built in [services/adoptions/messages.js](./services/adoptions/messages.js). When the adoption
request names an adopter (`POST /api/adoptions` with an optional `adopterId`, a customer id), those messages carry it as
`adopterId`, so Petstore Inc's notifications service can tell the adopter. Its consumer pact lives in that repo;
[services/adoptions/adoptions-service.provider.pact.test.js](./services/adoptions/adoptions-service.provider.pact.test.js)
verifies it from the broker, or locally from `services/pacts/*-adoptions-service.json` and any paths in `PACT_URLS`
(comma separated). With no pact to verify, the test is skipped.

To use a Pact broker, set `PACT_BROKER_BASE_URL` plus `PACT_BROKER_TOKEN` (PactFlow) or
`PACT_BROKER_USERNAME`/`PACT_BROKER_PASSWORD` (OSS broker). `npm run pact:publish`, in `services` or `web-ui`, publishes
that folder's pacts with [`@pact-foundation/pact-cli`](https://www.npmjs.com/package/@pact-foundation/pact-cli), using
the commit SHA as the version and the current branch. The provider test then fetches pacts from the broker, and
publishes verification results when `CI=true`. `services` also has `pact:can-i-deploy` and `pact:record-deployment`
for the `local` environment; pass `--pacticipant` and `--version`.

In CI ([.gitea/workflows/ci.yaml](./.gitea/workflows/ci.yaml)), set `PACT_BROKER_BASE_URL` (and `PACT_BROKER_USERNAME`)
as repository variables and the token or password as secrets. The workflow then gates pull requests with `can-i-deploy`
against `local`, and on `main` records each deployment, pets-service first.

### ReadyAPI

Test projects for this application have been added to the [ReadyAPI-tests](./ReadyAPI-tests) folder. The projects have test across the OpenAPI and AsyncAPIs as described in the [API Section](#openapi-and-asyncapi). In order to run these tests you need to have ReadyAPI installed. A free-trial can be obtained via https://www.soapui.org/downloads/download-readyapi-trial/

