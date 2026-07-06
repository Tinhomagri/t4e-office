.PHONY: help install migrate seed dev test lint backend-test frontend-test

help:  ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install:  ## Instala dependências (backend + frontend)
	cd backend && pip install -e ".[dev]"
	cd frontend && npm install

migrate:  ## Aplica migrations
	cd backend && python manage.py migrate

seed:  ## Popula dados de avaliação
	cd backend && python manage.py seed_demo

dev:  ## Sobe backend (:8000) e frontend (:8080)
	cd backend && python manage.py runserver & cd frontend && npm run dev

test: backend-test frontend-test  ## Roda todos os testes

backend-test:  ## Testes do backend
	cd backend && pytest -q

frontend-test:  ## Testes do frontend
	cd frontend && npm test

lint:  ## Lint backend (ruff) + typecheck frontend
	cd backend && ruff check src
	cd frontend && npm run lint
