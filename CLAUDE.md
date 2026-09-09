# Sertis QA Take-Home

Deliverable for a QA take-home test with three exercises: test planning and automated `@e2e` coverage of demoblaze, `@api` coverage of the local server in `api-main/`, and a CI pipeline running both.

`api-main/` is a **read-only system under test**. Do not modify it, including to fix the defects it contains.

Tests assert intended behaviour, not observed behaviour. Where a system violates its own specification the test fails by design, carries its defect id in its title, and resolves to an entry in `docs/defects.md`.
