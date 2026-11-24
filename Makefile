PY := .venv/bin/python
.PHONY: setup test demo serve build typecheck synthetic evaluate real forecast refresh api feed release-real browser-test replay
setup:
	uv venv --allow-existing --python 3.12 .venv
	uv pip install --python $(PY) -r requirements.txt
	npm ci --no-audit --no-fund
synthetic:
	$(PY) -m ml.data.synthetic
evaluate:
	$(PY) -m ml.evaluate.run synthetic
replay:
	$(PY) -m ml.evaluate.replay
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
	./node_modules/.bin/tsc --noEmit
	$(PY) -c 'from shared.schema import Case, Forecast; print("Python contracts import")'
build:
	./node_modules/.bin/tsc --noEmit
	./node_modules/.bin/vite build --config web/vite.config.ts
test: typecheck
	$(PY) -m pytest -q
demo:
	$(MAKE) synthetic
	$(MAKE) evaluate
	$(MAKE) replay
	$(MAKE) forecast
	$(MAKE) serve
serve:
	@for name in cases_synthetic forecasts eval_report replay; do \
		test -s "web/public/generated/$$name.json" || { echo "Missing synthetic snapshot. Run make demo first."; exit 1; }; \
	done
	bash scripts/demo.sh
api:
	bash scripts/demo.sh --api-only
browser-test:
	node scripts/browser-smoke.mjs
