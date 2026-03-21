.PHONY: docker-up docker-down docker-logs docker-test ui-build backend-test

backend-test:
	cd backend && pytest tests/test_v1_surface.py -q

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f backend

docker-test:
	@chmod +x RUN_DOCKER_NOW.sh scripts/docker-test.sh 2>/dev/null; ./RUN_DOCKER_NOW.sh

ui-build:
	cd UI && npm run build
