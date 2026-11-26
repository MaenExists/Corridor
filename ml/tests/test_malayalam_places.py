from pathlib import Path

import pytest

from ml.data.malayalam_places import PLACES, locate_malayalam, nominatives, normalise

needs_places = pytest.mark.skipif(not Path(PLACES).exists(), reason="place list not built (make place-names)")


def test_case_endings_restore_the_plain_name():
    assert ("പാനൂർ", "case") in nominatives("പാനൂരിൽ")
    assert ("കൊല്ലം", "case") in nominatives("കൊല്ലത്ത്")
    assert ("ആലുവ", "case") in nominatives("ആലുവയിൽ")
    assert nominatives("ആന്ധ്രയിൽനിന്ന്") == []      # "from X" is an origin
    assert nominatives("ഓച്ചിറയിലേക്ക്") == []        # "to X" is a destination
    assert normalise("പാനൂര്‍ഇൽ").startswith("പാനൂർ")


@needs_places
def test_reads_datelines_and_locatives_but_not_residence_origin_or_districts():
    assert locate_malayalam("കണ്ണപുരം: വാഹനപരിശോധനക്കിടെ എം.ഡി.എം.എയുമായി രണ്ട് യുവാക്കൾ അറസ്റ്റിൽ.")["place"]
    text = "പാനൂരിൽ വീട് വാടകക്കെടുത്ത് കഞ്ചാവ് എത്തിച്ചുകൊടുക്കുകയായിരുന്നു"
    assert locate_malayalam(text) is None                   # Panoor is in two districts: no guess without a hint
    found = locate_malayalam(text, "Kannur")
    assert found["place"] == "Panoor" and found["via"] == "malayalam case"
    assert locate_malayalam("പയ്യന്നൂർ സ്വദേശി അറസ്റ്റിൽ") is None
    assert locate_malayalam("ആന്ധ്രയിൽ നിന്ന് കഞ്ചാവ് കടത്തി") is None
    assert locate_malayalam("മലപ്പുറത്ത് കഞ്ചാവ് പിടികൂടി") is None
