"""Write ../tests/fixture.json: synthetic prices + metrics computed by this Python package.
The TypeScript test suite asserts the web app produces the same numbers."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from nordic_screener.metrics import compute_metrics  # noqa: E402
from test_metrics import synthetic  # noqa: E402

prices, bench = synthetic()
p = prices["A"]
fixture = {
    "dates": [d.strftime("%Y-%m-%d") for d in p.index],
    "prices": p.round(6).tolist(),
    "benchmark": bench.round(6).tolist(),
    "rf": 0.02,
}
import pandas as pd  # noqa: E402
idx = pd.to_datetime(fixture["dates"])
fixture["expected"] = compute_metrics(pd.Series(fixture["prices"], index=idx), pd.Series(fixture["benchmark"], index=idx), 0.02)
out = Path(__file__).resolve().parents[2] / "tests" / "fixture.json"
out.write_text(json.dumps(fixture))
print("wrote", out, fixture["expected"])
