# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret**: GeoSphere Austria needs no account and no key, the configuration holds none.
- **The position of a Gladys house** (the `location` permission of the manifest): read from Gladys,
  sent only to GeoSphere Austria (`dataset.api.hub.geosphere.at`, `warnungen.zamg.at`) over HTTPS
  to get the forecast and the warnings of the place, rounded to 4 decimals. It is never written to
  the logs nor to `/data`.
- **`/data/state.json`**: the identifiers, levels and end times of the warnings already announced
  to the scenes. Nothing personal.
- **Network**: outbound HTTPS GET requests to the two GeoSphere hosts above, nothing inbound.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)), and the GeoSphere
Austria services.
