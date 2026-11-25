PY := .venv/bin/python
.PHONY: setup test demo serve build typecheck synthetic evaluate real forecast refresh api feed release-real browser-test replay challenge prepare-inputs prepare-research prepare-training train-annual train-boosting eval-counts monthly-forecast excise-history district-dev district-test
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
challenge:
	$(PY) -m ml.forecast.challenge
real:
	$(PY) -m ml.data.real_input
	$(PY) -m ml.evaluate.run real
release-real:
	$(PY) -m ml.evaluate.run real --release-existing
prepare-inputs:
	$(PY) -m ml.data.training_prep
	$(PY) -m ml.data.effort_prep
	$(PY) -m ml.data.evidence_prep
prepare-research: prepare-inputs
	$(PY) -m ml.train.effort_yield
prepare-training: prepare-inputs
	$(PY) -m ml.data.court_quality
	$(PY) -m ml.data.model_bundle
train-annual:
	$(PY) -m ml.train.annual_counts
train-boosting:
	$(PY) -m ml.train.count_boosting
eval-counts:
	$(PY) -m ml.evaluate.compare_counts
excise-history:
	$(PY) -m ml.data.excise_enforcement
district-dev:
	$(PY) -m ml.train.district_monthly --stage development
district-test:
	$(PY) -m ml.train.district_monthly --stage test
monthly-forecast:
	$(PY) -m ml.forecast.monthly_counts
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
	$(MAKE) challenge
	$(MAKE) serve
serve:
	@for name in cases_synthetic forecasts eval_report replay; do \
		test -s "web/public/generated/$$name.json" || { echo "Missing synthetic snapshot. Run make demo first."; exit 1; }; \
	done
	@if ! test -s web/public/generated/challenge.json; then $(MAKE) challenge; fi
	bash scripts/demo.sh
api:
	bash scripts/demo.sh --api-only
browser-test:
	node scripts/browser-smoke.mjs
