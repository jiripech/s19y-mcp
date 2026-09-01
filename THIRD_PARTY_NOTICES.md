# Third-Party Notices

This file lists the third-party components distributed with the
S19y MCP Server container image and their licenses, so that all
attribution and copyleft obligations are met.

## JavaScript / npm Dependencies

All runtime npm dependencies are permissive. There are **no** copyleft
(GPL/AGPL/LGPL) libraries in the npm dependency tree.

- `@modelcontextprotocol/sdk` -- MIT
- `@modelcontextprotocol/server-memory` -- MIT
- `express` -- MIT

**Note:** the npm dependency tree (about 120 packages) also includes
MIT, ISC, BSD-2-Clause, and BSD-3-Clause licensed packages. The
`@modelcontextprotocol` MCP project is transitioning new contributions
to Apache-2.0; existing MIT-licensed code remains MIT.

## Base Image: `node:current-alpine`

The container image is built on top of the Node.js Alpine Linux image.
The following components are bundled as separate programs by the image,
not combined with the S19y application code into a derivative work.

- **Node.js** -- MIT (permissive). Retain copyright notice.
- **musl libc** -- MIT (permissive). Retain copyright notice.
- **OpenSSL** -- Apache-2.0 (permissive). Retain notice; do not use
  "OpenSSL" to endorse derived products.
- **BusyBox** -- GPL-2.0 (copyleft). Source:
  <https://busybox.net/downloads/source/>
- **Alpine Linux distribution** -- GPL-2.0 (copyleft). Source:
  <https://gitlab.alpinelinux.org/alpine/aports>

### GPL-2.0 Source Offer

BusyBox and the Alpine Linux distribution are licensed under the GNU
General Public License, version 2 (GPL-2.0). They are separate programs
bundled by the base image and are not combined with this project's
application code. In accordance with GPL-2.0, full source code for
these components is available:

- BusyBox: <https://busybox.net/downloads/source/>
- Alpine Linux (aports):
  <https://gitlab.alpinelinux.org/alpine/aports>

License texts for GPL-2.0 components are available at
<https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>.

## License Texts

- MIT License: see [LICENSE](LICENSE) and
  <https://opensource.org/licenses/MIT>
- Apache-2.0: <https://www.apache.org/licenses/LICENSE-2.0>
- BSD-2-Clause / BSD-3-Clause:
  <https://opensource.org/licenses/BSD-2-Clause>,
  <https://opensource.org/licenses/BSD-3-Clause>
- ISC: <https://opensource.org/licenses/ISC>
- GPL-2.0:
  <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>

This notice is provided for compliance with the licenses of the
third-party components. It does not grant any rights beyond those
granted by the respective licenses.
