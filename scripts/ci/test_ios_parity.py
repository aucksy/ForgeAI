#!/usr/bin/env python3
"""Self-tests for the iPhone parity gate (scripts/ci/ios_parity.py). Each test builds a tiny fake
repo in a temp folder: one native module, an app.json, a manifest, a TS file.

Run: python3 -m unittest discover -s scripts/ci -p 'test_ios_parity.py'   (ci.yml runs it)
"""
import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:  # release-apk.yml runs every test_*.py on a runner that may not have pyyaml; ci.yml installs it
    import yaml
    import ios_parity as ip  # noqa: E402
except ImportError:  # pragma: no cover
    yaml = None
NO_YAML = unittest.skipIf(yaml is None, "pyyaml is not installed (ci.yml installs it and runs these)")

KOTLIN = """
class ForgeDemoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ForgeDemo")
    Events("onThing")
    Function("alpha") { 1 }
    AsyncFunction("beta") { p: Promise -> }
  }
}
"""

MANIFEST = """<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.VIBRATE"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" tools:node="remove"/>
</manifest>"""

GRADLE = "dependencies {\n  implementation 'com.example:lib:1.0'\n}\n"

FULL_COVERS = {
    "functions": ["forge-demo.alpha", "forge-demo.beta", "forge-demo.onThing"],
    "permissions": ["android.permission.VIBRATE", "android.permission.POST_NOTIFICATIONS"],
    "plugins": ["expo-router"],
    "app_json_android": ["package"],
    "gradle": ["com.example:lib"],
    "files": ["src/alerts.ts"],
}


class Repo:
    def __init__(self, tmp: Path):
        self.root = tmp
        self.mobile = tmp / "apps/mobile"
        self.write("apps/mobile/modules/forge-demo/android/src/main/java/ForgeDemoModule.kt", KOTLIN)
        self.write("apps/mobile/modules/forge-demo/android/src/main/AndroidManifest.xml", MANIFEST)
        self.write("apps/mobile/modules/forge-demo/android/build.gradle", GRADLE)
        self.write("apps/mobile/modules/forge-demo/expo-module.config.json", json.dumps({"platforms": ["android"]}))
        self.app_json({"package": "com.x", "permissions": ["android.permission.POST_NOTIFICATIONS"]}, ["expo-router"])
        self.write("apps/mobile/src/alerts.ts", "if (Platform.OS !== 'android') return null;\n")
        self.write("apps/mobile/src/shared.ts", "const pad = Platform.OS === 'ios' ? 12 : 8;\n")
        self.parity([self.feature()])

    def write(self, rel: str, text: str):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    def app_json(self, android: dict, plugins: list):
        self.write("apps/mobile/app.json", json.dumps({"expo": {"android": android, "plugins": plugins}}))

    @staticmethod
    def feature(**over):
        f = {"id": "demo", "android": "done", "ios": "todo", "reason": "Swift twin later.",
             "blocking": False, "covers": json.loads(json.dumps(FULL_COVERS))}
        f.update(over)
        return f

    def parity(self, features: list):
        self.write("docs/ios/PARITY.yaml", yaml.safe_dump({"features": features}))

    def check(self, release=False):
        return ip.check(self.root, release=release)


