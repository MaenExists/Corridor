from ml.collector.feed import FIXTURES, find_duplicate, parse


def test_rss_atom_and_syndication():
    rss, atom = [list(parse(p.read_bytes())) for p in FIXTURES]
    assert len(rss) == len(atom) == 2
    assert all(r["synthetic"] for r in rss + atom)
    assert find_duplicate(atom[0], rss) == rss[0]["id"]
    assert find_duplicate(atom[1], rss) is None
