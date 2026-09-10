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

## Base Image: `node:current-bookworm`

The container image is built on top of the Node.js Debian Bookworm
image. The following components are bundled as separate programs by
the image, not combined with the S19y application code into a
derivative work.

- **Node.js** -- MIT (permissive). Retain copyright notice.
- **glibc** -- LGPL-2.1 (copyleft; linked dynamically). Source:
  <https://sourceware.org/glibc/>
- **OpenSSL** -- Apache-2.0 (permissive). Retain notice; do not use
  "OpenSSL" to endorse derived products.
- **Debian GNU/Linux distribution** -- GPL-2.0 (copyleft). Source:
  <https://www.debian.org/>
- **nginx** -- BSD-2-Clause (permissive). Retain copyright notice.
  Source: <https://nginx.org/>

### OpenSSL License / Copying

OpenSSL is licensed under the Apache-2.0, with the additional
"OpenSSL" branding restriction: you may not use the name "OpenSSL" to
endorse or promote products derived from this software without prior
written permission.

### Copyleft Note

glibc is licensed under the GNU Lesser General Public License, version
2.1 (LGPL-2.1). The S19y application and the bundled llama.cpp program
link against glibc dynamically; they are separate works. Full license
text and source information are available at
<https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html> and
<https://sourceware.org/glibc/>.

Debian, the distribution, is governed by the Debian Free Software
Guidelines; each package carries its own license. The base image is a
prebuilt artifact of <https://hub.docker.com/_/node>.

## License Texts

- MIT License: see [LICENSE](LICENSE) and
  <https://opensource.org/licenses/MIT>
- Apache-2.0: <https://www.apache.org/licenses/LICENSE-2.0>
- BSD-2-Clause / BSD-3-Clause:
  <https://opensource.org/licenses/BSD-2-Clause>,
  <https://opensource.org/licenses/BSD-3-Clause>
- nginx license (BSD-2-Clause variant):
  <https://nginx.org/LICENSE>
- ISC: <https://opensource.org/licenses/ISC>
- GPL-2.0:
  <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>
- LGPL-2.1:
  <https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html>

This notice is provided for compliance with the licenses of the
third-party components. It does not grant any rights beyond those
granted by the respective licenses.
