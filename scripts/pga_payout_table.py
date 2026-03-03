"""
PGA Tour standard payout percentages by finishing position.

These are approximate percentages of the total purse for regular PGA Tour events.
Positions 1–70 receive prize money (top 65 + ties typically make the cut).
For positions beyond the table, payout is $0.

Tie handling: average the prize money across all tied positions.
  e.g. 3 players tied for T2 share the payouts for positions 2, 3, and 4.
"""

# Percentage of purse earned at each finishing position (1-indexed)
PAYOUT_PERCENTAGES = {
    1:  18.000,
    2:  10.900,
    3:   6.900,
    4:   4.900,
    5:   4.100,
    6:   3.625,
    7:   3.375,
    8:   3.125,
    9:   2.925,
    10:  2.725,
    11:  2.525,
    12:  2.325,
    13:  2.125,
    14:  1.975,
    15:  1.825,
    16:  1.675,
    17:  1.525,
    18:  1.425,
    19:  1.325,
    20:  1.225,
    21:  1.135,
    22:  1.055,
    23:  0.985,
    24:  0.935,
    25:  0.885,
    26:  0.835,
    27:  0.785,
    28:  0.735,
    29:  0.685,
    30:  0.635,
    31:  0.595,
    32:  0.555,
    33:  0.515,
    34:  0.475,
    35:  0.445,
    36:  0.415,
    37:  0.385,
    38:  0.355,
    39:  0.325,
    40:  0.295,
    41:  0.275,
    42:  0.255,
    43:  0.235,
    44:  0.215,
    45:  0.200,
    46:  0.190,
    47:  0.180,
    48:  0.172,
    49:  0.164,
    50:  0.156,
    51:  0.148,
    52:  0.142,
    53:  0.138,
    54:  0.134,
    55:  0.130,
    56:  0.126,
    57:  0.122,
    58:  0.119,
    59:  0.117,
    60:  0.116,
    61:  0.115,
    62:  0.114,
    63:  0.113,
    64:  0.112,
    65:  0.111,
}


def get_payout(position: int, tied_count: int, purse: float) -> int:
    """
    Calculate the estimated payout for a player finishing in a tie.

    Args:
        position:   The starting position of the tie group (e.g. 2 for players tied T2).
        tied_count: How many players are tied at this position.
        purse:      Total tournament purse in dollars.

    Returns:
        Estimated payout in dollars (rounded to nearest dollar), or 0 if outside payout range.
    """
    total_pct = 0.0
    for i in range(position, position + tied_count):
        total_pct += PAYOUT_PERCENTAGES.get(i, 0.0)

    if total_pct == 0:
        return 0

    return round((total_pct / 100) * purse / tied_count)
