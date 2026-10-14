# web-ui

The Petstore Kafka browser app (React 18, TypeScript, Tailwind, built with Vite) and the Caddy gateway that serves it.

| Command | What it does |
|---|---|
| `npm start` | Vite dev server on http://localhost:3000. It proxies `/api` and `/websocket` to the gateway on :4000. |
| `npm run gateway` | Caddy on :4000 with `dev.env`: proxies to the services on :3100, :3200 and :3300 and serves `build/`. |
| `npm run build` | Typechecks and builds to `build/`. |
| `npm test` | Vitest. `src/pets.store.test.ts` is the web-ui → pets-service consumer pact; it writes `pacts/`. |

Set `VITE_WEBSOCKET_HOST` (for example `ws://localhost:4000/websocket`) to connect the websocket console somewhere other
than `/websocket` on the current host.

The `Dockerfile` builds the SPA and copies it into a `caddy` image together with the `Caddyfile`. The gateway reads
`PETS_HOST`, `ADOPTIONS_HOST`, `WEBSOCKET_HOST` and `CADDY_PORT` from the environment.
