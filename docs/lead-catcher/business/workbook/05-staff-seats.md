DRAFT — for James's review. Not legal advice. Not published.

# Setup Workbook — Staff & seats

One row per person. Desk AIs can't hold a seat. Approver and Supervisor seats are set by the desk owner.  

| Name | Job title | Lead Catcher seat | Can press Yes? (auto) | Backup for | Sign-in set up? (yes/no) | Trained? (yes/no) |
|---|---|---|---|---|---|---|
| … | … | … | … | … | … | … |

(10 blank rows to fill in the .xlsx.)

`Can press Yes? (auto)` formula: `=IF(C="","",IF(OR(C="Desk Owner",C="Approver",C="Supervisor"),"Yes","No"))`

| Seat | Can press Yes / Stop | Can Kill | Can prepare and fix |
|---|---|---|---|
| Desk Owner | Yes | Yes | Yes |
| Approver | Yes | Yes | Yes |
| Supervisor | Yes | Yes | Yes |
| Responder | No | No | Yes |
| Technician | No | No | Edit details, set Waiting, record outcome only |
