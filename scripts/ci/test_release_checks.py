#!/usr/bin/env python3
"""Self-tests for the release checks' signing / version logic and the update proof's parsers.

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (release-apk.yml runs it)

The apksigner / dumpsys outputs below are SYNTHETIC text in the documented formats. The only real
digests are the two public ones: the React Native debug key and the ForgeAI release key's
certificate. Every other digest is an obvious fake (repeated digits).
"""
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import release_checks as rc  # noqa: E402
import update_proof as up  # noqa: E402

DEBUG = rc.PUBLIC_DEBUG_KEY
NEW = "B2:B0:C2:11:5C:A2:13:62:D4:EB:50:C0:70:97:5C:74:8E:2E:9B:37:93:DC:87:32:53:17:43:B5:2D:85:75:B2"
NEW_HEX = NEW.lower().replace(":", "")
FAKE = "11" * 32  # a key that is neither


def verify_out(signers, v1=True, v2=True, v3=False, v31=False, label="Signer #{n}"):
    lines = ["Verifies",
             f"Verified using v1 scheme (JAR signing): {str(v1).lower()}",
             f"Verified using v2 scheme (APK Signature Scheme v2): {str(v2).lower()}",
             f"Verified using v3 scheme (APK Signature Scheme v3): {str(v3).lower()}",
             f"Verified using v3.1 scheme (APK Signature Scheme v3.1): {str(v31).lower()}",
             "Verified using v4 scheme (APK Signature Scheme v4): false",
             "Verified for SourceStamp: false",
             f"Number of signers: {len(signers)}"]
    for i, d in enumerate(signers, 1):
        name = label.format(n=i)
        lines += [f"{name} certificate DN: CN=Synthetic",
                  f"{name} certificate SHA-256 digest: {d}",
                  f"{name} certificate SHA-1 digest: {'22' * 20}",
                  f"{name} key algorithm: RSA"]
    lines.append("WARNING: META-INF/com/android/build/gradle/app-metadata.properties not protected by signature.")
    return "\n".join(lines) + "\n"


def lineage_out(chain):
    lines = []
    for i, d in enumerate(chain, 1):
        lines += [f"Signer #{i} in lineage certificate DN: CN=Synthetic",
                  f"Signer #{i} in lineage certificate SHA-256 digest: {d}",
                  "Has installed data capability: true"]
    return "\n".join(lines) + "\n"


ROTATED = dict(
    full=verify_out([NEW_HEX], v3=True),
    old_range=verify_out([DEBUG]),
    new_range=verify_out([NEW_HEX], v3=True),
    lineage=lineage_out([DEBUG, NEW_HEX]),
)


def levels(res):
    return [lvl for lvl, _ in res]


