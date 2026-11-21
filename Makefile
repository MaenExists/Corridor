PY := .venv/bin/python
.PHONY: setup test demo typecheck synthetic evaluate real forecast refresh api feed release-real
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
release-real:
	$(PY) -m ml.evaluate.run real --release-existing
forecast:
	$(PY) -m ml.forecast.batch
refresh:
	$(PY) -m ml.forecast.batch --reviewed-cues
feed:
	$(PY) -m ml.collector.feed
typecheck:
	npm run typecheck
	$(PY) -c 'from shared.schema import Case, Forecast; print("Python contracts import")'
test: typecheck
	$(PY) -m pytest -q
demo: synthetic evaluate forecast
	bash scripts/demo.sh
api:
	bash scripts/demo.sh --api-only
