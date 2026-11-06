from app.money import individual_share
from app.security import codes_match, hash_code, is_allowed_email, new_otp


def test_only_thapar_addresses_pass():
    assert is_allowed_email("student@thapar.edu")
    assert is_allowed_email("first.last@thapar.edu")
    for bad in ["a+1@thapar.edu", "a@gmail.com", "a@thapar.edu.evil.com", "a@mail.thapar.edu", "a@@thapar.edu", "@thapar.edu", "a b@thapar.edu", "thapar.edu", ""]:
        assert not is_allowed_email(bad), bad


def test_otp_shape_and_hashing():
    code = new_otp()
    assert len(code) == 6 and code.isdigit()
    digest = hash_code("a@thapar.edu", code)
    assert codes_match("a@thapar.edu", code, digest)
    assert not codes_match("a@thapar.edu", "000000" if code != "000000" else "111111", digest)
    assert not codes_match("b@thapar.edu", code, digest)


def test_fare_split_rule():
    assert str(individual_share(600, 4)) == "150.00"
    assert str(individual_share(900, 3)) == "300.00"
    assert str(individual_share(100, 3)) == "33.33"
    assert str(individual_share(250, 1)) == "250.00"