@NO_YAML
class ParityGateTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def assertError(self, errors, *needles):
        joined = "\n".join(errors)
        for n in needles:
            self.assertIn(n, joined)

    def test_fully_covered_repo_passes_and_lists_todo(self):
        errors, todos = self.repo.check()
        self.assertEqual(errors, [])
        self.assertEqual([t["id"] for t in todos], ["demo"])

    def test_new_kotlin_function_without_entry_fails(self):
        self.repo.write("apps/mobile/modules/forge-demo/android/src/main/java/ForgeDemoModule.kt",
                        KOTLIN.replace('Function("alpha")', 'Function("alpha") { 1 }\n    Function("gamma")'))
        errors, _ = self.repo.check()
        self.assertError(errors, "'forge-demo.gamma' has no iPhone twin")

    def test_swift_twin_counts_as_covered(self):
        self.repo.write("apps/mobile/modules/forge-demo/android/src/main/java/ForgeDemoModule.kt",
                        KOTLIN.replace('Function("alpha")', 'Function("alpha") { 1 }\n    Function("gamma")'))
        self.repo.write("apps/mobile/modules/forge-demo/ios/ForgeDemoModule.swift", 'Function("gamma") { 1 }\n')
        self.repo.write("apps/mobile/modules/forge-demo/expo-module.config.json", json.dumps({"platforms": ["android", "apple"]}))
        errors, _ = self.repo.check()
        self.assertEqual(errors, [])

    def test_ios_folder_without_platform_fails(self):
        self.repo.write("apps/mobile/modules/forge-demo/ios/ForgeDemoModule.swift", 'Function("alpha") { 1 }\n')
        errors, _ = self.repo.check()
        self.assertError(errors, "lists neither 'ios' nor 'apple'")

    def test_ios_done_needs_the_swift_function(self):
        self.repo.parity([self.repo.feature(ios="done")])
        errors, _ = self.repo.check()
        self.assertError(errors, "says ios: done but modules/forge-demo/ios has no 'alpha'")

    def test_new_android_permission_in_app_json_fails(self):
        self.repo.app_json({"package": "com.x", "permissions": ["android.permission.POST_NOTIFICATIONS",
                                                                "android.permission.CAMERA"]}, ["expo-router"])
        errors, _ = self.repo.check()
        self.assertError(errors, "'android.permission.CAMERA' has no iPhone twin")

    def test_removed_manifest_permission_is_ignored(self):
        errors, _ = self.repo.check()
        self.assertNotIn("FOREGROUND_SERVICE", "\n".join(errors))

    def test_new_plugin_and_android_key_fail(self):
        self.repo.app_json({"package": "com.x", "intentFilters": [],
                            "permissions": ["android.permission.POST_NOTIFICATIONS"]}, ["expo-router", ["expo-camera", {}]])
        errors, _ = self.repo.check()
        self.assertError(errors, "'expo-camera' has no iPhone twin", "'intentFilters' has no iPhone twin")

    def test_new_gradle_dependency_fails(self):
        self.repo.write("apps/mobile/modules/forge-demo/android/build.gradle", GRADLE + "dependencies { implementation \"com.new:thing:2.0\" }\n")
        errors, _ = self.repo.check()
        self.assertError(errors, "'com.new:thing' has no iPhone twin")

    def test_new_android_switch_or_back_button_in_ts_fails(self):
        self.repo.write("apps/mobile/src/back.tsx", "BackHandler.addEventListener('hardwareBackPress', f);\n")
        self.repo.write("apps/mobile/src/flip.ts", "if ('android' === Platform.OS) go();\n")
        errors, _ = self.repo.check()
        self.assertError(errors, "'src/back.tsx'", "'src/flip.ts'")
        self.assertNotIn("src/shared.ts", "\n".join(errors))

    def test_wear_app_needs_an_entry(self):
        self.repo.write("apps/mobile/android/wear/build.gradle", "")
        errors, _ = self.repo.check()
        self.assertError(errors, "'android/wear' has no iPhone twin")

    def test_stale_line_fails(self):
        f = self.repo.feature()
        f["covers"]["functions"].append("forge-demo.removedLongAgo")
        self.repo.parity([f])
        errors, _ = self.repo.check()
        self.assertError(errors, "'forge-demo.removedLongAgo' no longer exists on disk")

    def test_bad_status_missing_reason_duplicate_and_unknown_kind(self):
        a = self.repo.feature(ios="maybe")
        b = self.repo.feature(reason="", covers={"functions": ["forge-demo.alpha"], "colours": ["x"]})
        self.repo.parity([a, b])
        errors, _ = self.repo.check()
        self.assertError(errors, "must be one of done / n-a / todo", "needs a reason", "is used twice",
                         "unknown covers kind 'colours'", "listed under both")

    def test_release_refuses_blocking_todo(self):
        self.repo.parity([self.repo.feature(blocking=True)])
        self.assertEqual(self.repo.check()[0], [])
        errors, _ = self.repo.check(release=True)
        self.assertError(errors, "blocking: true, so no release")

    def test_missing_manifest_fails(self):
        (self.repo.root / "docs/ios/PARITY.yaml").unlink()
        errors, _ = self.repo.check()
        self.assertError(errors, "PARITY.yaml is missing")


@NO_YAML
class RealRepoTest(unittest.TestCase):
    def test_this_repo_passes(self):
        root = Path(__file__).resolve().parents[2]
        errors, _ = ip.check(root)
        self.assertEqual(errors, [], textwrap.indent("\n".join(errors), "  "))


if __name__ == "__main__":
    unittest.main()
