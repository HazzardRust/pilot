# Third-party notices

Pilot is by **HazzardRust** and is MIT-licensed; `LICENSE` is its own notice and the one
that covers everything written here.

Some of what it ships was copied from three MIT-licensed upstream projects rather than
depended on (ADR 0003), and MIT's one condition is that the notice travels with the
copy. All three are reproduced below in full, unaltered. Every copied file also carries a
provenance header naming its upstream, and `VENDOR.md` is the ledger of which file came
from where and what this project changed.

| What | Where it came from | Licence | Ledger |
| --- | --- | --- | --- |
| Eight methodology skills under `skills/` | mattpocock-skills 1.2.3, <https://github.com/mattpocock/mattpocock-skills> | MIT | [`vendor/methodology.md`](vendor/methodology.md) |
| Ten agents, six skills, a hook with the library it requires, and the language directories of `rules/` | ECC 2.2.0, <https://github.com/affaan-m/ECC> | MIT | [`vendor/toolbox.md`](vendor/toolbox.md) |
| The QA agent's taste checklist, `skills/design-review/SKILL.md` | claude-code-workflows at `6a65344`, <https://github.com/OneRedOak/claude-code-workflows> | MIT | [`vendor/taste.md`](vendor/taste.md) |

---

## mattpocock-skills

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ECC

```
MIT License

Copyright (c) 2026 Affaan Mustafa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## claude-code-workflows

```
MIT License

Copyright (c) 2025 Patrick Ellis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Dependencies fetched at run time

Neither of these is vendored, and neither is redistributed here; they are named because
a friend's machine downloads them and is entitled to know what it is running.

| Package | Licence | How it arrives |
| --- | --- | --- |
| `chrome-devtools-mcp@1.9.0` | Apache-2.0 | Declared in `.mcp.json` and fetched by `npx` when a session starts. Pinned rather than `@latest`, so a browser-driving dependency cannot change under the QA agent between runs (L7). |
| `@modelcontextprotocol/sdk@1.30.0` | MIT | The deck's one npm dependency, installed by `npm install --omit=dev` during the install (A3). |
