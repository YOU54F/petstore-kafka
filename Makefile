NIX_RUN = nix-shell --run 
BASH_RUN = bash -c 

# Check if nix-shell exists, use that. Else use bash.
# Nix is a package manager that will install all the packages needed,
# else you'll need to manually ensure you have all dependencies (docker, nodejs, caddy, etc)
ifneq (, $(shell which nix-shell))
RUN := $(NIX_RUN)
else
RUN := $(BASH_RUN)
endif

help: ## Prints help for targets with comments
	@grep -E '^[a-zA-Z._-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		sort | \
		awk 'BEGIN {\
				FS = ":.*?## "; \
				print "If you are lost, read the README.md.\nList of tasks.\n";\
			}; { \
		    printf "\033[36m%-30s\033[0m %s\n", $$1, $$2; \
			}'

dependencies: ## Prints list of dependencies in the project (for non-nix users)
	@grep -E '^ *[a-zA-Z._-]+ *.*?## .*$$' shell.nix | \
		sort | \
		awk 'BEGIN {FS = "## "; \
			print "List of dependencies required.\n";\
			}; { \
			split($$2, descArr, "\\(optional\\)"); \
			dep = $$1; \
			desc = $$2; \
			color = "35m"; \
			if (length(descArr) > 1) {\
			  dep = dep  " (optional)"; \
			  desc = descArr[2]; \
				color = "33m"; \
			} \
			gsub(/^[ \t]+/,"",dep); \
			gsub(/^[ \t]+/,"",desc); \
			printf "\033[%s%-30s\033[0m%s\n",color,dep,desc \
		}'

install: ## Installs npm dependencies for the services and web-ui (no install scripts)
	$(RUN) "cd ./services && npm ci --ignore-scripts && cd ../web-ui && npm ci --ignore-scripts"

dev-kafka: ## Runs just Kafka (KRaft, localhost:9092)
	$(RUN) "docker compose up kafka"

dev-pets: ## Runs the Pets service
	$(RUN) "cd ./services && npm run dev --workspace pets"

dev-adoptions: ## Runs the Adoptions service
	$(RUN) "cd ./services && npm run dev --workspace adoptions"

dev-websocket: ## Runs the Websocket service
	$(RUN) "cd ./services && npm run dev --workspace websocket"

dev-gateway: ## Runs a gateway, proxying to other services and used by web-ui
	$(RUN) "cd ./web-ui && npm run gateway"

dev-web-ui: ## Runs the web-ui with Vite on :3000
	$(RUN) "cd ./web-ui && npm start"

dev: ## Start a Tmuxinator project running all dev services
	$(RUN) "tmuxinator start"

test: ## Unit tests and consumer pacts for the services and web-ui
	$(RUN) "cd ./services && npm test && npm run test:pact:consumer && cd ../web-ui && npm test"

verify: test ## Verifies pets-service and adoptions-service against every consumer pact (no Kafka needed)
	$(RUN) "cd ./services && npm run test:pact:provider"

build: ## Build all docker images
	$(RUN) "docker compose build"

start: ## Start the entire stack on http://localhost:8080
	$(RUN) "docker compose up --build"

clean: ## Stop the stack and remove its volumes
	$(RUN) "docker compose down -v"
