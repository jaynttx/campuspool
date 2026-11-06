from decimal import ROUND_HALF_UP, Decimal


def money(value: float | Decimal | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def individual_share(actual_fare: float | Decimal, participants: int) -> Decimal:
    """Individual share = actual fare / number of participants (creator included)."""
    return money(Decimal(str(actual_fare)) / Decimal(max(1, participants)))
