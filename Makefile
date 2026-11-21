PY := .venv/bin/python
.PHONY: setup test demo typecheck synthetic evaluate real
setup:
	uv venv --allow-existing --python 3.12 .venv
	uv pip install --python $(PY) -r requirements.txt
	npm ci --no-audit --no-fund
synthetic:
	$(PY) -m ml.data.synthetic
evaluate:
	$(PY) -m ml.evaluate.run synthetic
real:
	$(PY) -m ml.data.real_input
	$(PY) -m ml.evaluate.run real
typecheck:
	npm run typecheck
	$(PY) -c 'from shared.schema import Case, Forecast; print("Python contracts import")'
test: typecheck
	$(PY) -m pytest -q
demo: typecheck
	@echo "Demo components are delivered in order; see docs/progress/."
