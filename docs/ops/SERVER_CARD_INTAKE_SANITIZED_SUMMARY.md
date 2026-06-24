# Server Card Intake Sanitized Summary

Date: 2026-06-23

## Intake Result

| Field | Value |
| --- | --- |
| server_card_received | true |
| source_file | `/Users/mac/phoenix-erp/docs/server-connection-card.md` |
| host included | yes, partially masked |
| SSH user included | yes, partially masked |
| SSH key / password included | key reference only, content not present |
| DB information included | yes, production DB reference only, password not printed |
| file storage information included | yes, production container volume reference only |
| production identifier included | yes |
| domain / port included | yes |
| deploy path included | yes, production path |

## Sanitized Server Facts

| Item | Sanitized Value | Classification |
| --- | --- | --- |
| public domain | `https://erp.eggslao.com` | production public endpoint |
| public host | `47.236.***.***` | production host, partially masked |
| hostname | `iZt4nj11ry11ofv03yi35vZ` | production host identifier |
| SSH user | `r***` | production deploy user |
| SSH port | `22` | production SSH port |
| SSH private key | `[REDACTED]` | GitHub Secret reference only |
| production deploy path | `/opt/phoenix-erp` | production path, not staging |
| production DB name | `phoenix_erp` | production DB reference only |
| production DB user/password | `[REDACTED]` | not printed |
| production file volume | `phoenix_uploads -> /app/uploads` | production upload volume, not staging |
| production workflow | `.github/workflows/deploy.yml` | push-main production path |

## Sensitive Information Redaction Rules

1. `host`: partially masked in docs unless already public domain is needed for classification.
2. `user`: partially masked.
3. `password`: `[REDACTED]`.
4. `private_key`: `[REDACTED]`.
5. `database_url`: `[REDACTED]`.
6. `token`: `[REDACTED]`.
7. Production DB credentials must not be copied into staging secrets.
8. Production file paths must not be reused as staging file storage.
9. The production deploy path must not be used as staging deploy path.

## A2 Sanitization Review

Conclusion: PASS WITH CONDITIONS.

- No password, private key, token, or full database URL is printed.
- Host is partially masked when treated as a credential-like deployment target.
- The production domain is kept only as a public endpoint identifier.
- The server card is explicitly classified as production-oriented.

