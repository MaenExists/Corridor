from sklearn.ensemble import HistGradientBoostingRegressor
from threadpoolctl import threadpool_limits

METHODS = ("poisson_gbm", "last_56_days", "seasonal_naive", "same_period_last_year")


def fit(rows):
    if len(rows) < 60 or sum(r["actual"] for r in rows) < 15:
        return None
    model = HistGradientBoostingRegressor(loss="poisson", max_iter=64, max_leaf_nodes=12,
                                           learning_rate=.065, min_samples_leaf=20,
                                           l2_regularization=4, early_stopping=False, random_state=1729)
    with threadpool_limits(limits=2):
        return model.fit([r["x"] for r in rows], [r["actual"] for r in rows])


def predict(model, rows):
    if model is None:
        return [None] * len(rows)
    if not rows:
        return []
    with threadpool_limits(limits=2):
        return model.predict([r["x"] for r in rows]).tolist()
