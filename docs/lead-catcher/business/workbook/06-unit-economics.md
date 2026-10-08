DRAFT — for James's review. Not legal advice. Not published.

# Setup Workbook — Unit economics

DRAFT. Inputs are YOUR assumptions — fill the yellow cells. No market data is included.  
Prices are DRAFT pricing, not final, subject to James's approval and legal review.  

| Row | Item | Value | Unit | Type | How it's worked out |
|---|---|---|---|---|---|
| 7 | INPUTS |  |  |  |  |
| 8 | Setup price (DRAFT) | 1250 | $ | Draft price | DRAFT pricing, not final |
| 9 | Care Plan price per month (DRAFT) | 350 | $/month | Draft price | Optional; only with the client's explicit Yes |
| 10 | Your hours to do setup (configure, train) |  | hours | Assumption | Your estimate |
| 11 | Your support hours during the 60-day pilot |  | hours | Assumption | Included in setup |
| 12 | Cost of your time per hour |  | $/hour | Assumption | Your own figure |
| 13 | One-time third-party costs for setup |  | $ | Assumption | Only if AIA pays them |
| 14 | Care Plan hours per month |  | hours | Assumption | Your estimate |
| 15 | Third-party costs per month (if AIA pays) |  | $/month | Assumption | e.g. channel fees — open decision |
| 16 | Payment processing fee |  | % | Assumption | Enter as a decimal, e.g. 0.03 |
| 17 | Client opts in to Care Plan? (1 = yes, 0 = no) |  | 1/0 | Assumption | Opt-in only |
| 18 | Care Plan months in the first year |  | months | Assumption | After the 60-day pilot |
| 19 | RESULTS |  |  |  |  |
| 20 | Setup: total hours | `=B10+B11` | hours | Formula | setup hours + pilot hours |
| 21 | Setup: cost of your time | `=(B10+B11)*B12` | $ | Formula | total hours × cost per hour |
| 22 | Setup: processing fee | `=B8*B16` | $ | Formula | setup price × fee |
| 23 | Setup: margin | `=B8-(B10+B11)*B12-B13-B8*B16` | $ | Formula | price − time − third-party − fee |
| 24 | Setup: margin % | `=IF(B8=0,"",(B8-(B10+B11)*B12-B13-B8*B16)/B8)` | % | Formula | margin ÷ price |
| 25 | Setup: what you earn per hour | `=IF((B10+B11)=0,"",(B8-B13-B8*B16)/(B10+B11))` | $/hour | Formula | (price − third-party − fee) ÷ total hours |
| 26 | Care Plan: monthly cost | `=B14*B12+B15` | $/month | Formula | care hours × cost per hour + third-party |
| 27 | Care Plan: monthly margin | `=B9-B14*B12-B15-B9*B16` | $/month | Formula | price − cost − fee |
| 28 | Care Plan: most hours per month before losing money | `=IF(B12=0,"",(B9-B15-B9*B16)/B12)` | hours | Formula | (price − third-party − fee) ÷ cost per hour |
| 29 | First year: margin for this client | `=(B8-(B10+B11)*B12-B13-B8*B16)+B17*B18*(B9-B14*B12-B15-B9*B16)` | $ | Formula | setup margin + (opt-in × months × monthly margin) |

Yellow cells in the .xlsx are inputs (assumptions or draft prices). Blank inputs count as 0. Formulas refer to column B by row number.
