"""The desktop mod (plugins/owner-inbox) reads docs/OWNER-INBOX.md exactly as the page builder does
(owner_inbox_page.py): same entries, chats and choices (OWNER-INBOX #16)."""
import json
import os
import shutil
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import owner_inbox_page as page  # noqa: E402

JS = """
import { parseInbox } from %s;
import fs from "fs";
const es = parseInbox(fs.readFileSync(%s, "utf8"));
console.log(JSON.stringify(es.map((e) => ({ num: e.num, chat: e.chat, decides: e.decides, read: e.read }))));
"""


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class Mod(unittest.TestCase):
    def test_same_reading_as_the_page(self):
        mod = "file://" + os.path.join(ROOT, "plugins", "owner-inbox", "hooks", "register.js")
        out = subprocess.run(["node", "--input-type=module", "-e", JS % (json.dumps(mod), json.dumps(page.INBOX))],
                             capture_output=True, text=True, check=True).stdout
        got = json.loads(out)
        want = [{"num": e["num"], "chat": e["chat"], "decides": e["decides"], "read": e["read"]}
                for e in page.parse(open(page.INBOX, encoding="utf-8").read())["entries"]]
        self.assertEqual(got, want)


if __name__ == "__main__":
    unittest.main()