class SigningTests(unittest.TestCase):
    allowed = {NEW_HEX}

    def ev(self, full, old_range, new_range, lineage, allowed=None, min_sdk=24, transition=True):
        return rc.evaluate_signing(full, old_range, new_range, lineage,
                                   self.allowed if allowed is None else allowed, min_sdk, transition)

    def test_rotated_apk_passes(self):
        res = self.ev(**ROTATED)
        self.assertNotIn("FAIL", levels(res), res)
        self.assertEqual(levels(res).count("PASS"), 3)

    def test_colon_digests_are_normalised(self):
        res = self.ev(ROTATED["full"], ROTATED["old_range"], verify_out([NEW], v3=True),
                      lineage_out([DEBUG, NEW]))
        self.assertNotIn("FAIL", levels(res), res)

    def test_debug_only_fails_when_release_key_is_expected(self):
        d = verify_out([DEBUG])
        res = self.ev(d, d, d, "")
        self.assertIn("FAIL", levels(res))
        self.assertTrue(any("did not run" in t for _, t in res), res)

    def test_new_key_only_fails_it_would_break_every_installed_copy(self):
        d = verify_out([NEW_HEX], v3=True)
        res = self.ev(d, verify_out([NEW_HEX]), d, "")
        self.assertIn("FAIL", levels(res))
        self.assertTrue(any("NEW key only" in t for _, t in res), res)

    def test_rotation_without_lineage_fails(self):
        res = self.ev(ROTATED["full"], ROTATED["old_range"], ROTATED["new_range"], "")
        self.assertEqual(levels(res), ["FAIL"])

    def test_lineage_must_start_at_the_debug_key(self):
        res = self.ev(ROTATED["full"], ROTATED["old_range"], ROTATED["new_range"], lineage_out([FAKE, NEW_HEX]))
        self.assertIn("FAIL", levels(res))

    def test_unknown_v3_key_fails(self):
        res = self.ev(verify_out([FAKE], v3=True), ROTATED["old_range"], verify_out([FAKE], v3=True),
                      lineage_out([DEBUG, FAKE]))
        self.assertIn("FAIL", levels(res))

    def test_debug_key_in_the_allow_list_does_not_make_debug_only_pass(self):
        d = verify_out([DEBUG])
        res = self.ev(d, d, d, "", allowed={NEW_HEX, DEBUG})
        self.assertIn("FAIL", levels(res))

    def test_both_signers_in_v2_fails(self):
        # Two --next-signer signers WITHOUT a lineage sign v2 with both keys: old phones refuse it.
        res = self.ev(ROTATED["full"], verify_out([DEBUG, NEW_HEX]), ROTATED["new_range"], ROTATED["lineage"])
        self.assertIn("FAIL", levels(res))

    def test_unset_allow_list_only_warns_about_the_debug_key(self):
        d = verify_out([DEBUG])
        res = self.ev(d, d, d, "", allowed=set())
        self.assertNotIn("FAIL", levels(res))
        self.assertIn("WARN", levels(res))
        self.assertTrue(any("rotation did not run" in t for _, t in res), res)

    def test_v31_style_labels_are_filtered_by_api_range(self):
        out = verify_out([DEBUG], label="V3 Signer (minSdkVersion=24, maxSdkVersion=27)") + \
            verify_out([NEW_HEX], label="V3.1 Signer (minSdkVersion=28, maxSdkVersion=2147483647)")
        self.assertEqual(rc.digests_for_range(out, 0, 27), [DEBUG])
        self.assertEqual(rc.digests_for_range(out, 28, 1 << 31), [NEW_HEX])

    def test_min_sdk_28_needs_only_the_allowed_v3_key(self):
        res = self.ev(ROTATED["full"], None, ROTATED["new_range"], ROTATED["lineage"], min_sdk=28)
        self.assertEqual(levels(res), ["PASS"])

    def test_after_the_transition_every_signer_must_be_allowed(self):
        res = self.ev(verify_out([DEBUG, NEW_HEX]), None, ROTATED["new_range"], "", transition=False)
        self.assertEqual(levels(res), ["FAIL"])
        res = self.ev(verify_out([NEW_HEX]), None, verify_out([NEW_HEX]), "", transition=False)
        self.assertEqual(levels(res), ["PASS"])

    def test_schemes_parse(self):
        self.assertEqual(rc.parse_schemes(ROTATED["new_range"])["v3"], True)
        self.assertEqual(rc.parse_schemes(ROTATED["old_range"])["v3"], False)


class VersionCodeTests(unittest.TestCase):
    def test_formula(self):
        self.assertEqual(rc.version_code_for("0.33.0"), 33000)
        self.assertEqual(rc.version_code_for("v0.32.0"), 32000)
        self.assertEqual(rc.version_code_for("1.2.3"), 1002003)
        self.assertEqual(rc.version_code_for("0.32.0-dryrun.46"), 32000)

    def test_new_scheme_is_above_every_run_number_code(self):
        # v0.31.0 was published with versionCode 45 (release workflow run #45).
        self.assertGreater(rc.version_code_for("0.32.0"), rc.LEGACY_MAX_VERSION_CODE)
        self.assertGreater(rc.version_code_for("0.31.1"), rc.LEGACY_MAX_VERSION_CODE)

    def test_order_follows_semver(self):
        vs = ["0.9.9", "0.10.0", "0.10.1", "0.99.999", "1.0.0", "1.0.1", "2.0.0"]
        codes = [rc.version_code_for(v) for v in vs]
        self.assertEqual(codes, sorted(codes))
        self.assertEqual(len(set(codes)), len(codes))

    def test_rejects(self):
        for bad in ("main", "0.1", "0.1000.0", "0.1.1000", "0.33.0-rc1", ""):
            with self.assertRaises(ValueError, msg=bad):
                rc.version_code_for(bad)


# ------------------------------------------------------------ update_proof parsers

def _lp(b):
    return struct.pack("<I", len(b)) + b


def _seq(*items):
    return _lp(b"".join(_lp(i) for i in items))


def _v2_signer(cert):
    signed = _seq(b"digest") + _seq(cert) + _lp(b"")
    return _lp(signed) + _seq(b"sig") + _lp(b"pubkey")


