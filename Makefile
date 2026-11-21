PY := .venv/bin/python
.PHONY: setup test demo typecheck
setup:
	uv venv --allow-existing --python 3.12 .venv
	uv pip install --python $(PY) -r requirements.txt
	npm ci
typecheck:
	npm run typecheck
	$(PY) -c 'from shared.schema import Case, Forecast; print("Python contracts import")'
test: typecheck
	$(PY) -m pytest -q
demo: typecheck
	@echo "Demo components are delivered in order; see docs/progress/."
