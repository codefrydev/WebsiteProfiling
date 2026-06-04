# Security policy

## Supported versions

Security fixes are applied on the default branch (`master`). There are no long-term release branches yet.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead:

1. Contact the maintainers privately (GitHub private vulnerability report if enabled for this repo, or a direct message to the account listed in [LICENSE](LICENSE)).
2. Include a clear description, steps to reproduce, and impact if known.
3. Allow reasonable time for a fix before public disclosure.

We will acknowledge receipt and work on a fix as soon as practicable.

## Scope notes

Site Audit can crawl URLs and optionally run security checks. Users must only audit properties they own or have written permission to test. Do not use this tool against third-party sites without authorization.

If you find a vulnerability **in Site Audit itself** (e.g. remote code execution, SQL injection in APIs, auth bypass), report it privately as above.

## Safe defaults

- Run production deployments with strong `POSTGRES_PASSWORD` and `AUTH_SECRET` (see `docker-compose.prod.yml`).
- Do not commit `.env`, `data/.secrets/`, or OAuth client secrets.