def _v3_signer(cert, lo, hi):
    signed = _seq(b"digest") + _seq(cert) + struct.pack("<II", lo, hi) + _lp(b"")
    return _lp(signed) + struct.pack("<II", lo, hi) + _seq(b"sig") + _lp(b"pubkey")


def synthetic_apk(pairs):
    body = b"".join(struct.pack("<QI", len(v) + 4, k) + v for k, v in pairs.items())
    size = len(body) + 8 + 16
    block = struct.pack("<Q", size) + body + struct.pack("<Q", size) + up.APK_SIG_BLOCK_MAGIC
    head = b"PK\x03\x04" + b"\0" * 60
    cd = b"PK\x01\x02" + b"\0" * 42
    cd_off = len(head) + len(block)
    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1, 1, len(cd), cd_off, 0)
    return head + block + cd + eocd


OLD_CERT, NEW_CERT = b"\x30\x82old-debug-cert", b"\x30\x82new-release-cert\xff\x80"


class UpdateProofTests(unittest.TestCase):
    def test_signing_block_parse_and_cert_choice(self):
        apk = synthetic_apk({
            up.V2_ID: _lp(_lp(_v2_signer(OLD_CERT))),
            up.V3_ID: _lp(_lp(_v3_signer(OLD_CERT, 24, 27)) + _lp(_v3_signer(NEW_CERT, 28, 0x7FFFFFFF))),
        })
        sig = up.signers(apk)
        self.assertEqual([s[0] for s in sig], ["v2", "v3", "v3"])
        self.assertEqual(up.cert_for(apk, 26), ("v2", OLD_CERT))  # Android 8 never reads v3
        self.assertEqual(up.cert_for(apk, 34), ("v3", NEW_CERT))
        self.assertEqual(up.cert_for(apk, 28), ("v3", NEW_CERT))

    def test_apk_without_signing_block(self):
        cd = b"PK\x01\x02" + b"\0" * 42
        eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1, 1, len(cd), 64, 0)
        self.assertEqual(up.signers(b"\0" * 64 + cd + eocd), [])

    def test_java_hash_matches_arrays_hashcode(self):
        # Arrays.hashCode(new byte[]{1, 2, -1}) = ((31 + 1) * 31 + 2) * 31 - 1 = 30813 = 0x785d
        self.assertEqual(up.java_hash_hex(bytes([1, 2, 0xFF])), "785d")

        def ref(b):  # independent signed-int32 implementation
            h = 1
            for x in b:
                x = x - 256 if x > 127 else x
                h = (h * 31 + x)
                h = (h + 2 ** 31) % 2 ** 32 - 2 ** 31
            return format(h & 0xFFFFFFFF, "x")
        for sample in (NEW_CERT, bytes(range(256)) * 7, b"\x80" * 33):
            self.assertEqual(up.java_hash_hex(sample), ref(sample))

    def test_parse_dumpsys(self):
        text = """Packages:
  Package [com.forgeai.app] (a1b2c3):
    userId=10190
    versionCode=33000 minSdk=24 targetSdk=36
    versionName=0.33.0
    signatures=PackageSignatures{9f8e7d version:3, signatures:[1a2b3c4d], past signatures:[5e6f7a8b flags: 17, 1a2b3c4d flags: 17]}
    firstInstallTime=2026-10-11 10:00:00
    lastUpdateTime=2026-10-11 10:05:00
    User 0: ceDataInode=1234 installed=true hidden=false
      firstInstallTime=2026-10-11 10:00:00
"""
        d = up.parse_dumpsys(text)
        self.assertEqual(d["versionName"], "0.33.0")
        self.assertEqual(d["versionCode"], 33000)
        self.assertEqual(d["sigVersion"], 3)
        self.assertEqual(d["signatures"], ["1a2b3c4d"])
        self.assertEqual(d["pastSignatures"], ["5e6f7a8b", "1a2b3c4d"])
        self.assertEqual(d["firstInstallTime"], ["2026-10-11 10:00:00", "2026-10-11 10:00:00"])

    def test_parse_dumpsys_without_history(self):
        text = "    signatures=PackageSignatures{9f8e7d version:2, signatures:[5e6f7a8b], past signatures:[]}\n"
        d = up.parse_dumpsys(text)
        self.assertEqual(d["signatures"], ["5e6f7a8b"])
        self.assertEqual(d["pastSignatures"], [])


if __name__ == "__main__":
    unittest.main()
