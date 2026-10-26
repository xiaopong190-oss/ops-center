# Import supplier confirmation

Requested by the user: confirm the supplier even when recognition succeeds, because operators may enter a different name for the same company.

The intake UI requires explicit confirmation of the selected company before workbook cleaning, block cleaning or forwarding to standard validation. Confirmation is scoped to the current workbook object, company ID and exact canonical name. New uploads and changes to the selection or name require confirmation again. Existing company selections use their archive name; unmatched names are clearly described as new companies. Operators should select an existing archive when only the name differs.

The extension does not infer aliases, merge companies, rename archives or write business data. Existing explicit archive creation and downstream import validation remain unchanged. Locked default modules and manifest hashes are unchanged. Rollback removes the intake mount parameters and the supplier-confirmation script reference.

Validation: full logistics Node regression suite; real quotes.html JSDOM tests for existing supplier controls and for confirmation blocking/allowing across file, name and selection changes. No production release is included.
